import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/chat.dart';
import '../../widgets/glass.dart';
import '../chat/format.dart';
import '../chat/user_picker.dart';

/// Web MeetingForm ("Toplantı planla"). Kaydedilirse true döner.
Future<bool?> showMeetingForm(BuildContext context) => showGlassSheet<bool>(context, builder: (_) => const _MeetingForm());

class _MeetingForm extends StatefulWidget {
  const _MeetingForm();
  @override
  State<_MeetingForm> createState() => _MeetingFormState();
}

class _MeetingFormState extends State<_MeetingForm> {
  late final ApiData<List<UserRef>> users = ApiData('/users/directory', decode: (j) => userList(j));
  final title = TextEditingController();
  late DateTime date;
  late TimeOfDay start, end;
  Set<int> selected = {};
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    final s = now.add(Duration(minutes: 30 - (now.minute % 30)));
    date = DateTime(s.year, s.month, s.day);
    start = TimeOfDay(hour: s.hour, minute: s.minute);
    final e = s.add(const Duration(hours: 1));
    end = TimeOfDay(hour: e.hour, minute: e.minute);
  }

  @override
  void dispose() { users.dispose(); title.dispose(); super.dispose(); }

  DateTime at(TimeOfDay t) => DateTime(date.year, date.month, date.day, t.hour, t.minute);

  Future<void> submit() async {
    if (title.text.trim().isEmpty) { setState(() => error = 'Başlık gerekli'); return; }
    if (!at(end).isAfter(at(start))) { setState(() => error = 'Bitiş saati başlangıçtan sonra olmalı'); return; }
    setState(() { busy = true; error = ''; });
    try {
      await Api.i.post('/meetings', {
        'title': title.text, 'startsAt': at(start).toUtc().toIso8601String(), 'endsAt': at(end).toUtc().toIso8601String(),
        'participantIds': selected.toList(),
      });
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() { error = e is ApiError ? e.message : 'Kaydedilemedi'; busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final meId = context.read<AuthController>().me!.id;
    Widget pick(String label, String value, VoidCallback tap) => Expanded(child: OutlinedButton(
          onPressed: tap, child: Column(children: [Text(label, style: TextStyle(fontSize: 11, color: t.text2)), Text(value, style: TextStyle(color: t.text, fontWeight: FontWeight.w600))])));
    return SheetFrame(title: 'Toplantı planla', child: ListenableBuilder(listenable: users, builder: (c, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(controller: title, maxLength: 200, autofocus: true, decoration: const InputDecoration(labelText: 'Başlık', counterText: '')),
      const SizedBox(height: 10),
      Row(children: [
        pick('Tarih', DateFormat('d.MM.yyyy', 'tr_TR').format(date), () async {
          final p = await showDatePicker(context: context, initialDate: date, firstDate: DateTime(2020), lastDate: DateTime(2100));
          if (p != null) setState(() => date = p);
        }),
        const SizedBox(width: 6),
        pick('Başlangıç', start.format(context), () async {
          final p = await showTimePicker(context: context, initialTime: start);
          if (p != null) setState(() => start = p);
        }),
        const SizedBox(width: 6),
        pick('Bitiş', end.format(context), () async {
          final p = await showTimePicker(context: context, initialTime: end);
          if (p != null) setState(() => end = p);
        }),
      ]),
      const SizedBox(height: 12),
      Text('Katılımcılar (${selected.length})', style: TextStyle(fontWeight: FontWeight.w600, color: t.text2)),
      const SizedBox(height: 6),
      UserPicker(users: users.data ?? const [], selected: selected, exclude: [meId], onToggle: (id) => setState(() => selected = toggled(selected, id))),
      errorText(context, error),
      const SizedBox(height: 14),
      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        PillButton(label: 'Vazgeç', onPressed: () => Navigator.of(context).pop()),
        const SizedBox(width: 8),
        PillButton(label: 'Planla', primary: true, busy: busy, onPressed: submit),
      ]),
    ])));
  }
}
