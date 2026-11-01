import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/call.dart';
import '../../models/chat.dart';
import '../../widgets/glass.dart';
import '../chat/format.dart';

const _priorityLabel = {'low': 'Düşük', 'normal': 'Normal', 'high': 'Yüksek', 'urgent': 'Acil'};

/// Web MeetingSidePanel: kişiye özel not (otomatik kaydedilir), toplantıda açılan görevler ve katılım geçmişi.
/// [dark] arama odasında (koyu zemin) kullanılır.
class MeetingSidePanel extends StatefulWidget {
  const MeetingSidePanel({super.key, required this.meetingId, required this.canAssignTasks, this.dark = false});
  final int meetingId;
  final bool canAssignTasks, dark;
  @override
  State<MeetingSidePanel> createState() => _MeetingSidePanelState();
}

class _MeetingSidePanelState extends State<MeetingSidePanel> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final fg = widget.dark ? Colors.white : t.text;
    Widget seg(int i, String label) => Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 3), child: Material(
          color: tab == i ? t.accent : (widget.dark ? Colors.white12 : t.fill), shape: const StadiumBorder(),
          child: InkWell(customBorder: const StadiumBorder(), onTap: () => setState(() => tab = i), child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Center(child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: tab == i ? Colors.white : fg))),
          )),
        )));
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [seg(0, 'Notlarım'), seg(1, 'Görevler'), seg(2, 'Katılım')]),
      const SizedBox(height: 12),
      if (tab == 0) _MeetingNote(meetingId: widget.meetingId, dark: widget.dark)
      else if (tab == 1) _MeetingTasks(meetingId: widget.meetingId, canAssign: widget.canAssignTasks, dark: widget.dark)
      else _Attendance(meetingId: widget.meetingId, dark: widget.dark),
    ]);
  }
}

class _MeetingNote extends StatefulWidget {
  const _MeetingNote({required this.meetingId, required this.dark});
  final int meetingId;
  final bool dark;
  @override
  State<_MeetingNote> createState() => _MeetingNoteState();
}

class _MeetingNoteState extends State<_MeetingNote> {
  final ctl = TextEditingController();
  bool loaded = false;
  String loadError = '', status = '', statusKind = 'idle';
  Timer? timer;
  String? pending;

  @override
  void initState() {
    super.initState();
    Api.i.get('/meetings/${widget.meetingId}/note').then((r) {
      if (!mounted) return;
      setState(() {
        ctl.text = r['body'] as String? ?? '';
        loaded = true;
        if (r['updatedAt'] != null) { statusKind = 'saved'; status = 'Kaydedildi · ${formatTime(r['updatedAt'])}'; }
      });
    }).catchError((e) { if (mounted) setState(() => loadError = e is ApiError ? e.message : 'Yüklenemedi'); });
  }

  Future<void> save(String text) async {
    pending = null;
    if (mounted) setState(() { statusKind = 'saving'; status = 'Kaydediliyor…'; });
    try {
      final r = await Api.i.put('/meetings/${widget.meetingId}/note', {'body': text});
      if (mounted) setState(() { statusKind = 'saved'; status = 'Kaydedildi · ${formatTime(r['updatedAt'])}'; });
    } catch (e) {
      pending = text;
      if (mounted) setState(() { statusKind = 'error'; status = e is ApiError ? e.message : 'Kaydedilemedi'; });
    }
  }

  void change(String text) {
    pending = text;
    timer?.cancel();
    timer = Timer(const Duration(milliseconds: 800), () => save(text));
  }

