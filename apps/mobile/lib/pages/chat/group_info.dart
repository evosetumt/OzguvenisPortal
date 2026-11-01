import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/chat.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import 'format.dart';
import 'user_picker.dart';

/// Web GroupInfoModal: ad değiştirme ve üye ekleme/çıkarma (yalnızca oluşturan), gruptan ayrılma (herkes).
/// [onChanged] güncellenen sohbeti, [onLeft] gruptan ayrılınca çağrılır.
Future<void> showGroupInfo(BuildContext context, Conversation c, {required void Function(Conversation) onChanged, required VoidCallback onLeft}) =>
    showGlassSheet<void>(context, builder: (_) => _GroupInfo(conversation: c, onChanged: onChanged, onLeft: onLeft));

class _GroupInfo extends StatefulWidget {
  const _GroupInfo({required this.conversation, required this.onChanged, required this.onLeft});
  final Conversation conversation;
  final void Function(Conversation) onChanged;
  final VoidCallback onLeft;
  @override
  State<_GroupInfo> createState() => _GroupInfoState();
}

class _GroupInfoState extends State<_GroupInfo> {
  late Conversation c = widget.conversation;
  late final bool isOwner = c.createdById == context.read<AuthController>().me!.id;
  late final ApiData<List<UserRef>> users = ApiData(isOwner ? '/users/directory' : null, decode: (j) => userList(j));
  late final title = TextEditingController(text: c.title ?? '');
  Set<int> adding = {};
  String error = '';

  @override
  void dispose() { users.dispose(); title.dispose(); super.dispose(); }

  Future<void> wrap(Future<void> Function() fn) async {
    setState(() => error = '');
    try { await fn(); } catch (e) { if (mounted) setState(() => error = e is ApiError ? e.message : 'İşlem başarısız'); }
  }

  void update(Conversation n) { widget.onChanged(n); if (mounted) setState(() => c = n); }

  Future<void> remove(int userId, int meId) => wrap(() async {
        await Api.i.delete('/chat/conversations/${c.id}/members/$userId');
        if (userId == meId) {
          if (mounted) Navigator.of(context).pop();
          widget.onLeft();
        } else {
          update(c.copyWith(members: c.members.where((m) => m.id != userId).toList()));
        }
      });

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final meId = context.read<AuthController>().me!.id;
    return SheetFrame(title: 'Grup bilgisi', child: ListenableBuilder(listenable: users, builder: (_, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (isOwner) Row(children: [
        Expanded(child: TextField(controller: title, maxLength: 150, decoration: const InputDecoration(labelText: 'Grup adı', counterText: ''))),
        const SizedBox(width: 8),
        PillButton(label: 'Kaydet', onPressed: () {
          if (title.text.trim().isEmpty) return;
          wrap(() async => update(Conversation.fromJson(await Api.i.patch('/chat/conversations/${c.id}', {'title': title.text}) as Map<String, dynamic>)));
        }),
      ]) else Text(c.title ?? '', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: t.text)),
      const SizedBox(height: 14),
      Text('Üyeler (${c.members.length})', style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
      for (final m in c.members) ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Avatar(name: m.fullName, src: m.avatarUrl, size: 34),
        title: Text.rich(TextSpan(text: m.fullName, children: [
          if (m.id == c.createdById) TextSpan(text: ' · yönetici', style: TextStyle(fontSize: 12, color: t.text2)),
        ]), style: TextStyle(color: t.text, fontWeight: FontWeight.w600)),
        trailing: isOwner && m.id != meId ? IconButton(tooltip: 'Gruptan çıkar', icon: Icon(LucideIcons.x, size: 16, color: t.text2), onPressed: () => remove(m.id, meId)) : null,
      ),
      if (isOwner && users.data != null) ...[
        const SizedBox(height: 8),
        Text('Üye ekle', style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
        const SizedBox(height: 6),
        UserPicker(users: users.data!, selected: adding, exclude: [for (final m in c.members) m.id], onToggle: (id) => setState(() => adding = toggled(adding, id))),
        if (adding.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Align(alignment: Alignment.centerRight, child: PillButton(
          label: '${adding.length} kişiyi ekle', primary: true,
          onPressed: () => wrap(() async {
            update(Conversation.fromJson(await Api.i.post('/chat/conversations/${c.id}/members', {'userIds': adding.toList()}) as Map<String, dynamic>));
            if (mounted) setState(() => adding = {});
          }),
        ))),
      ],
      errorText(context, error),
      const SizedBox(height: 14),
      Row(children: [
        PillButton(label: 'Gruptan ayrıl', danger: true, icon: LucideIcons.logOut, onPressed: () => remove(meId, meId)),
        const Spacer(),
        PillButton(label: 'Kapat', onPressed: () => Navigator.of(context).pop()),
      ]),
    ])));
  }
}
