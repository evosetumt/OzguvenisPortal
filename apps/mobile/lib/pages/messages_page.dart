import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/auth.dart';
import '../core/realtime.dart';
import '../core/theme.dart';
import '../models/chat.dart';
import '../widgets/glass.dart';
import 'chat/format.dart';
import 'chat/group_info.dart';
import 'chat/message_thread.dart';
import 'chat/new_conversation.dart';

String _preview(ChatMessage? m, int meId) {
  if (m == null) return 'Henüz mesaj yok';
  if (m.deletedAt != null) return 'Mesaj silindi';
  final text = m.body.isNotEmpty ? m.body : (m.attachment != null ? '📎 ${m.attachment!.fileName}' : '');
  return '${m.senderId == meId ? 'Siz: ' : ''}$text';
}

/// Web MessagesPage: telefon düzeninde sohbet listesi ya da (seçiliyse) konuşma. Etkin sohbet adresteki `?c=`,
/// `?to=<kişi>` birebir sohbeti açar (yoksa oluşturur).
class MessagesPage extends StatefulWidget {
  const MessagesPage({super.key});
  @override
  State<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends State<MessagesPage> with SocketEvents {
  List<Conversation>? convs;
  String error = '', q = '';
  int? activeId, _toDone;
  late final int meId = context.read<AuthController>().me!.id;

  @override
  void initState() {
    super.initState();
    load();
    onSocket('connect', (_) => load());
    onSocket('message:new', (d) {
      final m = ChatMessage.fromJson(Map<String, dynamic>.from(d as Map));
      final list = convs ?? [];
      final c = list.where((x) => x.id == m.conversationId).firstOrNull;
      if (c == null) { load(); return; } // yeni eklendiğimiz bir sohbet
      final unread = m.senderId != meId && m.conversationId != activeId ? c.unread + 1 : c.unread;
      setState(() => convs = [c.copyWith(lastMessage: m, lastMessageAt: m.createdAt, unread: unread), ...list.where((x) => x.id != c.id)]);
    });
    onSocket('message:updated', (d) {
      final m = ChatMessage.fromJson(Map<String, dynamic>.from(d as Map));
      setState(() => convs = convs?.map((c) => c.lastMessage?.id == m.id ? c.copyWith(lastMessage: m) : c).toList());
    });
    onSocket('read', (d) {
      final r = d as Map;
      final cid = (r['conversationId'] as num).toInt(), uid = (r['userId'] as num).toInt(), mid = (r['messageId'] as num?)?.toInt();
      setState(() => convs = convs?.map((c) => c.id != cid ? c : c.copyWith(
            unread: uid == meId ? 0 : c.unread,
            members: [for (final m in c.members) m.id == uid ? m.withRead(mid) : m],
          )).toList());
    });
    onSocket('conversation:updated', (d) {
      final e = d as Map;
      if (e['removedUserId'] == meId && e['conversationId'] == activeId) select(null);
      load();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final qp = GoRouterState.of(context).uri.queryParameters;
    activeId = int.tryParse(qp['c'] ?? '');
    // Ekip / profil ekranından "Mesaj gönder": ?to=<kişi> birebir sohbeti açar (yoksa oluşturur)
    final to = int.tryParse(qp['to'] ?? '');
    if (to != null && to != meId && to != _toDone) {
      _toDone = to;
      Api.i.post('/chat/direct', {'userId': to}).then((j) {
        final c = Conversation.fromJson(j as Map<String, dynamic>);
        upsert(c);
        if (mounted) context.go('/messages?c=${c.id}');
      }).catchError((_) { if (mounted) context.go('/messages'); });
    }
  }

  Future<void> load() async {
    try {
      final rows = [for (final e in await Api.i.get('/chat/conversations') as List) Conversation.fromJson(e as Map<String, dynamic>)];
      if (mounted) setState(() { convs = rows; error = ''; });
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Yüklenemedi');
    }
  }

  void select(int? id) => context.go(id == null ? '/messages' : '/messages?c=$id');
  void upsert(Conversation c) { if (mounted) setState(() => convs = [c, ...(convs ?? []).where((x) => x.id != c.id)]); }

  Future<void> create() async {
    final c = await showNewConversation(context);
    if (c != null) { upsert(c); select(c.id); }
  }

  @override
  Widget build(BuildContext context) {
    final active = convs?.where((c) => c.id == activeId).firstOrNull;
    if (active != null) {
      return Padding(padding: const EdgeInsets.fromLTRB(10, 4, 10, 6), child: MessageThread(
        key: ValueKey(active.id), conversation: active, meId: meId, onBack: () => select(null),
        onInfo: () => showGroupInfo(context, active,
            onChanged: (c) => setState(() => convs = convs?.map((x) => x.id == c.id ? x.copyWith(members: c.members, title: c.title) : x).toList()),
            onLeft: () { select(null); load(); }),
      ));
    }
    return _list(context);
  }

  Widget _list(BuildContext context) {
    final t = context.tk;
    final list = (convs ?? []).where((c) => q.trim().isEmpty || lowerTr(conversationTitle(c, meId)).contains(lowerTr(q.trim()))).toList();
    return Padding(padding: const EdgeInsets.fromLTRB(10, 4, 10, 6), child: Glass(radius: 24, child: Column(children: [
      Padding(padding: const EdgeInsets.fromLTRB(18, 14, 8, 4), child: Row(children: [
        Expanded(child: Text('Mesajlar', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: t.text))),
        IconButton(tooltip: 'Yeni sohbet', onPressed: create, icon: Icon(LucideIcons.plus, size: 20, color: t.text)),
      ])),
      Padding(padding: const EdgeInsets.fromLTRB(14, 4, 14, 8), child: TextField(
        onChanged: (v) => setState(() => q = v),
        decoration: InputDecoration(hintText: 'Sohbet ara…', isDense: true, filled: true, fillColor: t.fill, prefixIcon: Icon(LucideIcons.search, size: 14, color: t.text2),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(99), borderSide: BorderSide.none)),
      )),
      if (error.isNotEmpty) Padding(padding: const EdgeInsets.all(12), child: Text(error, style: TextStyle(color: t.danger))),
      if (convs == null && error.isEmpty) const Expanded(child: Center(child: CircularProgressIndicator()))
      else Expanded(child: convs!.isEmpty
          ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Henüz sohbet yok.', style: TextStyle(color: t.text2)),
              TextButton(onPressed: create, child: const Text('Yeni sohbet başlatın')),
            ]))
          : ListView.builder(itemCount: list.length, itemBuilder: (c, i) {
              final v = list[i];
              final title = conversationTitle(v, meId);
              return InkWell(onTap: () => select(v.id), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10), child: Row(children: [
                Container(width: 44, height: 44, alignment: Alignment.center,
                    decoration: BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color.lerp(t.accent, Colors.white, .3)!, t.accent])),
                    child: Text(v.isGroup ? '#' : initials(title), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16))),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: v.unread > 0 ? FontWeight.w800 : FontWeight.w600, fontSize: 16, color: t.text))),
                    if (v.lastMessageAt != null) Text(timeAgo(v.lastMessageAt!), style: TextStyle(fontSize: 12, color: t.text2)),
                  ]),
                  const SizedBox(height: 2),
                  Row(children: [
                    Expanded(child: Text(_preview(v.lastMessage, meId), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: v.unread > 0 ? t.text : t.text2))),
                    if (v.unread > 0) Container(
                      margin: const EdgeInsets.only(left: 8), padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(color: t.accent, borderRadius: BorderRadius.circular(99)),
                      child: Text('${v.unread}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ]),
                ])),
              ])));
            })),
    ])));
  }
}
