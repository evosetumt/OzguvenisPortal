import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../models/insights.dart';
import 'charts.dart';
import 'insights_ui.dart';

/// Tamamlanan iş: çizgi grafik + tablo görünümü.
class ThroughputCard extends StatefulWidget {
  const ThroughputCard(this.r, {super.key});
  final TaskReport r;
  @override
  State<ThroughputCard> createState() => _ThroughputCardState();
}

class _ThroughputCardState extends State<ThroughputCard> {
  bool table = false;
  int? hover;

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final r = widget.r;
    final n = r.daily.length;
    final prevTotal = r.previous.completed;
    return InsCard(
      title: 'Tamamlanan iş', sub: 'Her gün bitirilen görevler',
      tools: TextButton.icon(
        onPressed: () => setState(() => table = !table),
        icon: Icon(table ? Icons.show_chart : Icons.table_chart_outlined, size: 16),
        label: Text(table ? 'Grafik' : 'Tablo'),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text(nf(r.current.completed), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
          Text('tamamlandı', style: TextStyle(color: t.text2)),
          Delta(cur: r.current.completed.toDouble(), prev: prevTotal.toDouble()),
          if (prevTotal > 0) Text('önceki ${r.days} güne göre', style: TextStyle(fontSize: 12.5, color: t.text2)),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 16, children: [
          KeyDot(t.accentInk, 'Son ${r.days} gün'),
          KeyDot(t.text3, 'Önceki ${r.days} gün', dashed: true),
        ]),
        const SizedBox(height: 10),
        if (!table)
          LayoutBuilder(builder: (c, box) {
            final w = box.maxWidth;
            void touch(Offset p) => setState(() => hover = ThroughputPainter.indexAt(p.dx, w, n));
            return Column(children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (d) => touch(d.localPosition),
                onHorizontalDragUpdate: (d) => touch(d.localPosition),
                child: Semantics(
                  label: 'Günlük tamamlanan görevler, toplam ${r.current.completed}',
                  child: CustomPaint(
                    size: Size(w, 240),
                    painter: ThroughputPainter(daily: r.daily, line: t.accentInk, prevLine: t.text3, grid: t.sep, axis: t.text3, dot: t.glassSolid, hover: hover),
                  ),
                ),
              ),
              if (hover != null && hover! < n)
                Container(
                  alignment: Alignment.centerLeft, padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(12)),
                  width: double.infinity,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(dayLabel(r.daily[hover!].date, long: true), style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                    KeyDot(t.accentInk, '${r.daily[hover!].completed} tamamlandı'),
                    KeyDot(t.text3, '${r.daily[hover!].prevCompleted} önceki dönem', dashed: true),
                  ]),
                ),
            ]);
          })
        else
          _Table(r),
      ]),
    );
  }
}

class _Table extends StatelessWidget {
  const _Table(this.r);
  final TaskReport r;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    TableRow row(List<String> c, {bool head = false, bool foot = false}) => TableRow(children: [
          for (var i = 0; i < c.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(c[i], textAlign: i == 0 ? TextAlign.left : TextAlign.right,
                  style: TextStyle(fontSize: 13, fontWeight: head || foot ? FontWeight.w700 : FontWeight.w400, color: i == 3 && !head && !foot ? t.text3 : (head ? t.text2 : t.text))),
            ),
        ]);
    return SizedBox(
      height: 320,
      child: Column(children: [
        Table(columnWidths: const {0: FlexColumnWidth(2.2)}, children: [row(['Gün', 'Tamamlanan', 'Açılan', 'Önceki dönem'], head: true)]),
        Expanded(
          child: SingleChildScrollView(
            child: Table(columnWidths: const {0: FlexColumnWidth(2.2)}, children: [
              for (final d in r.daily.reversed) row([dayLabel(d.date, long: true), '${d.completed}', '${d.created}', '${d.prevCompleted}']),
            ]),
          ),
        ),
        Table(columnWidths: const {0: FlexColumnWidth(2.2)}, children: [
          row(['Toplam', '${r.current.completed}', '${sumOf(r.daily.map((d) => d.created))}', '${r.previous.completed}'], foot: true),
        ]),
      ]),
    );
  }
}