  @override
  void dispose() {
    timer?.cancel();
    // Panel kapanırken bekleyen değişiklik kaybolmasın.
    final p = pending;
    if (p != null) Api.i.put('/meetings/${widget.meetingId}/note', {'body': p}).catchError((_) {});
    ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final fg = widget.dark ? Colors.white : t.text;
    final sub = widget.dark ? Colors.white70 : t.text2;
    if (loadError.isNotEmpty) return Text(loadError, style: TextStyle(color: t.danger));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Icon(LucideIcons.lock, size: 12, color: sub), const SizedBox(width: 4), Text('Bu not yalnızca size görünür.', style: TextStyle(fontSize: 12.5, color: sub))]),
      const SizedBox(height: 8),
      TextField(
        controller: ctl, enabled: loaded, minLines: 6, maxLines: 10, maxLength: 50000, onChanged: change,
        style: TextStyle(color: fg),
        decoration: InputDecoration(hintText: 'Toplantı notlarınızı buraya yazın…', hintStyle: TextStyle(color: sub), counterText: ''),
      ),
      if (status.isNotEmpty) Text(status, style: TextStyle(fontSize: 12.5, color: statusKind == 'error' ? t.danger : sub)),
    ]);
  }
}

class _MeetingTasks extends StatefulWidget {
  const _MeetingTasks({required this.meetingId, required this.canAssign, required this.dark});
  final int meetingId;
  final bool canAssign, dark;
  @override
  State<_MeetingTasks> createState() => _MeetingTasksState();
}

class _MeetingTasksState extends State<_MeetingTasks> {
  late final ApiData<List<MeetingTask>> d = ApiData('/meetings/${widget.meetingId}/tasks', decode: (j) => [for (final e in j as List) MeetingTask.fromJson(e as Map<String, dynamic>)]);
  bool adding = false;
  @override
  void dispose() { d.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final fg = widget.dark ? Colors.white : t.text;
    final sub = widget.dark ? Colors.white70 : t.text2;
    return ListenableBuilder(listenable: d, builder: (c, _) {
      final rows = d.data ?? const <MeetingTask>[];
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (d.error.isNotEmpty) Text(d.error, style: TextStyle(color: t.danger)),
        if (d.data != null && rows.isEmpty && !adding) Text('Bu toplantıda henüz görev açılmadı.', style: TextStyle(color: sub)),
        for (final k in rows) InkWell(
          onTap: () => GoRouter.maybeOf(context)?.go('/tasks?id=${k.id}'),
          child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(k.statusDone ? LucideIcons.circleCheck : LucideIcons.circle, size: 16, color: k.statusDone ? t.green : sub),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(k.title, style: TextStyle(fontWeight: FontWeight.w600, color: fg)),
              Text('${k.assignee?.fullName ?? 'Atanmamış'} · ${k.statusName}${k.dueDate != null ? ' · ${DateFormat('d.MM.yyyy', 'tr_TR').format(parseDt(k.dueDate!))}' : ''}',
                  style: TextStyle(fontSize: 12.5, color: sub)),
            ])),
          ])),
        ),
        if (widget.canAssign) ...[
          const SizedBox(height: 8),
          if (adding) _TaskForm(meetingId: widget.meetingId, dark: widget.dark, onCancel: () => setState(() => adding = false), onDone: () { setState(() => adding = false); d.reload(); })
          else PillButton(label: 'Görev aç', icon: LucideIcons.plus, onPressed: () => setState(() => adding = true)),
        ],
      ]);
    });
  }
}

