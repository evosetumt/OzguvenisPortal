import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/calendar.dart';
import '../../models/chat.dart';
import '../../widgets/glass.dart';
import '../chat/format.dart';
import '../chat/user_picker.dart';

const visLabel = {'private': 'Yalnızca davetliler', 'department': 'Departman', 'company': 'Tüm şirket'};

/// Web EventForm: etkinlik ekle/düzenle/sil. Kaydedilir ya da silinirse true döner.
Future<bool?> showEventForm(BuildContext context, {CalendarItem? item, String? date, required List<UserRef> users}) =>
    showGlassSheet<bool>(context, builder: (_) => _EventForm(item: item, date: date, users: users));

class _EventForm extends StatefulWidget {
  const _EventForm({this.item, this.date, required this.users});
  final CalendarItem? item;
  final String? date;
  final List<UserRef> users;
  @override
  State<_EventForm> createState() => _EventFormState();
}

class _EventFormState extends State<_EventForm> {
  CalendarItem? get item => widget.item;
  bool get ro => item != null && !item!.canEdit;
  late final title = TextEditingController(text: item?.title ?? '');
  late final location = TextEditingController(text: item?.location ?? '');
  late final description = TextEditingController(text: item?.description ?? '');
  late DateTime date, endDate;
  late TimeOfDay start, end;
  late bool allDay = item?.allDay ?? false;
  late String visibility = item?.visibility ?? 'private';
  late Set<int> attendees = {...?item?.attendees.map((a) => a.id)};
  String error = '';
  bool busy = false;

  static DateTime _day(String key) => DateTime.parse(key);

  @override
  void initState() {
    super.initState();
    if (item != null) {
      final s = parseDt(item!.start), e = parseDt(item!.end);
      date = DateTime(s.year, s.month, s.day);
      endDate = DateTime(e.year, e.month, e.day);
      start = TimeOfDay(hour: s.hour, minute: s.minute);
      end = TimeOfDay(hour: e.hour, minute: e.minute);
    } else {
      date = endDate = _day(widget.date!);
      start = const TimeOfDay(hour: 9, minute: 0);
      end = const TimeOfDay(hour: 10, minute: 0);
    }
  }

  @override
  void dispose() { title.dispose(); location.dispose(); description.dispose(); super.dispose(); }

  DateTime _at(DateTime d, TimeOfDay t) => DateTime(d.year, d.month, d.day, t.hour, t.minute);

  Future<void> submit() async {
    if (title.text.trim().isEmpty) { setState(() => error = 'Başlık gerekli'); return; }
    final startsAt = allDay ? DateTime(date.year, date.month, date.day) : _at(date, start);
    final endsAt = allDay ? DateTime(endDate.year, endDate.month, endDate.day, 23, 59) : _at(endDate, end);
    if (endsAt.isBefore(startsAt)) { setState(() => error = 'Bitiş, başlangıçtan önce olamaz'); return; }
    setState(() { busy = true; error = ''; });
    final body = {
      'title': title.text, 'allDay': allDay, 'location': location.text, 'description': description.text, 'visibility': visibility,
      'startsAt': startsAt.toUtc().toIso8601String(), 'endsAt': endsAt.toUtc().toIso8601String(), 'attendeeIds': attendees.toList(),
    };
    try {
      if (item != null) { await Api.i.patch('/calendar/${item!.id}', body); } else { await Api.i.post('/calendar', body); }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() { error = e is ApiError ? e.message : 'Kaydedilemedi'; busy = false; });
    }
  }

  Future<void> remove() async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      content: const Text('Etkinlik silinsin mi?'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sil'))],
    ));
    if (ok != true) return;
    try { await Api.i.delete('/calendar/${item!.id}'); if (mounted) Navigator.of(context).pop(true); } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Silinemedi');
    }
  }

  Future<void> pickDate(bool isEnd) async {
    final p = await showDatePicker(context: context, initialDate: isEnd ? endDate : date, firstDate: isEnd ? date : DateTime(2020), lastDate: DateTime(2100));
    if (p == null) return;
    setState(() {
      if (isEnd) { endDate = p; } else { date = p; if (p.isAfter(endDate)) endDate = p; }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final meId = context.read<AuthController>().me!.id;
    final f = DateFormat('d.MM.yyyy', 'tr_TR');
    Widget pick(String label, String value, VoidCallback tap) => Expanded(child: OutlinedButton(
          onPressed: ro ? null : tap, child: Column(children: [Text(label, style: TextStyle(fontSize: 11, color: t.text2)), Text(value, style: TextStyle(color: t.text, fontWeight: FontWeight.w600))])));
    return SheetFrame(title: item != null ? (ro ? 'Etkinlik' : 'Etkinliği düzenle') : 'Yeni etkinlik', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(controller: title, enabled: !ro, maxLength: 200, decoration: const InputDecoration(labelText: 'Başlık', counterText: '')),
      SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Tüm gün'), value: allDay, onChanged: ro ? null : (v) => setState(() => allDay = v)),
      Row(children: [
        pick('Başlangıç', f.format(date), () => pickDate(false)),
        if (!allDay) ...[const SizedBox(width: 6), pick('Saat', start.format(context), () async {
          final p = await showTimePicker(context: context, initialTime: start);
          if (p != null) setState(() => start = p);
        })],
      ]),
      const SizedBox(height: 8),
      Row(children: [
        pick('Bitiş', f.format(endDate), () => pickDate(true)),
        if (!allDay) ...[const SizedBox(width: 6), pick('Saat', end.format(context), () async {
          final p = await showTimePicker(context: context, initialTime: end);
          if (p != null) setState(() => end = p);
        })],
      ]),
      const SizedBox(height: 10),
      TextField(controller: location, enabled: !ro, maxLength: 200, decoration: const InputDecoration(labelText: 'Yer', counterText: '')),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
        initialValue: visibility, decoration: const InputDecoration(labelText: 'Görünürlük'),
        items: [for (final e in visLabel.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
        onChanged: ro ? null : (v) => setState(() => visibility = v ?? 'private'),
      ),
      const SizedBox(height: 8),
      TextField(controller: description, enabled: !ro, minLines: 2, maxLines: 4, maxLength: 2000, decoration: const InputDecoration(labelText: 'Açıklama', counterText: '')),
      const SizedBox(height: 10),
      Text('Davetliler', style: TextStyle(fontWeight: FontWeight.w600, color: t.text2)),
      const SizedBox(height: 6),
      IgnorePointer(ignoring: ro, child: UserPicker(
        users: widget.users, selected: attendees, exclude: [meId], onToggle: (id) => setState(() => attendees = toggled(attendees, id)))),
      if (item?.owner != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Oluşturan: ${item!.owner!.fullName}', style: TextStyle(fontSize: 13, color: t.text2))),
      errorText(context, error),
      if (!ro) Padding(padding: const EdgeInsets.only(top: 14), child: Row(children: [
        if (item != null) PillButton(label: 'Sil', danger: true, onPressed: remove),
        const Spacer(),
        PillButton(label: 'Vazgeç', onPressed: () => Navigator.of(context).pop()),
        const SizedBox(width: 8),
        PillButton(label: busy ? 'Kaydediliyor…' : 'Kaydet', primary: true, busy: busy, onPressed: submit),
      ])),
    ]));
  }
}
