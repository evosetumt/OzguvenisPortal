import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme.dart';
import '../../models/insights.dart';
import '../../widgets/glass.dart';
import 'insights_ui.dart';

String _initials(String n) => n.split(RegExp(r'\s+')).where((s) => s.isNotEmpty).take(2).map((s) => s[0].toUpperCase()).join();

/// İş yükü: kişi başı açık görev çubukları ve kapasite çizgisi.
class WorkloadCard extends StatelessWidget {
  const WorkloadCard(this.r, {super.key});
  final TaskReport r;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final cap = r.capacity;
    final scale = ([cap, ...r.workload.map((w) => w.open.toDouble())].reduce((a, b) => a > b ? a : b)) * 1.15;
    final over = r.workload.where((w) => w.open > cap).length;
    return InsCard(
      title: 'İş yükü', sub: 'Kişi başı açık görev, kapasite ${nf(cap)} görev',
      tools: Chip2(over > 0 ? '$over kişi kapasite üstünde' : 'Herkes kapasite içinde', color: over > 0 ? t.warn : t.text2, bg: over > 0 ? t.warn.withValues(alpha: .16) : null),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 14, children: [
          KeyDot(t.accentInk, 'Açık iş', line: false),
          KeyDot(t.text, 'Kapasite', line: false),
          KeyDot(t.warn, 'Kapasite üstü', line: false),
        ]),
        const SizedBox(height: 8),
        if (r.workload.isEmpty) Text('Atanmış görev yok.', style: TextStyle(color: t.text2)),
        for (final w in r.workload)
          Builder(builder: (c) {
            final color = w.open > cap ? t.warn : (w.open >= cap * .85 ? t.orange : t.accentInk);
            return InkWell(
              onTap: () => context.go('/tasks?assignee=${w.userId}'),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    CircleAvatar(radius: 14, backgroundColor: t.fill2, child: Text(_initials(w.fullName), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: t.text))),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(w.fullName, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                      Text(w.department ?? '${w.completed} tamamlandı', style: TextStyle(fontSize: 12, color: t.text2)),
                    ])),
                    Text.rich(TextSpan(children: [
                      TextSpan(text: '${w.open}', style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                      TextSpan(text: ' / ${nf(cap)}', style: TextStyle(color: t.text2)),
                    ])),
                  ]),
                  const SizedBox(height: 6),
                  Tooltip(
                    message: '${w.open} açık, ${w.overdue} geciken',
                    child: LayoutBuilder(builder: (c, box) => SizedBox(
                      height: 10,
                      child: Stack(clipBehavior: Clip.none, children: [
                        Container(decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(9))),
                        Container(width: box.maxWidth * (w.open / scale).clamp(0, 1), decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(9))),
                        Positioned(left: box.maxWidth * (cap / scale).clamp(0, 1) - 1, top: -2, bottom: -2, child: Container(width: 2, color: t.text)),
                      ]),
                    )),
                  ),
                ]),
              ),
            );
          }),
      ]),
    );
  }
}

/// Zamanında bitirme + en uzun süredir açık işler.
class OnTimeCard extends StatelessWidget {
  const OnTimeCard(this.r, {super.key});
  final TaskReport r;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final s = r.current;
    final known = s.onTime + s.late;
    return InsCard(
      title: 'Zamanında bitirme', sub: 'Son ${r.days} günde bitiş tarihli görevler',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(crossAxisAlignment: WrapCrossAlignment.end, spacing: 8, children: [
          Text(s.onTimeRate == null ? '–' : nf(s.onTimeRate!), style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: t.text)),
          if (s.onTimeRate != null) Text('%', style: TextStyle(fontSize: 18, color: t.text2)),
          Text('bitiş gününde veya öncesinde bitti', style: TextStyle(fontSize: 13, color: t.text2)),
        ]),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(9),
          child: SizedBox(
            height: 10,
            child: known == 0
                ? Container(color: t.fill)
                : Row(children: [
                    Expanded(flex: s.onTime, child: Container(color: t.green)),
                    if (s.late > 0) Expanded(flex: s.late, child: Container(color: t.danger)),
                  ]),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 16, children: [
          KeyDot(t.green, '${nf(s.onTime)} zamanında', line: false),
          KeyDot(t.danger, '${nf(s.late)} geç', line: false),
        ]),
        const SizedBox(height: 14),
        Text('En uzun süredir açık işler', style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
        const SizedBox(height: 4),
        if (r.slowest.isEmpty) Text('Açık görev yok.', style: TextStyle(color: t.text2)),
        for (final k in r.slowest)
          InkWell(
            onTap: () => context.go('/tasks?id=${k.id}'),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(k.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                  Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    if (k.project != null) Chip2(k.project!.name, dot: parseHex(k.project!.color) ?? t.text3),
                    if (k.assignee != null) Text(k.assignee!, style: TextStyle(fontSize: 12, color: t.text2)),
                  ]),
                ])),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('${k.ageDays}g', style: TextStyle(fontWeight: FontWeight.w700, color: k.overdue ? t.danger : t.text)),
                  Text(k.overdue ? 'gecikmiş' : 'açık', style: TextStyle(fontSize: 12, color: k.overdue ? t.danger : t.text2)),
                ]),
              ]),
            ),
          ),
      ]),
    );
  }
}

class ErpTasksCard extends StatelessWidget {
  const ErpTasksCard(this.r, {super.key});
  final TaskReport r;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final items = [
      ('Açık iş emri', nf(r.erp.open)),
      ('Netsis ile otomatik kapanan', nf(r.erp.autoClosed)),
      ('Elle kapatılan', nf(r.erp.manualClosed)),
      ('Ort. kapanma süresi', r.erp.avgLeadDays == null ? '–' : '${nf(r.erp.avgLeadDays!)} gün'),
    ];
    return InsCard(
      title: 'İş emirleri (Netsis)', sub: 'Son ${r.days} günde sipariş ve teklif türü görevler',
      child: Wrap(spacing: 24, runSpacing: 12, children: [
        for (final (k, v) in items)
          SizedBox(
            width: 140,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(k, style: TextStyle(fontSize: 12.5, color: t.text2)),
              Text(v, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: t.text)),
            ]),
          ),
      ]),
    );
  }
}
