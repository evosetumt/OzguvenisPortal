import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../models/chat.dart';
import 'format.dart';

/// Web UserPicker: rehberden kullanıcı seçimi (arama + çip).
class UserPicker extends StatefulWidget {
  const UserPicker({super.key, required this.users, required this.selected, required this.onToggle, this.exclude = const []});
  final List<UserRef> users;
  final Set<int> selected;
  final void Function(int id) onToggle;
  final List<int> exclude;
  @override
  State<UserPicker> createState() => _UserPickerState();
}

class _UserPickerState extends State<UserPicker> {
  String q = '';
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final list = widget.users
        .where((u) => !widget.exclude.contains(u.id))
        .where((u) => lowerTr(u.fullName).contains(lowerTr(q.trim())))
        .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(decoration: const InputDecoration(hintText: 'Kişi ara…', isDense: true), onChanged: (v) => setState(() => q = v)),
      const SizedBox(height: 8),
      if (list.isEmpty) Text('Kişi bulunamadı.', style: TextStyle(color: t.text2))
      else Wrap(spacing: 6, runSpacing: 6, children: [
        for (final u in list) ChoiceChip(
          label: Text(u.fullName), selected: widget.selected.contains(u.id), onSelected: (_) => widget.onToggle(u.id),
          showCheckmark: false, selectedColor: t.accent, backgroundColor: t.fill, side: BorderSide.none,
          labelStyle: TextStyle(color: widget.selected.contains(u.id) ? Colors.white : t.text, fontWeight: FontWeight.w600, fontSize: 13),
        ),
      ]),
    ]);
  }
}

/// Modal/çekmece başlığı + kapat düğmesi (web Modal).
class SheetFrame extends StatelessWidget {
  const SheetFrame({super.key, required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 8, 4),
        child: Row(children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: t.text))),
          IconButton(onPressed: () => Navigator.of(context).pop(), icon: Icon(Icons.close, color: t.text2)),
        ]),
      ),
      Flexible(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 20), child: child)),
    ]);
  }
}

Widget errorText(BuildContext c, String msg) => msg.isEmpty
    ? const SizedBox.shrink()
    : Padding(padding: const EdgeInsets.only(top: 8), child: Text(msg, style: TextStyle(color: c.tk.danger, fontSize: 14)));
