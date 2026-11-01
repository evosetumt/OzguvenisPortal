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

/// Web NewConversationModal. Oluşturulan sohbetle kapanır.
Future<Conversation?> showNewConversation(BuildContext context) =>
    showGlassSheet<Conversation>(context, builder: (_) => const _NewConversation());

class _NewConversation extends StatefulWidget {
  const _NewConversation();
  @override
  State<_NewConversation> createState() => _NewConversationState();
}

class _NewConversationState extends State<_NewConversation> {
  late final ApiData<List<UserRef>> users = ApiData('/users/directory', decode: (j) => userList(j));
  bool group = false, busy = false;
  String q = '', error = '';
  final title = TextEditingController();
  Set<int> selected = {};

  @override
  void dispose() { users.dispose(); title.dispose(); super.dispose(); }

  Future<void> run(Future<dynamic> Function() fn) async {
    setState(() { busy = true; error = ''; });
    try {
      final c = Conversation.fromJson(await fn() as Map<String, dynamic>);
      if (mounted) Navigator.of(context).pop(c);
    } catch (e) {
      if (mounted) setState(() { error = e is ApiError ? e.message : 'Oluşturulamadı'; busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final meId = context.read<AuthController>().me!.id;
    return SheetFrame(title: 'Yeni sohbet', child: ListenableBuilder(listenable: users, builder: (c, _) {
      final others = (users.data ?? []).where((u) => u.id != meId).toList();
      final filtered = others.where((u) => lowerTr(u.fullName).contains(lowerTr(q.trim()))).toList();
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: _seg(t, LucideIcons.user, 'Birebir', !group, () => setState(() => group = false))),
          const SizedBox(width: 8),
          Expanded(child: _seg(t, LucideIcons.users, 'Grup', group, () => setState(() => group = true))),
        ]),
        const SizedBox(height: 12),
        if (!group) ...[
          TextField(decoration: const InputDecoration(hintText: 'Kişi ara…', isDense: true), onChanged: (v) => setState(() => q = v)),
          const SizedBox(height: 6),
          for (final u in filtered) ListTile(
            contentPadding: EdgeInsets.zero, enabled: !busy,
            leading: Avatar(name: u.fullName, src: u.avatarUrl, size: 36),
            title: Text(u.fullName, style: TextStyle(color: t.text, fontWeight: FontWeight.w600)),
            onTap: () => run(() => Api.i.post('/chat/direct', {'userId': u.id})),
          ),
          if (users.data != null && filtered.isEmpty) Padding(padding: const EdgeInsets.all(8), child: Text('Kişi bulunamadı.', style: TextStyle(color: t.text2))),
        ] else ...[
          TextField(controller: title, maxLength: 150, decoration: const InputDecoration(labelText: 'Grup adı')),
          const SizedBox(height: 8),
          Text('Üyeler (${selected.length})', style: TextStyle(color: t.text2, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          UserPicker(users: others, selected: selected, onToggle: (id) => setState(() => selected = toggled(selected, id))),
          errorText(context, error),
          const SizedBox(height: 14),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            PillButton(label: 'Vazgeç', onPressed: () => Navigator.of(context).pop()),
            const SizedBox(width: 8),
            PillButton(label: 'Oluştur', primary: true, busy: busy, onPressed: () {
              if (title.text.trim().isEmpty) { setState(() => error = 'Grup adı gerekli'); return; }
              if (selected.isEmpty) { setState(() => error = 'En az bir kişi seçin'); return; }
              run(() => Api.i.post('/chat/groups', {'title': title.text, 'memberIds': selected.toList()}));
            }),
          ]),
        ],
        if (!group) errorText(context, error),
      ]);
    }));
  }

  Widget _seg(Tokens t, IconData icon, String label, bool on, VoidCallback tap) => Material(
        color: on ? t.accent : t.fill, shape: const StadiumBorder(),
        child: InkWell(customBorder: const StadiumBorder(), onTap: tap, child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, size: 14, color: on ? Colors.white : t.text), const SizedBox(width: 6),
            Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: on ? Colors.white : t.text)),
          ]),
        )),
      );
}
