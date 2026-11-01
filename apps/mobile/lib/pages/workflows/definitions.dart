// Web WorkflowsPage.tsx → Definitions (salt okunur): tanım listesi ve adım akışı.
import 'package:flutter/material.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/workflow.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';
import 'bpmn_flow.dart';

class DefinitionsTab extends StatelessWidget {
  const DefinitionsTab({super.key});
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return ApiView<List<ProcessDefinition>>(
      path: '/process-definitions',
      decode: (j) => (j as List).map((e) => ProcessDefinition.fromJson(Map<String, dynamic>.from(e))).toList(),
      builder: (c, defs, reload) {
        final groups = <String, List<ProcessDefinition>>{};
        for (final d in defs) { groups.putIfAbsent(d.key, () => []).add(d); }
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
            if (defs.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Henüz süreç tanımı yok', style: TextStyle(color: t.text3)))),
            for (final versions in groups.values)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Glass(
                  radius: 20,
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text.rich(TextSpan(children: [
                      TextSpan(text: (versions.where((v) => v.status == 'active').firstOrNull ?? versions.first).name),
                      TextSpan(text: '  ${versions.first.key}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: t.text3, fontFamily: 'monospace')),
                    ]), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text)),
                    const SizedBox(height: 6),
                    for (final d in versions)
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => showGlassSheet<void>(c, builder: (x) => _DefinitionSheet(id: d.id, head: d)),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(children: [
                            Text('v${d.version}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
                            const SizedBox(width: 10),
                            statusChip(c, d.status == 'archived' ? 'x' : d.status == 'draft' ? 'draft' : 'active', defStatusLabel[d.status] ?? d.status),
                            const Spacer(),
                            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                              Text('${d.instanceCount} süreç', style: TextStyle(fontSize: 13, color: t.text)),
                              Text(timeAgo(d.updatedAt), style: TextStyle(fontSize: 12, color: t.text3)),
                            ]),
                          ]),
                        ),
                      ),
                  ]),
                ),
              ),
          ]),
        );
      },
    );
  }
}

class _DefinitionSheet extends StatelessWidget {
  const _DefinitionSheet({required this.id, required this.head});
  final int id;
  final ProcessDefinition head;
  @override
  Widget build(BuildContext context) => SheetFrame(
        title: '${head.name} v${head.version}',
        leading: head.key,
        child: ApiView<ProcessDefinition>(
          path: '/process-definitions/$id',
          decode: (j) => ProcessDefinition.fromJson(Map<String, dynamic>.from(j)),
          builder: (c, d, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            KV('Durum', defStatusLabel[d.status] ?? d.status),
            KV('Süreç sayısı', '${d.instanceCount}'),
            KV('Oluşturan', d.createdBy?.fullName),
            KV('Güncellendi', timeAgo(d.updatedAt)),
            h4(c, 'Akış adımları'),
            FlowList(xml: d.bpmnXml ?? ''),
          ]),
        ),
      );
}
