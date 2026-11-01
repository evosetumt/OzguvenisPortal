// Web pages/ApprovalsPage.tsx: Onaylarım kutusu (kullanıcıya atanmış veya rolüne açık süreç görevleri).
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/api.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/expenses.dart';
import '../models/workflow.dart';
import '../widgets/avatar.dart';
import '../widgets/glass.dart';
import 'expenses/expense_summary.dart';
import 'expenses/ui.dart';

/// businessKey "Masraf #20 · Emre Arslan · 1.850,00 TL" → başlık ve tutar ayrı gösterilir.
({String title, String? amount}) _splitKey(ProcessTaskItem t) {
  final parts = (t.businessKey ?? t.definitionName).split(' · ');
  String? amount;
  if (parts.length > 1 && RegExp(r'\d.*(TL|USD|EUR|₺)$').hasMatch(parts.last)) amount = parts.removeLast();
  return (title: parts.join(' · '), amount: amount);
}

class ApprovalsPage extends StatefulWidget {
  const ApprovalsPage({super.key});
  @override
  State<ApprovalsPage> createState() => _ApprovalsPageState();
}

class _ApprovalsPageState extends State<ApprovalsPage> with WidgetsBindingObserver {
  String tab = 'open';
  late final ApiData<List<ProcessTaskItem>> d;
  Timer? _poll;

  String get _path => '/process-tasks/mine${tab == 'done' ? '?status=done' : ''}';

  @override
  void initState() {
    super.initState();
    d = ApiData<List<ProcessTaskItem>>(_path, decode: (j) => (j as List).map((e) => ProcessTaskItem.fromJson(Map<String, dynamic>.from(e))).toList());
    // Yeni gelen onaylar için liste 30 sn'de bir ve uygulamaya dönünce tazelenir
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => d.reload(silent: true));
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) d.reload(silent: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    d.dispose();
    super.dispose();
  }

  void _setTab(String v) {
    setState(() { tab = v; d.data = null; });
    d.setPath(_path);
  }

  Future<void> _open(ProcessTaskItem task) async {
    final done = await showGlassSheet<bool>(context, builder: (c) => SheetFrame(title: task.name, child: _TaskPanel(task: task)));
    if (done == true) d.reload();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const PageHead(title: 'Onaylarım', sub: 'Onayınızı bekleyen iş akışı görevleri'),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Seg<String>(items: const [('open', 'Bekleyen'), ('done', 'Tamamladıklarım')], value: tab, onChanged: _setTab),
      ),
      Expanded(
        child: ListenableBuilder(
          listenable: d,
          builder: (c, _) {
            final tasks = d.data;
            if (tasks == null) {
              return d.error.isNotEmpty ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(d.error, textAlign: TextAlign.center))) : const Center(child: CircularProgressIndicator());
            }
            return RefreshIndicator(
              onRefresh: () => d.reload(),
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
                Padding(padding: const EdgeInsets.only(bottom: 8, left: 4), child: Text('${tasks.length} görev', style: TextStyle(color: t.text2, fontSize: 13))),
                if (tasks.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text(tab == 'open' ? 'Bekleyen onay yok 🎉' : 'Kayıt yok', style: TextStyle(color: t.text3)))),
                for (final k in tasks) _row(c, k),
              ]),
            );
          },
        ),
      ),
    ]);
  }

  Widget _row(BuildContext c, ProcessTaskItem k) {
    final t = c.tk;
    final s = _splitKey(k);
    final who = k.startedBy;
    final late = k.overdue && k.status == 'open';
    final dec = k.decision ?? '';
    final decColor = dec == 'rejected' ? t.danger : (dec == 'approved' || dec == 'paid' ? t.green : t.text2);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Glass(
        radius: 18,
        onTap: () => _open(k),
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          if (who != null)
            Avatar(name: who.fullName, src: who.avatarUrl, size: 40)
          else
            Container(width: 40, height: 40, decoration: BoxDecoration(color: t.fill, shape: BoxShape.circle), child: Icon(LucideIcons.receipt, size: 16, color: t.text2)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: late ? t.danger : t.text)),
              const SizedBox(height: 3),
              Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, runSpacing: 2, children: [
                Chip2(k.name, color: t.accentInk, bg: t.accentSoft),
                Text('${k.definitionName}${k.status == 'open' && k.candidateLabel != null ? ' · ${k.candidateLabel}' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            if (s.amount != null) Text(s.amount!, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.text)),
            const SizedBox(height: 4),
            if (k.status == 'open')
              (late ? Text('Gecikti', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: t.danger)) : Text(timeAgo(k.createdAt), style: TextStyle(fontSize: 12.5, color: t.text2)))
            else ...[
              Text(decisionDone[dec] ?? '—', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: decColor)),
              if (k.completedAt != null) Text(timeAgo(k.completedAt!), style: TextStyle(fontSize: 12, color: t.text3)),
            ],
          ]),
          Icon(LucideIcons.chevronRight, size: 18, color: t.text3),
        ]),
      ),
    );
  }
}

class _TaskPanel extends StatefulWidget {
  const _TaskPanel({required this.task});
  final ProcessTaskItem task;
  @override
  State<_TaskPanel> createState() => _TaskPanelState();
}

class _TaskPanelState extends State<_TaskPanel> {
  final comment = TextEditingController();
  bool busy = false;
  String err = '';

  @override
  void dispose() { comment.dispose(); super.dispose(); }

  Future<void> _decide(String decision) async {
    if (decision == 'rejected' && comment.text.trim().isEmpty) return setState(() => err = 'Red için açıklama yazın');
    setState(() { busy = true; err = ''; });
    try {
      await Api.i.post('/process-tasks/${widget.task.id}/complete', {'decision': decision, if (comment.text.trim().isNotEmpty) 'comment': comment.text.trim()});
      if (mounted) Navigator.pop(context, true);
    } catch (x) {
      if (mounted) setState(() { err = errMsg(x); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final k = widget.task;
    final isExpense = k.entityType == 'expense' && (k.entityId ?? '').isNotEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      KV('Süreç', '${k.definitionName} #${k.instanceId}'),
      KV('Başlatan', '${k.startedBy?.fullName ?? '—'} · ${shortDate(k.startedAt)}'),
      if (k.status == 'open' && k.dueAt != null)
        KV('Son tarih', null, child: Text(fmtDateTime(k.dueAt!), style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: k.overdue ? t.danger : t.text))),
      if (k.status != 'open') KV('Kararınız', '${decisionDone[k.decision ?? ''] ?? k.decision ?? '—'}${(k.comment ?? '').isNotEmpty ? ' · ${k.comment}' : ''}'),
      if (isExpense)
        ApiView<ExpenseDetail>(
          path: '/expenses/${k.entityId}',
          decode: (j) => ExpenseDetail.fromJson(Map<String, dynamic>.from(j)),
          builder: (c, e, _) => ExpenseSummary(e: e),
        ),
      if (k.status == 'open') ...[
        gap(16),
        TextF('Açıklama (red için zorunlu)', comment, lines: 2, maxLength: 1000),
        if (err.isNotEmpty) errorNote(context, err),
        gap(12),
        Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 10, children: [
          for (final dd in k.decisions)
            PillButton(
              label: decisionLabel[dd] ?? dd,
              primary: dd == 'approved',
              danger: dd == 'rejected',
              onPressed: busy ? null : () => _decide(dd),
            ),
        ]),
      ],
    ]);
  }
}
