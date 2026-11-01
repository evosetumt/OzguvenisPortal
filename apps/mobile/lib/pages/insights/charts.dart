import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../models/insights.dart';
import 'insights_ui.dart';

TextPainter _tp(String s, Color c, {double size = 11, TextAlign align = TextAlign.left}) =>
    TextPainter(text: TextSpan(text: s, style: TextStyle(fontSize: size, color: c)), textDirection: TextDirection.ltr, textAlign: align)..layout();

/// Günlük tamamlanan: dolgulu yumuşak çizgi + önceki dönem kesik çizgisi (web Throughput SVG).
class ThroughputPainter extends CustomPainter {
  ThroughputPainter({required this.daily, required this.line, required this.prevLine, required this.grid, required this.axis, required this.dot, this.hover});
  final List<DailyPoint> daily;
  final Color line, prevLine, grid, axis, dot;
  final int? hover;
  static const l = 30.0, r = 8.0, tp = 10.0, b = 26.0;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height, n = daily.length;
    if (n == 0) return;
    final mx = niceMax(math.max(1, daily.map((d) => math.max(d.completed, d.prevCompleted)).reduce(math.max)).toDouble());
    double x(int i) => l + (n == 1 ? 0 : i / (n - 1) * (w - l - r));
    double y(num v) => tp + (1 - v / mx) * (h - tp - b);
    final gp = Paint()..color = grid..strokeWidth = 1;
    for (final v in [0.0, mx / 2, mx]) {
      canvas.drawLine(Offset(l, y(v)), Offset(w - r, y(v)), gp);
      final t = _tp(nf(v), axis);
      t.paint(canvas, Offset(l - 8 - t.width, y(v) - t.height / 2));
    }
    final every = tickEvery(n);
    for (var i = 0; i < n; i++) {
      if ((n - 1 - i) % every != 0) continue;
      final t = _tp(dayLabel(daily[i].date), axis);
      final dx = i == 0 ? x(i) : (i == n - 1 ? x(i) - t.width : x(i) - t.width / 2);
      t.paint(canvas, Offset(dx, h - 6 - t.height + 2));
    }
    final cur = [for (var i = 0; i < n; i++) Offset(x(i), y(daily[i].completed))];
    final prev = [for (var i = 0; i < n; i++) Offset(x(i), y(daily[i].prevCompleted))];
    final curPath = smoothPath(cur);
    final fill = Path.from(curPath)..lineTo(x(n - 1), y(0))..lineTo(x(0), y(0))..close();
    canvas.drawPath(fill, Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [line.withValues(alpha: .28), line.withValues(alpha: 0)]).createShader(Rect.fromLTWH(0, tp, w, h - tp - b)));
    // Önceki dönem: kesik çizgi
    final prevPaint = Paint()..color = prevLine..style = PaintingStyle.stroke..strokeWidth = 1.8..strokeCap = StrokeCap.round;
    for (final m in smoothPath(prev).computeMetrics()) {
      for (var s = 0.0; s < m.length; s += 9) { canvas.drawPath(m.extractPath(s, math.min(s + 5, m.length)), prevPaint); }
    }
    canvas.drawPath(curPath, Paint()..color = line..style = PaintingStyle.stroke..strokeWidth = 2.5..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
    if (hover != null && hover! < n) {
      final hx = x(hover!);
      canvas.drawLine(Offset(hx, tp), Offset(hx, h - b), Paint()..color = axis..strokeWidth = 1);
      canvas.drawCircle(Offset(hx, y(daily[hover!].prevCompleted)), 3.5, Paint()..color = prevLine);
      canvas.drawCircle(Offset(hx, y(daily[hover!].completed)), 5, Paint()..color = line);
      canvas.drawCircle(Offset(hx, y(daily[hover!].completed)), 5, Paint()..color = dot..style = PaintingStyle.stroke..strokeWidth = 2);
    }
  }

  /// Dokunulan x konumundan gün indeksi.
  static int indexAt(double dx, double w, int n) =>
      n <= 1 ? 0 : (((dx - l) / math.max(1, w - l - r)) * (n - 1)).round().clamp(0, n - 1);
  static double xOf(int i, double w, int n) => l + (n == 1 ? 0 : i / (n - 1) * (w - l - r));

  @override
  bool shouldRepaint(ThroughputPainter o) => o.daily != daily || o.hover != hover || o.line != line || o.grid != grid;
}

