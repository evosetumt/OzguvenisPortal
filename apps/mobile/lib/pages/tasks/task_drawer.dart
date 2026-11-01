import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import '../shared/format.dart';
import '../shared/ui.dart';
import 'customer_picker.dart';
import 'fields.dart';

/// Web TaskDrawer: görev ayrıntısı (alttan açılan tam sayfa).
Future<void> showTaskDrawer(BuildContext context, {required int taskId, required List<Project> projects, required List<TaskStatus> statuses, required List<UserRef> users, required VoidCallback onChanged}) =>
    showGlassSheet<void>(context, full: true, builder: (c) => TaskDrawer(taskId: taskId, projects: projects, statuses: statuses, users: users, onChanged: onChanged));

class TaskDrawer extends StatefulWidget {
  const TaskDrawer({super.key, required this.taskId, required this.projects, required this.statuses, required this.users, required this.onChanged});
  final int taskId;
  final List<Project> projects;
  final List<TaskStatus> statuses;
  final List<UserRef> users;
  final VoidCallback onChanged;
  @override
  State<TaskDrawer> createState() => _TaskDrawerState();
}

class _TaskDrawerState extends State<TaskDrawer> {
  late final ApiData<TaskDetail> d = ApiData<TaskDetail>('/tasks/${widget.taskId}', decode: (j) => TaskDetail.fromJson(Map<String, dynamic>.from(j)));
  final _title = TextEditingController(), _desc = TextEditingController(), _sub = TextEditingController(), _comment = TextEditingController();
  final _docNo = TextEditingController();
  final _focusTitle = FocusNode(), _focusDesc = FocusNode(), _focusDoc = FocusNode();
  String err = '';
  bool _synced = false;

  @override
  void initState() {
    super.initState();
    d.addListener(_sync);
    _focusTitle.addListener(() { if (!_focusTitle.hasFocus) _commitTitle(); });
    _focusDesc.addListener(() { if (!_focusDesc.hasFocus) _commitDesc(); });
    _focusDoc.addListener(() { if (!_focusDoc.hasFocus) _commitDoc(); });
  }

  /// Sunucudan gelen başlık/açıklamayı alanlara yansıt (web useEffect).
  void _sync() {
    final t = d.data;
    if (t == null) return;
    if (!_synced || (_title.text != t.title && !_focusTitle.hasFocus)) _title.text = t.title;
    if (!_synced || (_desc.text != (t.description ?? '') && !_focusDesc.hasFocus)) _desc.text = t.description ?? '';
    if (!_synced || (_docNo.text != (t.erpDocNo ?? '') && !_focusDoc.hasFocus)) _docNo.text = t.erpDocNo ?? '';
    _synced = true;
  }

  void _commitTitle() {
    final t = d.data;
    if (t == null || !t.canEdit) return;
    if (_title.text.trim().isNotEmpty && _title.text != t.title) _patch({'title': _title.text});
  }

  void _commitDesc() {
    final t = d.data;
    if (t == null || !t.canEdit) return;
    if (_desc.text != (t.description ?? '')) _patch({'description': _desc.text.isEmpty ? null : _desc.text});
  }

  void _commitDoc() {
    final t = d.data;
    if (t == null || !t.canEdit) return;
    if (_docNo.text != (t.erpDocNo ?? '')) _patch({'erpDocNo': _docNo.text.isEmpty ? null : _docNo.text});
  }

  @override
  void dispose() {
    d.removeListener(_sync);
    d.dispose();
    for (final c in [_title, _desc, _sub, _comment, _docNo]) { c.dispose(); }
    for (final f in [_focusTitle, _focusDesc, _focusDoc]) { f.dispose(); }
    super.dispose();
  }

  Future<bool> _run(Future<dynamic> Function() fn) async {
    setState(() => err = '');
    try {
      await fn();
      await d.reload(silent: true);
      widget.onChanged();
      return true;
    } catch (e) {
      if (mounted) setState(() => err = e is ApiError ? e.message : 'İşlem başarısız');
      return false;
    }
  }

