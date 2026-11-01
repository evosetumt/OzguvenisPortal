// BPMN XML'i okunur akış listesine çevirir (web bpmn-js tasarımcı/izleyicisinin salt okunur mobil karşılığı).
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../../models/workflow.dart';

class BpmnNode {
  BpmnNode(this.id, this.type, this.name);
  final String id, type, name;
  final List<({String target, String label})> next = [];
}

const _types = [
  'startEvent', 'endEvent', 'userTask', 'serviceTask', 'scriptTask', 'manualTask', 'sendTask', 'receiveTask', 'businessRuleTask', 'task',
  'callActivity', 'subProcess', 'exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway',
  'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent',
];

String? _attr(String s, String name) => RegExp('(?:^|\\s)$name\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').firstMatch(s)?.let((m) => m.group(1) ?? m.group(2));

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}

String _unescape(String s) => s
    .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&#10;', ' ');

/// Akış adımlarını başlangıçtan itibaren genişlik-öncelikli sırayla döndürür; bağlı olmayanlar sona eklenir.
List<BpmnNode> parseBpmn(String xml) {
  final nodes = <String, BpmnNode>{};
  final order = <String>[];
  final tagRe = RegExp('<(?:[A-Za-z0-9_]+:)?(${_types.join('|')})\\b([^>]*?)/?>');
  for (final m in tagRe.allMatches(xml)) {
    final id = _attr(m.group(2)!, 'id');
    if (id == null || nodes.containsKey(id)) continue;
    nodes[id] = BpmnNode(id, m.group(1)!, _unescape(_attr(m.group(2)!, 'name') ?? ''));
    order.add(id);
  }
  final flowRe = RegExp(r'<(?:[A-Za-z0-9_]+:)?sequenceFlow\b([^>]*?)/?>');
  for (final m in flowRe.allMatches(xml)) {
    final a = m.group(1)!;
    final s = _attr(a, 'sourceRef'), t = _attr(a, 'targetRef');
    if (s != null && t != null && nodes.containsKey(s) && nodes.containsKey(t)) nodes[s]!.next.add((target: t, label: _unescape(_attr(a, 'name') ?? '')));
  }
  final seen = <String>{};
  final out = <BpmnNode>[];
  final queue = <String>[...order.where((i) => nodes[i]!.type == 'startEvent')];
  void drain() {
    while (queue.isNotEmpty) {
      final id = queue.removeAt(0);
      if (!seen.add(id)) continue;
      final n = nodes[id]!;
      out.add(n);
      queue.addAll(n.next.map((e) => e.target));
    }
  }
  drain();
  for (final id in order) {
    if (!seen.contains(id) && nodes[id]!.type != 'boundaryEvent') { queue.add(id); drain(); }
  }
  for (final id in order) {
    if (seen.add(id)) out.add(nodes[id]!);
  }
  return out;
}

String nodeTypeLabel(String type) => switch (type) {
      'startEvent' => 'Başlangıç',
      'endEvent' => 'Bitiş',
      'userTask' => 'Kullanıcı görevi',
      'serviceTask' || 'scriptTask' || 'businessRuleTask' || 'sendTask' => 'Otomatik adım',
      'manualTask' => 'Manuel görev',
      'receiveTask' => 'Bekleme',
      'exclusiveGateway' => 'Karar (biri)',
      'parallelGateway' => 'Paralel kol',
      'inclusiveGateway' => 'Karar (bir veya birkaçı)',
      'eventBasedGateway' => 'Olay bekleme',
      'callActivity' || 'subProcess' => 'Alt süreç',
      'boundaryEvent' => 'Sınır olayı',
      _ => type.contains('Event') ? 'Ara olay' : 'Adım',
    };

IconData _icon(String type) => switch (type) {
      'startEvent' => LucideIcons.circlePlay,
      'endEvent' => LucideIcons.circleStop,
      'userTask' => LucideIcons.user,
      'serviceTask' || 'scriptTask' || 'businessRuleTask' || 'sendTask' => LucideIcons.cog,
      'manualTask' => LucideIcons.hand,
      _ when type.endsWith('Gateway') => LucideIcons.gitFork,
      _ when type.contains('Event') => LucideIcons.circleDot,
      _ => LucideIcons.squareCheck,
    };

/// Akış adımları listesi. [highlight] verilirse tamamlanan/bekleyen/hatalı adımlar renklenir (web InstanceViewer).
class FlowList extends StatelessWidget {
  const FlowList({super.key, required this.xml, this.highlight});
  final String xml;
  final InstanceHighlight? highlight;

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final nodes = parseBpmn(xml);
    if (nodes.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text('Akış adımı bulunamadı', style: TextStyle(color: t.text3)));
    final names = {for (final n in nodes) n.id: n.name.isNotEmpty ? n.name : nodeTypeLabel(n.type)};
    final h = highlight;
    return Column(children: [
      for (var i = 0; i < nodes.length; i++) _step(context, i, nodes[i], names, h, i == nodes.length - 1),
      if (h != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(spacing: 14, runSpacing: 6, children: [
            _legend(t, t.green, 'Tamamlandı'), _legend(t, t.blue, 'Bekliyor'), _legend(t, t.danger, 'Hata'),
          ]),
        ),
    ]);
  }

  Widget _legend(Tokens t, Color c, String s) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 12, height: 12, decoration: BoxDecoration(color: c.withValues(alpha: .25), border: Border.all(color: c), borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 6),
        Text(s, style: TextStyle(fontSize: 12.5, color: t.text2)),
      ]);

  Widget _step(BuildContext c, int i, BpmnNode n, Map<String, String> names, InstanceHighlight? h, bool last) {
    final t = c.tk;
    Color? tone;
    if (h != null) {
      if (h.failed == n.id) {
        tone = t.danger;
      } else if (h.active.contains(n.id)) {
        tone = t.blue;
      } else if (h.completed.contains(n.id)) {
        tone = t.green;
      }
    }
    final col = tone ?? t.text2;
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 36,
          child: Column(children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(color: (tone ?? t.text2).withValues(alpha: .16), shape: BoxShape.circle, border: Border.all(color: col, width: tone == null ? 1 : 1.6)),
              child: Icon(_icon(n.type), size: 16, color: col),
            ),
            if (!last) Expanded(child: Container(width: 2, color: t.sep)),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n.name.isNotEmpty ? n.name : nodeTypeLabel(n.type), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: tone ?? t.text)),
              Text(nodeTypeLabel(n.type), style: TextStyle(fontSize: 12.5, color: t.text2)),
              for (final e in n.next)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('→ ${e.label.isNotEmpty ? '[${e.label}] ' : ''}${names[e.target] ?? e.target}', style: TextStyle(fontSize: 13, color: t.text3)),
                ),
            ]),
          ),
        ),
      ]),
    );
  }
}
