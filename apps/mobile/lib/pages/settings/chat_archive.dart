import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import '../../widgets/glass.dart';
import 'common.dart';

const _page = 50;

String _initials(String name) {
  final p = name.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).take(2);
  return p.map((e) => e[0].toUpperCase()).join();
}

String _fmtSize(int n) => n < 1024 * 1024 ? '${(n / 1024).round().clamp(1, 1 << 30)} KB' : '${(n / 1024 / 1024).toStringAsFixed(1)} MB';

/// Sohbet arşivi (chat.audit): tüm sohbetler, silinen mesajların içeriği, düzenleme öncesi metinler.
/// Silinen mesaj "Geri getir" ile sohbet üyelerinde yeniden görünür.
class ChatArchive extends StatefulWidget {
  const ChatArchive({super.key});
  @override
  State<ChatArchive> createState() => _ChatArchiveState();
}

class _ChatArchiveState extends State<ChatArchive> {
  final q = TextEditingController();
  int? userId;
  Timer? _deb;
  int? activeId;
  late final users = ApiData<List<UserRef>>('/users/directory',
      decode: (j) => ((j as List?) ?? const []).whereType<Map>().map((e) => UserRef.fromJson(Map<String, dynamic>.from(e))).toList());
  late final convs = ApiData<List<ArchiveConversation>>('/chat/admin/conversations?',
      decode: (j) => ((j as List?) ?? const []).whereType<Map>().map((e) => ArchiveConversation.fromJson(Map<String, dynamic>.from(e))).toList());

  @override
  void dispose() { _deb?.cancel(); q.dispose(); users.dispose(); convs.dispose(); super.dispose(); }

  // Arama kutusu yazarken her harfte sorgu atmasın.
  void _schedule() {
    _deb?.cancel();
    _deb = Timer(const Duration(milliseconds: 300), () {
      final p = <String, String>{if (q.text.trim().isNotEmpty) 'q': q.text.trim(), if (userId != null) 'userId': '$userId'};
      convs.setPath('/chat/admin/conversations?${Uri(queryParameters: p.isEmpty ? null : p).query}');
    });
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([users, convs]),
        builder: (c, _) {
          final t = c.tk;
          final list = convs.data;
          final active = list?.where((x) => x.id == activeId).firstOrNull;
          return Panel(title: 'Sohbet arşivi', children: [
            if (active != null)
              _Thread(key: ValueKey(active.id), conv: active, onBack: () => setState(() => activeId = null))
            else ...[
              const Hint('Tüm sohbetler ve kullanıcıların sildiği mesajlar burada saklanır. Silinen mesajı geri getirdiğinizde sohbetteki herkes yeniden görür. Düzenlenen mesajların önceki halleri de listelenir.'),
              TextField(
                controller: q, onChanged: (_) => _schedule(),
                decoration: InputDecoration(hintText: 'Grup adı veya kişi ara…', prefixIcon: Icon(LucideIcons.search, size: 16, color: t.text3)),
              ),
              const SizedBox(height: 10),
              Sel<int>(
                value: userId,
                items: [
                  const DropdownMenuItem<int?>(value: null, child: Text('Tüm kişiler')),
                  for (final u in users.data ?? const <UserRef>[]) DropdownMenuItem<int?>(value: u.id, child: Text(u.fullName)),
                ],
                onChanged: (v) { setState(() => userId = v); _schedule(); },
              ),
              errLine(c, convs.error),
              if (list != null && list.isEmpty) emptyLine(c, 'Sohbet bulunamadı.'),
              for (final x in list ?? const <ArchiveConversation>[])
                InkWell(
                  onTap: () => setState(() => activeId = x.id),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                    child: Row(children: [
                      Container(
                        width: 40, height: 40, alignment: Alignment.center,
                        decoration: BoxDecoration(color: t.accentSoft, shape: BoxShape.circle),
                        child: Text(x.type == 'group' ? '#' : _initials(x.members.isEmpty ? '?' : x.members.first.fullName), style: TextStyle(fontWeight: FontWeight.w700, color: t.accentInk)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(x.displayTitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text))),
                          if (x.lastMessageAt != null) Text(fmtDate(x.lastMessageAt!), style: TextStyle(fontSize: 12.5, color: t.text3)),
                        ]),
                        const SizedBox(height: 2),
                        Row(children: [
                          Text('${x.messageCount} mesaj${x.type == 'group' ? ' · ${x.members.length} üye' : ''}', style: TextStyle(fontSize: 13, color: t.text3)),
                          if (x.deletedCount > 0) ...[
                            const SizedBox(width: 8),
                            Chip2('${x.deletedCount} silinmiş', color: t.danger, bg: t.danger.withValues(alpha: .14)),
                          ],
                        ]),
                      ])),
                    ]),
                  ),
                ),
            ],
          ]);
        },
      );
}

class _Thread extends StatefulWidget {
  const _Thread({super.key, required this.conv, required this.onBack});
  final ArchiveConversation conv;
  final VoidCallback onBack;
  @override
  State<_Thread> createState() => _ThreadState();
}

