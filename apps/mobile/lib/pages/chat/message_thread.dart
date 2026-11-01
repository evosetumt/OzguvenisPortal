import 'dart:async';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/realtime.dart';
import '../../core/theme.dart';
import '../../models/chat.dart';
import '../../widgets/glass.dart';
import '../calls/call_controller.dart';
import 'attachment_view.dart';
import 'composer.dart';
import 'format.dart';

const _page = 40;

/// Web MessageThread: üstte başlık (sesli/görüntülü ara, grup bilgisi), ortada mesajlar (en alta yapışık,
/// yukarı kaydırınca eskiler), altta yazma alanı. Socket: message:new, message:updated, typing.
class MessageThread extends StatefulWidget {
  const MessageThread({super.key, required this.conversation, required this.meId, required this.onBack, required this.onInfo});
  final Conversation conversation;
  final int meId;
  final VoidCallback onBack, onInfo;
  @override
  State<MessageThread> createState() => _MessageThreadState();
}

class _MessageThreadState extends State<MessageThread> with SocketEvents, WidgetsBindingObserver {
  List<ChatMessage> messages = []; // eskiden yeniye
  bool hasMore = true, loading = true;
  String error = '';
  final typing = <int, int>{}; // userId -> zaman (ms)
  final scroll = ScrollController();
  Timer? typingTimer;