/// Proje bazında halka grafik + gösterge.
class ByProjectCard extends StatefulWidget {
  const ByProjectCard(this.r, {super.key});
  final TaskReport r;
  @override
  State<ByProjectCard> createState() => _ByProjectCardState();
}

class _ByProjectCardState extends State<ByProjectCard> {
  int? dim;

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final r = widget.r;
    final fallback = [t.purple, t.blue, t.pink, t.green, t.teal, t.orange];
    final items = <({String name, int completed, double? share, Color color})>[
      for (var i = 0; i < r.byProject.length && i < 6; i++)
        (
          name: r.byProject[i].project?.name ?? 'Projesiz',
          completed: r.byProject[i].completed,
          share: r.byProject[i].share,
          color: parseHex(r.byProject[i].project?.color) ?? fallback[i % fallback.length],
        ),
    ];
    final rest = r.byProject.skip(6).fold<int>(0, (n, p) => n + p.completed);
    final total = r.current.completed;
    if (rest > 0) items.add((name: 'Diğer', completed: rest, share: total == 0 ? 0 : (rest / total * 100).roundToDouble(), color: t.text3));
    return InsCard(
      title: 'Proje bazında', sub: 'Biten işin nereye gittiği',
      child: items.isEmpty
          ? Text('Bu dönemde tamamlanan görev yok.', style: TextStyle(color: t.text2))
          : Column(children: [
              Semantics(
                label: '$total tamamlanan görevin projelere dağılımı',
                child: CustomPaint(
                  size: const Size(170, 170),
                  painter: DonutPainter(values: [for (final p in items) p.completed], colors: [for (final p in items) p.color], track: t.fill, numColor: t.text, labColor: t.text2, total: total, dim: dim),
                ),
              ),
              const SizedBox(height: 10),
              for (var i = 0; i < items.length; i++)
                InkWell(
                  onTap: () => setState(() => dim = dim == i ? null : i),
                  child: Opacity(
                    opacity: dim != null && dim != i ? .4 : 1,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(children: [
                        Container(width: 10, height: 10, decoration: BoxDecoration(color: items[i].color, borderRadius: BorderRadius.circular(3))),
                        const SizedBox(width: 10),
                        Expanded(child: Text(items[i].name, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.text))),
                        Text(nf(items[i].completed), style: TextStyle(fontWeight: FontWeight.w600, color: t.text)),
                        SizedBox(width: 48, child: Text('%${(items[i].share ?? 0).round()}', textAlign: TextAlign.right, style: TextStyle(color: t.text2))),
                      ]),
                    ),
                  ),
                ),
            ]),
    );
  }
}

/// Yeni iş: günlük açılan görevler sütunları.
class NewWorkCard extends StatefulWidget {
  const NewWorkCard(this.r, {super.key});
  final TaskReport r;
  @override
  State<NewWorkCard> createState() => _NewWorkCardState();
}

class _NewWorkCardState extends State<NewWorkCard> {
  int? hover;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final r = widget.r;
    final n = r.daily.length;
    final total = sumOf(r.daily.map((d) => d.created));
    return InsCard(
      title: 'Yeni iş', sub: 'Her gün açılan görevler',
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text(nf(total), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
          Text('görev açıldı', style: TextStyle(color: t.text2)),
          Text('günde ortalama ${nf(n == 0 ? 0 : (total / n * 10).round() / 10)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
        ]),
        const SizedBox(height: 10),
        LayoutBuilder(builder: (c, box) {
          final w = box.maxWidth;
          void touch(Offset p) => setState(() => hover = BarsPainter.indexAt(p.dx, w, n));
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (d) => touch(d.localPosition),
            onHorizontalDragUpdate: (d) => touch(d.localPosition),
            child: Semantics(
              label: 'Günlük açılan görevler, toplam $total',
              child: CustomPaint(size: Size(w, 180), painter: BarsPainter(daily: r.daily, bar: t.accentInk, hi: t.accentInk, grid: t.sep, axis: t.text3, hover: hover)),
            ),
          );
        }),
      ]),
    );
  }
}
