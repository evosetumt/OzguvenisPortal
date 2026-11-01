// Web WorkflowsPage.tsx → Instances / InstanceDetail: süreç örnekleri ve çalışma durumu izleme.
import 'package:flutter/material.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/workflow.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';
import 'bpmn_flow.dart';

class InstancesTab extends StatefulWidget {
  const InstancesTab({super.key});
  @override
  State<InstancesTab> createState() => _InstancesTabState();
}

class _InstancesTabState extends State<InstancesTab> {
  String status = '';
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: DropF<String>(label: 'Durum', value: status, items: [('', 'Tüm durumlar'), for (final e in instanceStatusLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => status = v ?? '')),
      ),
      Expanded(
        child: ApiView<List<ProcessInstanceItem>>(
          path: '/process-instances${status.isEmpty ? '' : '?status=$status'}',
          decode: (j) => (j as List).map((e) => ProcessInstanceItem.fromJson(Map<String, dynamic>.from(e))).toList(),
          builder: (c, rows, reload) => RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
              if (rows.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Kayıt yok', style: TextStyle(color: t.text3)))),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Glass(
                    radius: 18,
                    padding: const EdgeInsets.all(14),
                    onTap: () => showGlassSheet<void>(c, full: true, builder: (x) => _InstanceSheet(id: r.id, head: r)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(child: Text(r.businessKey ?? '${r.definitionName} #${r.id}', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text))),
                        const SizedBox(width: 8),
                        statusChip(c, r.status, instanceStatusLabel[r.status] ?? r.status),
                      ]),
                      const SizedBox(height: 4),
                      Text('#${r.id} · ${r.definitionName} v${r.definitionVersion}', style: TextStyle(fontSize: 13, color: t.text2)),
                      if (r.tasks.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text('Bekleyen: ${r.tasks.map((k) => '${k.name} (${k.assignee?.fullName ?? k.candidateRole ?? '—'})').join(', ')}', style: TextStyle(fontSize: 13, color: t.text2)),
                        ),
                      Padding(padding: const EdgeInsets.only(top: 4), child: Text('${r.startedBy?.fullName ?? '—'} · ${timeAgo(r.startedAt)}', style: TextStyle(fontSize: 12.5, color: t.text3))),
                    ]),
                  ),
                ),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class _InstanceSheet extends StatelessWidget {
  const _InstanceSheet({required this.id, required this.head});
  final int id;
  final ProcessInstanceItem head;
  @override
  Widget build(BuildContext context) => SheetFrame(
        title: head.businessKey ?? 'Süreç #$id',
        child: ApiView<ProcessInstanceDetail>(
          path: '/process-instances/$id',
          decode: (j) => ProcessInstanceDetail.fromJson(Map<String, dynamic>.from(j)),
          builder: (c, inst, _) {
            final t = c.tk;
            final h = inst.head;
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                Text('${h.definitionName} v${h.definitionVersion}', style: TextStyle(color: t.text2)),
                statusChip(c, h.status, instanceStatusLabel[h.status] ?? h.status),
                Text('${h.startedBy?.fullName ?? '—'} · ${shortDate(h.startedAt)}', style: TextStyle(color: t.text2)),
              ]),
              if (h.error != null && h.error!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: errorNote(c, h.error!)),
              h4(c, 'Akış'),
              FlowList(xml: inst.bpmnXml, highlight: inst.highlight),
              h4(c, 'Görevler'),
              for (final k in inst.tasks)
                TimelineRow(
                  title: k.name,
                  color: k.status == 'open' ? t.orange : (k.decision == 'rejected' ? t.danger : t.green),
                  sub: k.status == 'open'
                      ? 'bekliyor · ${k.assignee?.fullName ?? k.candidateRole ?? ''}'
                      : '${decisionDoneOr(k)} · ${k.completedBy?.fullName ?? ''}',
                  note: k.comment,
                ),
              if (inst.tasks.isEmpty) emptyNote(c, 'Kullanıcı görevi yok'),
              h4(c, 'Olay günlüğü'),
              for (final e in inst.events.where((e) => e.type != 'entered'))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Expanded(child: Text.rich(TextSpan(children: [
                      TextSpan(text: eventLabel[e.type] ?? e.type),
                      if (e.elementId != null) TextSpan(text: ' · ${e.elementId}', style: TextStyle(fontSize: 12, color: t.text3)),
                    ]), style: TextStyle(fontSize: 14, color: t.text))),
                    Text(fmtTime(e.at), style: TextStyle(fontSize: 12, color: t.text3)),
                  ]),
                ),
              h4(c, 'Değişkenler'),
              for (final e in inst.variables.entries) KV(e.key, '${e.value ?? '—'}'),
              if (inst.variables.isEmpty) emptyNote(c, '—'),
            ]);
          },
        ),
      );
}

String decisionDoneOr(InstanceTask k) {
  const m = {'approved': 'Onaylandı', 'rejected': 'Reddedildi', 'paid': 'Ödendi'};
  return m[k.decision ?? ''] ?? k.status;
}
