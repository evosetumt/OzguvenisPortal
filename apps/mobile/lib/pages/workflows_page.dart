// Web pages/WorkflowsPage.tsx: süreç tanımları ve çalışan süreçlerin izlenmesi.
// Mobilde BPMN tasarımcı (bpmn-js) yoktur: tanım adımları salt okunur akış listesi olarak gösterilir.
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/theme.dart';
import '../widgets/glass.dart';
import 'expenses/ui.dart';
import 'workflows/definitions.dart';
import 'workflows/instances.dart';

class WorkflowsPage extends StatefulWidget {
  const WorkflowsPage({super.key});
  @override
  State<WorkflowsPage> createState() => _WorkflowsPageState();
}

class _WorkflowsPageState extends State<WorkflowsPage> {
  String tab = 'defs';
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const PageHead(title: 'Akış Tasarımcısı', sub: 'BPMN süreç tanımları ve çalışan süreçlerin izlenmesi'),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Glass(
          radius: 16,
          padding: const EdgeInsets.all(12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(LucideIcons.info, size: 16, color: t.text2),
            const SizedBox(width: 10),
            Expanded(child: Text('Mobilde akışlar yalnızca görüntülenir. Süreç tanımlarını düzenlemek için web uygulamasını kullanın.', style: TextStyle(fontSize: 13, color: t.text2))),
          ]),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Seg<String>(items: const [('defs', 'Süreçler'), ('monitor', 'İzleme')], value: tab, onChanged: (v) => setState(() => tab = v)),
      ),
      Expanded(child: tab == 'defs' ? const DefinitionsTab() : const InstancesTab()),
    ]);
  }
}