  Conversation get c => widget.conversation;
  int get cid => c.id;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    scroll.addListener(() {
      if (scroll.hasClients && scroll.position.pixels > scroll.position.maxScrollExtent - 120) loadOlder();
    });
    onSocket('connect', (_) => loadLatest());
    onSocket('message:new', (d) {
      final m = ChatMessage.fromJson(Map<String, dynamic>.from(d as Map));
      if (m.conversationId != cid) return;
      setState(() {
        if (!messages.any((x) => x.id == m.id)) messages = [...messages, m];
        typing.remove(m.senderId);
      });
      if (m.senderId != widget.meId) markRead(m.id);
    });
    onSocket('message:updated', (d) {
      final m = ChatMessage.fromJson(Map<String, dynamic>.from(d as Map));
      if (m.conversationId == cid) setState(() => messages = [for (final x in messages) x.id == m.id ? m : x]);
    });
    onSocket('typing', (d) {
      if (d is Map && d['conversationId'] == cid) setState(() => typing[(d['userId'] as num).toInt()] = DateTime.now().millisecondsSinceEpoch);
    });
    typingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final now = DateTime.now().millisecondsSinceEpoch;
      if (typing.values.any((at) => now - at >= 4000)) setState(() => typing.removeWhere((_, at) => now - at >= 4000));
    });
    loadLatest();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) markRead();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    typingTimer?.cancel();
    scroll.dispose();
    super.dispose();
  }

  void markRead([int? messageId]) {
    if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused) return;
    Api.i.post('/chat/conversations/$cid/read', messageId != null ? {'messageId': messageId} : {}).catchError((_) {});
  }

  List<ChatMessage> _decode(dynamic j) => [for (final e in j as List) ChatMessage.fromJson(e as Map<String, dynamic>)];

  Future<void> loadLatest() async {
    setState(() => loading = true);
    try {
      final rows = _decode(await Api.i.get('/chat/conversations/$cid/messages?take=$_page'));
      if (!mounted) return;
      setState(() { messages = rows.reversed.toList(); hasMore = rows.length == _page; error = ''; });
      markRead();
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Mesajlar yüklenemedi');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> loadOlder() async {
    if (!hasMore || loading || messages.isEmpty) return;
    setState(() => loading = true);
    try {
      final rows = _decode(await Api.i.get('/chat/conversations/$cid/messages?take=$_page&before=${messages.first.id}'));
      if (mounted) setState(() { messages = [...rows.reversed, ...messages]; hasMore = rows.length == _page; });
    } catch (_) {/* sonraki kaydırmada yeniden dener */} finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> startCall(String kind) async {
    try { await callsOf(context, listen: false)!.startCall(cid, kind); } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : '$e'.replaceFirst('Exception: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final calls = callsOf(context);
    final typingNames = [for (final id in typing.keys) c.members.where((m) => m.id == id).firstOrNull?.fullName.split(' ').first].whereType<String>().toList();
    // Birebir sohbette "okundu" göstergesi: karşı tarafın okundu imleci.
    final other = c.isGroup ? null : c.members.where((m) => m.id != widget.meId).firstOrNull;
    final lastMine = messages.where((m) => m.senderId == widget.meId && m.deletedAt == null).lastOrNull;
    final rev = messages.reversed.toList();

    return Glass(
      radius: 24,
      child: Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(4, 8, 8, 8), child: Row(children: [
          IconButton(tooltip: 'Geri', onPressed: widget.onBack, icon: Icon(LucideIcons.arrowLeft, size: 20, color: t.text)),
          _Av(c.isGroup ? '#' : initials(conversationTitle(c, widget.meId)), 38),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(conversationTitle(c, widget.meId), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: t.text)),
            Text(typingNames.isNotEmpty ? '${typingNames.join(', ')} yazıyor…' : c.isGroup ? '${c.members.length} üye' : 'Birebir sohbet', style: TextStyle(fontSize: 12.5, color: t.text2)),
          ])),
          if (calls != null) ...[
            IconButton(tooltip: 'Sesli ara', onPressed: calls.active != null ? null : () => startCall('audio'), icon: Icon(LucideIcons.phone, size: 20, color: t.text)),
            IconButton(tooltip: 'Görüntülü ara', onPressed: calls.active != null ? null : () => startCall('video'), icon: Icon(LucideIcons.video, size: 20, color: t.text)),
          ],
          if (c.isGroup) IconButton(tooltip: 'Grup bilgisi', onPressed: widget.onInfo, icon: Icon(LucideIcons.info, size: 20, color: t.text)),
        ])),
        Divider(height: 1, color: t.sep),
        Expanded(child: messages.isEmpty
            ? Center(child: loading ? const CircularProgressIndicator() : Text(error.isEmpty ? 'Henüz mesaj yok. İlk mesajı yazın.' : '', style: TextStyle(color: t.text2)))
            : ListView.builder(
                controller: scroll, reverse: true, padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                itemCount: rev.length + (hasMore ? 1 : 0),
                itemBuilder: (ctx, i) {
                  if (i == rev.length) return Padding(padding: const EdgeInsets.all(8), child: Center(child: loading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : TextButton(onPressed: loadOlder, child: const Text('Daha eski mesajlar'))));
                  final m = rev[i];
                  final prev = i + 1 < rev.length ? rev[i + 1] : null;
                  final newDay = prev == null || !_sameDay(parseDt(prev.createdAt), parseDt(m.createdAt));
                  final grouped = !newDay && prev.senderId == m.senderId && parseDt(m.createdAt).difference(parseDt(prev.createdAt)).inMinutes < 5;
                  return Column(children: [
                    if (newDay) Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(DateFormat('EEEE, d MMMM', 'tr_TR').format(parseDt(m.createdAt)), style: TextStyle(fontSize: 12.5, color: t.text2, fontWeight: FontWeight.w600))),
                    Bubble(key: ValueKey(m.id), m: m, mine: m.senderId == widget.meId, showName: c.isGroup && !grouped && m.senderId != widget.meId,
                        read: other != null && m.id == lastMine?.id && (other.lastReadMessageId ?? 0) >= m.id),
                  ]);
                },
              )),
        if (error.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: Text(error, style: TextStyle(color: t.danger, fontSize: 13))),
        Composer(key: ValueKey(cid), conversationId: cid, onError: (s) => setState(() => error = s)),
      ]),
    );
  }

  bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;
}

class _Av extends StatelessWidget {
  const _Av(this.text, this.size);
  final String text;
  final double size;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Container(width: size, height: size, alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color.lerp(t.accent, Colors.white, .3)!, t.accent])),
        child: Text(text, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * .36)));
  }
}

/// Mesaj baloncuğu: dokununca (kendi mesajıysa) düzenle/sil araçları açılır.
class Bubble extends StatefulWidget {
  const Bubble({super.key, required this.m, required this.mine, required this.showName, required this.read});
  final ChatMessage m;
  final bool mine, showName, read;
  @override
  State<Bubble> createState() => _BubbleState();
}

class _BubbleState extends State<Bubble> {
  bool editing = false, tools = false;
  String err = '';
  late final text = TextEditingController(text: widget.m.body);
  final _taps = <TapGestureRecognizer>[];

  ChatMessage get m => widget.m;
  // Arama özeti ("📞 Sesli arama · 3 dk") sistem kaydıdır: düzenlenmez, silinmez.
  bool get editable => widget.mine && m.deletedAt == null && m.callId == null;