class _ThreadState extends State<_Thread> {
  List<ArchiveMessage>? msgs;
  bool more = false, onlyDeleted = false;
  String error = '';

  @override
  void initState() { super.initState(); load(); }

  Future<void> load([int? before]) async {
    try {
      final r = await Api.i.get('/chat/admin/conversations/${widget.conv.id}/messages?take=$_page${before != null ? '&before=$before' : ''}');
      final got = ((r['messages'] as List?) ?? const []).whereType<Map>().map((e) => ArchiveMessage.fromJson(Map<String, dynamic>.from(e))).toList();
      if (!mounted) return;
      setState(() { msgs = [...(before != null ? msgs ?? [] : []), ...got]; more = got.length == _page; });
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Yüklenemedi');
    }
  }

  Future<void> restore(ArchiveMessage m) async {
    try {
      final r = await Api.i.post('/chat/admin/messages/${m.id}/restore');
      if (mounted) setState(() => m.deletedAt = r['deletedAt'] as String?);
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Geri getirilemedi');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    // Liste yeniden eskiye gelir; ekranda eskiden yeniye gösterilir.
    final shown = (msgs ?? const <ArchiveMessage>[]).reversed.where((m) => !onlyDeleted || m.deletedAt != null || m.revisions.isNotEmpty).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      GestureDetector(onTap: widget.onBack, child: Text('← Sohbetler', style: TextStyle(fontWeight: FontWeight.w600, color: t.accentInk))),
      const SizedBox(height: 8),
      Text(widget.conv.displayTitle, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text)),
      Text(widget.conv.members.map((m) => m.fullName).join(', '), style: TextStyle(fontSize: 13, color: t.text3)),
      CheckRow('Yalnızca silinen/düzenlenen', onlyDeleted, (v) => setState(() => onlyDeleted = v)),
      errLine(context, error),
      if (more && msgs != null) Align(alignment: Alignment.centerLeft, child: smBtn('Daha eski mesajlar', () => load(msgs!.last.id))),
      if (msgs != null && shown.isEmpty) emptyLine(context, 'Gösterilecek mesaj yok.'),
      for (final m in shown) _msg(context, m),
    ]);
  }

  Widget _msg(BuildContext c, ArchiveMessage m) {
    final t = c.tk;
    return Opacity(
      opacity: m.deletedAt != null ? .8 : 1,
      child: Container(
        margin: const EdgeInsets.only(top: 10), padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: m.deletedAt != null ? t.danger.withValues(alpha: .1) : t.fill, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text(m.senderName, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
            Text('${fmtDate(m.createdAt)} ${fmtTime(m.createdAt)}', style: TextStyle(fontSize: 12.5, color: t.text3)),
            if (m.editedAt != null) Chip2('düzenlendi', color: t.text2),
            if (m.deletedAt != null) Chip2('${fmtDate(m.deletedAt!)} ${fmtTime(m.deletedAt!)} silindi', color: t.danger, bg: t.danger.withValues(alpha: .14)),
            if (m.deletedAt != null) smBtn('Geri getir', () => restore(m), icon: LucideIcons.rotateCcw),
          ]),
          if (m.body.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(m.body, style: TextStyle(fontSize: 14.5, height: 1.35, color: t.text))),
          if (m.attachment != null) Padding(padding: const EdgeInsets.only(top: 6), child: _Attachment(a: m.attachment!)),
          if (m.revisions.isNotEmpty)
            Theme(
              data: Theme.of(c).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero, childrenPadding: EdgeInsets.zero, dense: true,
                title: Text('Önceki haller (${m.revisions.length})', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text2)),
                children: [
                  for (final r in m.revisions)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text.rich(TextSpan(children: [
                          TextSpan(text: '${fmtDate(r.createdAt)} ${fmtTime(r.createdAt)} öncesi: ', style: TextStyle(fontSize: 12.5, color: t.text3)),
                          TextSpan(text: r.body, style: TextStyle(fontSize: 14, color: t.text)),
                        ])),
                      ),
                    ),
                ],
              ),
            ),
        ]),
      ),
    );
  }
}

/// Web AttachmentView: görsel ise küçük resim, değilse dosya adı + boyut. (Dosya görüntüleyici henüz yok.)
class _Attachment extends StatelessWidget {
  const _Attachment({required this.a});
  final ArchiveAttachment a;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final isImage = a.mime.startsWith('image/') && a.mime != 'image/heic';
    if (isImage) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.network('${Api.i.baseUrl}/api/attachments/${a.id}', headers: Api.i.authHeaders, height: 160, fit: BoxFit.cover,
            errorBuilder: (_, e, s) => Text(a.fileName, style: TextStyle(color: t.text2))),
      );
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(LucideIcons.fileText, size: 18, color: t.text2),
      const SizedBox(width: 8),
      Flexible(child: Text('${a.fileName} · ${_fmtSize(a.size)}', style: TextStyle(fontSize: 13.5, color: t.text2))),
    ]);
  }
}