class _TaskForm extends StatefulWidget {
  const _TaskForm({required this.meetingId, required this.dark, required this.onCancel, required this.onDone});
  final int meetingId;
  final bool dark;
  final VoidCallback onCancel, onDone;
  @override
  State<_TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<_TaskForm> {
  late final ApiData<List<UserRef>> users = ApiData('/users/directory', decode: (j) => userList(j));
  final title = TextEditingController(), desc = TextEditingController();
  int? assignee;
  DateTime? due;
  String priority = 'normal', error = '';
  bool busy = false;
  @override
  void dispose() { users.dispose(); title.dispose(); desc.dispose(); super.dispose(); }

  Future<void> submit() async {
    if (title.text.trim().isEmpty || assignee == null) { setState(() => error = 'Görev adı ve kişi gerekli'); return; }
    setState(() { busy = true; error = ''; });
    try {
      await Api.i.post('/meetings/${widget.meetingId}/tasks', {
        'title': title.text, 'assigneeId': assignee, 'priority': priority,
        if (due != null) 'dueDate': localKey(due!),
        if (desc.text.isNotEmpty) 'description': desc.text,
      });
      widget.onDone();
    } catch (e) {
      if (mounted) setState(() { error = e is ApiError ? e.message : 'Görev açılamadı'; busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final fg = widget.dark ? Colors.white : t.text;
    return ListenableBuilder(listenable: users, builder: (c, _) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(controller: title, maxLength: 250, style: TextStyle(color: fg), decoration: const InputDecoration(labelText: 'Görev', counterText: '')),
      const SizedBox(height: 8),
      DropdownButtonFormField<int>(
        initialValue: assignee, isExpanded: true, decoration: const InputDecoration(labelText: 'Kime'), hint: const Text('Kişi seçin'),
        dropdownColor: widget.dark ? const Color(0xFF2A2A30) : null, style: TextStyle(color: fg),
        items: [for (final u in users.data ?? const <UserRef>[]) DropdownMenuItem(value: u.id, child: Text(u.fullName))],
        onChanged: (v) => setState(() => assignee = v),
      ),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: OutlinedButton(
          onPressed: () async {
            final p = await showDatePicker(context: context, initialDate: due ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
            if (p != null) setState(() => due = p);
          },
          child: Text(due == null ? 'Bitiş' : DateFormat('d.MM.yyyy', 'tr_TR').format(due!)),
        )),
        const SizedBox(width: 8),
        Expanded(child: DropdownButtonFormField<String>(
          initialValue: priority, decoration: const InputDecoration(labelText: 'Öncelik'), style: TextStyle(color: fg),
          dropdownColor: widget.dark ? const Color(0xFF2A2A30) : null,
          items: [for (final e in _priorityLabel.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
          onChanged: (v) => setState(() => priority = v ?? 'normal'),
        )),
      ]),
      const SizedBox(height: 8),
      TextField(controller: desc, minLines: 2, maxLines: 4, style: TextStyle(color: fg), decoration: const InputDecoration(labelText: 'Açıklama')),
      if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(error, style: TextStyle(color: t.danger))),
      const SizedBox(height: 10),
      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
        PillButton(label: 'Vazgeç', onPressed: widget.onCancel),
        const SizedBox(width: 8),
        PillButton(label: busy ? 'Açılıyor…' : 'Görevi aç', primary: true, busy: busy, onPressed: submit),
      ]),
    ]));
  }
}

class _Attendance extends StatelessWidget {
  const _Attendance({required this.meetingId, required this.dark});
  final int meetingId;
  final bool dark;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final fg = dark ? Colors.white : t.text;
    final sub = dark ? Colors.white70 : t.text2;
    String tm(String? iso) => iso == null ? '…' : formatTime(iso);
    return ApiView<List<AttendanceSession>>(
      path: '/meetings/$meetingId/attendance',
      decode: (j) => [for (final e in j as List) AttendanceSession.fromJson(e as Map<String, dynamic>)],
      builder: (c, rows, _) => rows.isEmpty
          ? Text('Bu toplantıya henüz kimse katılmadı.', style: TextStyle(color: sub))
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final s in rows) Padding(padding: const EdgeInsets.only(bottom: 10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${DateFormat('d MMMM', 'tr_TR').format(parseDt(s.startedAt))} · ${tm(s.startedAt)} – ${s.endedAt != null ? tm(s.endedAt) : 'sürüyor'}', style: TextStyle(fontSize: 12.5, color: sub)),
                for (final p in s.participants) Padding(padding: const EdgeInsets.only(top: 4), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.fullName, style: TextStyle(fontWeight: FontWeight.w600, color: fg)),
                  Text('${tm(p.joinedAt)} – ${p.leftAt != null ? tm(p.leftAt) : s.endedAt != null ? tm(s.endedAt) : 'içeride'}', style: TextStyle(fontSize: 12.5, color: sub)),
                ])),
              ])),
            ]),
    );
  }
}