  @override
  void dispose() {
    for (final r in _taps) { r.dispose(); }
    text.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (text.text.trim().isEmpty || text.text == m.body) { setState(() => editing = false); return; }
    try { await Api.i.patch('/chat/messages/${m.id}', {'body': text.text}); if (mounted) setState(() => editing = false); } catch (e) {
      if (mounted) setState(() => err = e is ApiError ? e.message : 'Kaydedilemedi');
    }
  }

  Future<void> remove() async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      content: const Text('Mesaj silinsin mi?'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sil'))],
    ));
    if (ok != true) return;
    try { await Api.i.delete('/chat/messages/${m.id}'); } catch (e) { if (mounted) setState(() => err = e is ApiError ? e.message : 'Silinemedi'); }
  }

  /// Metindeki portal toplantı bağlantılarını tıklanabilir yapar.
  List<InlineSpan> renderBody(String body, Color color, Color link) {
    for (final r in _taps) { r.dispose(); }
    _taps.clear();
    final out = <InlineSpan>[];
    var last = 0;
    for (final mt in RegExp(r'/meetings\?id=\d+').allMatches(body)) {
      if (mt.start > last) out.add(TextSpan(text: body.substring(last, mt.start)));
      final path = mt.group(0)!;
      final rec = TapGestureRecognizer()..onTap = () => GoRouter.maybeOf(context)?.go('$path&join=1');
      _taps.add(rec);
      out.add(TextSpan(text: 'Toplantıya katıl', style: TextStyle(color: link, decoration: TextDecoration.underline, fontWeight: FontWeight.w600), recognizer: rec));
      last = mt.end;
    }
    if (last < body.length) out.add(TextSpan(text: body.substring(last)));
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final mine = widget.mine;
    final bg = mine ? t.accent : t.fill;
    final fg = mine ? Colors.white : t.text;
    final sub = mine ? Colors.white70 : t.text2;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        GestureDetector(
          onTap: () { if (editable && !editing) setState(() => tools = !tools); },
          child: Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .78),
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (widget.showName) Text(m.sender.fullName, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: t.accent)),
              if (m.deletedAt != null) Text('Bu mesaj silindi', style: TextStyle(fontStyle: FontStyle.italic, color: sub))
              else if (editing) SizedBox(width: 240, child: Column(children: [
                TextField(controller: text, minLines: 1, maxLines: 5, maxLength: 4000, autofocus: true, style: TextStyle(color: fg), decoration: const InputDecoration(counterText: '')),
                Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                  TextButton(onPressed: () => setState(() => editing = false), child: Text('Vazgeç', style: TextStyle(color: fg))),
                  TextButton(onPressed: save, child: Text('Kaydet', style: TextStyle(color: fg))),
                ]),
              ]))
              else ...[
                if (m.attachment != null) AttachmentView(a: m.attachment!),
                if (m.body.isNotEmpty) Text.rich(TextSpan(style: TextStyle(color: fg, fontSize: 15), children: renderBody(m.body, fg, mine ? Colors.white : t.accent))),
              ],
              const SizedBox(height: 2),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Text('${formatTime(m.createdAt)}${m.editedAt != null && m.deletedAt == null ? ' · düzenlendi' : ''}', style: TextStyle(fontSize: 11, color: sub)),
                if (mine && m.deletedAt == null) Padding(padding: const EdgeInsets.only(left: 4), child: Icon(widget.read ? LucideIcons.checkCheck : LucideIcons.check, size: 13, color: sub)),
              ]),
              if (err.isNotEmpty) Text(err, style: TextStyle(fontSize: 12, color: mine ? Colors.white : t.danger)),
            ]),
          ),
        ),
        if (tools && editable && !editing) Padding(padding: const EdgeInsets.only(top: 2), child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (m.body.isNotEmpty) IconButton(visualDensity: VisualDensity.compact, tooltip: 'Düzenle', icon: Icon(LucideIcons.pencil, size: 15, color: t.text2),
              onPressed: () => setState(() { text.text = m.body; editing = true; tools = false; })),
          IconButton(visualDensity: VisualDensity.compact, tooltip: 'Sil', icon: Icon(LucideIcons.trash2, size: 15, color: t.text2), onPressed: remove),
        ])),
      ])),
    );
  }
}
