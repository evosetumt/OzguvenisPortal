import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../widgets/glass.dart';
import 'customer_picker.dart';
import 'fields.dart';

/// Web TaskForm: "Yeni görev" formu (çekmece olarak). Oluşturulunca görev kimliğini döner.
Future<int?> showTaskForm(BuildContext context, {required List<Project> projects, required List<TaskStatus> statuses, required List<UserRef> users, int? initialStatusId}) =>
    showGlassSheet<int>(context, builder: (c) => TaskForm(projects: projects, statuses: statuses, users: users, initialStatusId: initialStatusId));

class TaskForm extends StatefulWidget {
  const TaskForm({super.key, required this.projects, required this.statuses, required this.users, this.initialStatusId});
  final List<Project> projects;
  final List<TaskStatus> statuses;
  final List<UserRef> users;
  final int? initialStatusId;
  @override
  State<TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<TaskForm> {
  final _title = TextEditingController(), _desc = TextEditingController();
  int? projectId, assigneeId;
  late int? statusId = widget.initialStatusId ?? widget.statuses.firstOrNull?.id;
  String? dueDate;
  String priority = 'normal', taskType = 'general', customerRef = '';
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    assigneeId = context.read<AuthController>().me!.id;
  }

  @override
  void dispose() { _title.dispose(); _desc.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty) { setState(() => error = 'Başlık gerekli'); return; }
    setState(() { busy = true; error = ''; });
    try {
      final t = await Api.i.post('/tasks', {
        'title': _title.text,
        if (_desc.text.isNotEmpty) 'description': _desc.text,
        'projectId': projectId,
        'statusId': statusId,
        'assigneeId': assigneeId,
        'dueDate': dueDate,
        'priority': priority,
        'taskType': taskType,
        'customerRef': taskType != 'general' && customerRef.isNotEmpty ? customerRef : null,
      });
      if (mounted) Navigator.pop(context, (t['id'] as num).toInt());
    } catch (e) {
      if (mounted) setState(() { error = e is ApiError ? e.message : 'Kaydedilemedi'; busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Yeni görev', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
          const SizedBox(height: 14),
          FieldBox('Başlık', child: TextField(controller: _title, autofocus: true, maxLength: 250, decoration: const InputDecoration(counterText: ''))),
          FieldBox('Açıklama', child: TextField(controller: _desc, minLines: 3, maxLines: 6)),
          Row(children: [
            Expanded(child: FieldBox('Proje', child: SelectField<int?>(value: projectId, items: [(null, '—'), for (final p in widget.projects) (p.id, p.name)], onChanged: (v) => setState(() => projectId = v)))),
            const SizedBox(width: 12),
            Expanded(child: FieldBox('Durum', child: SelectField<int?>(value: statusId, items: [for (final s in widget.statuses) (s.id, s.name)], onChanged: (v) => setState(() => statusId = v)))),
          ]),
          Row(children: [
            Expanded(child: FieldBox('Atanan', child: SelectField<int?>(value: assigneeId, items: [(null, 'Atanmamış'), for (final u in widget.users) (u.id, u.fullName)], onChanged: (v) => setState(() => assigneeId = v)))),
            const SizedBox(width: 12),
            Expanded(child: FieldBox('Bitiş tarihi', child: DateField(value: dueDate, onChanged: (v) => setState(() => dueDate = v)))),
          ]),
          Row(children: [
            Expanded(child: FieldBox('Öncelik', child: SelectField<String?>(value: priority, items: [for (final e in priorityLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => priority = v!)))),
            const SizedBox(width: 12),
            Expanded(child: FieldBox('Tür', child: SelectField<String?>(value: taskType, items: [for (final e in taskTypeLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => taskType = v!)))),
          ]),
          if (taskType != 'general')
            FieldBox('Netsis cari kodu',
                hint: "Netsis'te bu cari için ${taskType == 'erp_order' ? 'sipariş' : 'teklif'} girildiğinde görev otomatik tamamlanır.",
                child: CustomerPicker(value: customerRef, onChanged: (v) => customerRef = v)),
          if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(error, style: TextStyle(color: t.danger, fontSize: 14))),
          const SizedBox(height: 4),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
            const SizedBox(width: 10),
            PillButton(label: busy ? 'Kaydediliyor…' : 'Oluştur', primary: true, busy: busy, onPressed: _submit),
          ]),
        ]),
      ),
    );
  }
}