/// Proje dağılımı halka grafiği (web .donut).
class DonutPainter extends CustomPainter {
  DonutPainter({required this.values, required this.colors, required this.track, required this.numColor, required this.labColor, required this.total, this.dim});
  final List<int> values;
  final List<Color> colors;
  final Color track, numColor, labColor;
  final int total;
  final int? dim;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final k = size.width / 160;
    final rad = 62 * k;
    final circ = 2 * math.pi * rad;
    final rect = Rect.fromCircle(center: c, radius: rad);
    final stroke = 18 * k;
    canvas.drawCircle(c, rad, Paint()..color = track..style = PaintingStyle.stroke..strokeWidth = stroke);
    if (total > 0) {
      final gap = (values.length > 1 ? 10 : 0) * k;
      var off = 0.0;
      for (var i = 0; i < values.length; i++) {
        final len = math.max(0.5 * k, values[i] / total * circ - gap);
        final col = dim != null && dim != i ? colors[i].withValues(alpha: .3) : colors[i];
        canvas.drawArc(rect, -math.pi / 2 + off / rad, len / rad, false, Paint()..color = col..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.butt);
        off += values[i] / total * circ;
      }
    }
    final n = _tp(nf(total), numColor, size: 26 * k);
    n.paint(canvas, Offset(c.dx - n.width / 2, c.dy - n.height + 4 * k));
    final lb = _tp('tamamlandı', labColor, size: 11.5 * k);
    lb.paint(canvas, Offset(c.dx - lb.width / 2, c.dy + 6 * k));
  }

  @override
  bool shouldRepaint(DonutPainter o) => o.values != values || o.dim != dim || o.colors != colors;
}

/// Günlük açılan görevler sütun grafiği (web .hb).
class BarsPainter extends CustomPainter {
  BarsPainter({required this.daily, required this.bar, required this.hi, required this.grid, required this.axis, this.hover});
  final List<DailyPoint> daily;
  final Color bar, hi, grid, axis;
  final int? hover;
  static const l = 30.0, b = 22.0, tp = 8.0;

  @override
  void paint(Canvas canvas, Size size) {
    final n = daily.length;
    if (n == 0) return;
    final w = size.width, h = size.height;
    final mx = niceMax(math.max(1, daily.map((d) => d.created).reduce(math.max)).toDouble());
    double y(num v) => tp + (1 - v / mx) * (h - tp - b);
    for (final v in [mx, mx / 2, 0.0]) {
      canvas.drawLine(Offset(l, y(v)), Offset(w, y(v)), Paint()..color = grid..strokeWidth = 1);
      final t = _tp(nf(v), axis);
      t.paint(canvas, Offset(l - 8 - t.width, y(v) - t.height / 2));
    }
    final slot = (w - l) / n, bw = math.max(2.0, slot * .62);
    final every = n <= 7 ? 1 : n <= 30 ? 3 : 10;
    for (var i = 0; i < n; i++) {
      final cx = l + slot * i + slot / 2;
      final top = y(daily[i].created);
      final active = hover == i || (hover == null && i == n - 1);
      canvas.drawRRect(RRect.fromRectAndCorners(Rect.fromLTRB(cx - bw / 2, top, cx + bw / 2, y(0)), topLeft: const Radius.circular(3), topRight: const Radius.circular(3)),
          Paint()..color = active ? hi : bar.withValues(alpha: .55));
      if ((n - 1 - i) % every == 0 || hover == i) {
        final t = _tp(hover == i ? '${daily[i].created}' : dayLabel(daily[i].date), axis);
        t.paint(canvas, Offset((cx - t.width / 2).clamp(l - 10, w - t.width), h - t.height));
      }
    }
  }

  static int indexAt(double dx, double w, int n) => n == 0 ? 0 : (((dx - l) / ((w - l) / n))).floor().clamp(0, n - 1);

  @override
  bool shouldRepaint(BarsPainter o) => o.daily != daily || o.hover != hover || o.bar != bar;
}