  Future<void> _patch(Map<String, dynamic> body) async {
    setState(() => err = '');
    try {
      await Api.i.patch('/tasks/${widget.taskId}', body);
      await d.reload(silent: true);
      widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => err = e is ApiError ? e.message : 'İşlem başarısız');
    }
  }

  Future<void> _remove() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Görev silinsin mi?'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Sil'))],
      ),
    );
    if (ok != true) return;
    if (await _run(() => Api.i.delete('/tasks/${widget.taskId}')) && mounted) Navigator.pop(context);
  }

  void _go(String path) {
    final r = GoRouter.of(context);
    Navigator.pop(context);
    r.go(path);
  }

  Future<void> _addSub() async {
    if (_sub.text.trim().isEmpty) return;
    final v = _sub.text;
    if (await _run(() => Api.i.post('/tasks/${widget.taskId}/subtasks', {'title': v}))) _sub.clear();
  }

  Future<void> _addComment() async {
    if (_comment.text.trim().isEmpty) return;
    final v = _comment.text;
    if (await _run(() => Api.i.post('/tasks/${widget.taskId}/comments', {'body': v}))) {
      _comment.clear();
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final meId = context.read<AuthController>().me!.id;
    return ListenableBuilder(
      listenable: d,
      builder: (context, _) {
        final x = d.data;
        final ro = x == null || !x.canEdit;
        return SafeArea(
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 8, 0),
              child: Row(children: [
                Expanded(child: Text.rich(TextSpan(children: [
                  TextSpan(text: '#${widget.taskId}'),
                  if (x?.project != null) ...[
                    const TextSpan(text: ' · '),
                    TextSpan(text: '● ', style: TextStyle(color: hexColor(x!.project!.color))),
                    TextSpan(text: x.project!.name),
                  ],
                ]), style: TextStyle(fontSize: 13.5, color: t.text2), overflow: TextOverflow.ellipsis)),
                if (x?.canEdit == true) IconButton(tooltip: 'Sil', icon: const Icon(LucideIcons.trash2, size: 18), onPressed: _remove),
                IconButton(tooltip: 'Kapat', icon: const Icon(LucideIcons.x, size: 20), onPressed: () => Navigator.pop(context)),
              ]),
            ),
            Expanded(
              child: x == null
                  ? Center(child: d.error.isNotEmpty ? Text(d.error, style: TextStyle(color: t.danger)) : const CircularProgressIndicator())
                  : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 24), children: _body(context, x, ro, meId)),
            ),
          ]),
        );
      },
    );
  }

  List<Widget> _body(BuildContext context, TaskDetail x, bool ro, int meId) {
    final t = context.tk;
    Widget callout(String title, String sub, String btn, String path, bool primary) => Container(
          margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: t.accentSoft, borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
              Text(sub, style: TextStyle(fontSize: 13, color: t.text2)),
            ])),
            const SizedBox(width: 10),
            PillButton(label: btn, primary: primary, onPressed: () => _go(path)),
          ]),
        );
    final doneCount = x.subtasks.where((s) => s.done).length;
    return [
      TextField(
        controller: _title, focusNode: _focusTitle, readOnly: ro, maxLength: 250,
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text),
        decoration: const InputDecoration(counterText: ''),
        onTapOutside: (_) => _focusTitle.unfocus(),
      ),
      if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(err, style: TextStyle(color: t.danger, fontSize: 14))),
      const SizedBox(height: 12),
      if (x.relatedType == 'process_task' && x.relatedId != null && !x.status.isDone)
        callout('Onay görevi', 'Onaylamak veya reddetmek için karar ekranını açın; karar verilince görev kendiliğinden tamamlanır.', 'Karar ver', '/approvals?task=${x.relatedId}', true),
      if (x.relatedType == 'payment' && x.relatedId != null)
        callout('Ödeme görevi', 'Görev tamamlanınca ödeme "ödendi" olarak işaretlenir.', 'Ödemeyi aç', '/payments?id=${x.relatedId}', false),
      FieldBox('Durum', child: SelectField<int?>(value: x.statusId, disabled: ro, items: [for (final s in widget.statuses) (s.id, s.name)], onChanged: (v) => _patch({'statusId': v}))),
      FieldBox('Atanan', child: SelectField<int?>(value: x.assigneeId, disabled: ro, items: [(null, 'Atanmamış'), for (final u in widget.users) (u.id, u.fullName)], onChanged: (v) => _patch({'assigneeId': v}))),
      FieldBox('Proje', child: SelectField<int?>(value: x.projectId, disabled: ro, items: [(null, '—'), for (final p in widget.projects) (p.id, p.name)], onChanged: (v) => _patch({'projectId': v}))),
      FieldBox('Öncelik', child: SelectField<String?>(value: x.priority, disabled: ro, items: [for (final e in priorityLabel.entries) (e.key, e.value)], onChanged: (v) => _patch({'priority': v}))),
      FieldBox('Bitiş', child: DateField(value: x.dueDate, disabled: ro, onChanged: (v) => _patch({'dueDate': v}))),
      FieldBox('Tür', child: SelectField<String?>(value: x.taskType, disabled: ro, items: [for (final e in taskTypeLabel.entries) (e.key, e.value)], onChanged: (v) => _patch({'taskType': v}))),
      if (x.taskType != 'general') ...[
        FieldBox('Cari kodu', child: CustomerPicker(key: ValueKey(x.customerRef ?? ''), value: x.customerRef ?? '', disabled: ro, onChanged: (_) {},
            onCommit: (v) { if (v != (x.customerRef ?? '')) _patch({'customerRef': v.isEmpty ? null : v}); })),
        FieldBox('Belge no', child: TextField(
          controller: _docNo, focusNode: _focusDoc, readOnly: ro, maxLength: 60,
          decoration: const InputDecoration(hintText: "Netsis'te oluşunca dolar", counterText: ''),
          onTapOutside: (_) => _focusDoc.unfocus(),
        )),
        if (x.completedViaErp)
          FieldBox('Netsis', child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Chip2("Netsis'te tamamlandı", color: t.green, bg: t.green.withValues(alpha: .16)),
            if (x.relatedId != null)
              TextButton(
                onPressed: () => _go('/orders?${x.relatedType == 'erp_quote' ? 'tab=quotes&' : ''}q=${Uri.encodeQueryComponent(x.relatedId!)}'),
                child: Text('${x.relatedType == 'erp_quote' ? 'Teklif' : 'Sipariş'} ${x.relatedId}'),
              ),
          ])),
      ],
      FieldBox('Oluşturan', child: Padding(padding: const EdgeInsets.only(left: 4), child: Text(x.createdBy.fullName, style: TextStyle(fontSize: 16, color: t.text)))),
      sectionTitle(context, 'Açıklama'),
      TextField(controller: _desc, focusNode: _focusDesc, readOnly: ro, minLines: 4, maxLines: 10,
          decoration: InputDecoration(hintText: ro ? '' : 'Ayrıntı ekleyin…'), onTapOutside: (_) => _focusDesc.unfocus()),
      sectionTitle(context, 'Alt görevler', count: '$doneCount/${x.subtasks.length}'),
      for (final s in x.subtasks)
        Row(children: [
          Checkbox(value: s.done, onChanged: ro ? null : (_) => _run(() => Api.i.patch('/subtasks/${s.id}', {'done': !s.done}))),
          Expanded(child: Text(s.title, style: TextStyle(fontSize: 15, color: s.done ? t.text3 : t.text, decoration: s.done ? TextDecoration.lineThrough : null))),
          if (!ro) IconButton(tooltip: 'Sil', icon: const Icon(LucideIcons.x, size: 16), onPressed: () => _run(() => Api.i.delete('/subtasks/${s.id}'))),
        ]),
      if (!ro) TextField(controller: _sub, maxLength: 250, textInputAction: TextInputAction.done, onSubmitted: (_) => _addSub(),
          decoration: const InputDecoration(hintText: 'Alt görev ekle…', counterText: '')),
      sectionTitle(context, 'Yorumlar'),
      for (final c in x.comments)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Avatar(name: c.user.fullName, src: c.user.avatarUrl, size: 28),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(c.user.fullName, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                Text(timeAgo(c.createdAt), style: TextStyle(fontSize: 12.5, color: t.text2)),
                if (c.user.id == meId)
                  GestureDetector(onTap: () => _run(() => Api.i.delete('/comments/${c.id}')), child: Text('sil', style: TextStyle(fontSize: 12.5, color: t.accentInk, fontWeight: FontWeight.w600))),
              ]),
              Text(c.body, style: TextStyle(fontSize: 15, color: t.text)),
            ])),
          ]),
        ),
      TextField(controller: _comment, minLines: 2, maxLines: 5, maxLength: 5000, onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Yorum yazın…', counterText: '')),
      const SizedBox(height: 8),
      Align(alignment: Alignment.centerRight, child: PillButton(label: 'Gönder', primary: true, onPressed: _comment.text.trim().isEmpty ? null : _addComment)),
    ];
  }
}
