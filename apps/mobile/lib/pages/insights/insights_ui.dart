import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/theme.dart';
import '../../widgets/glass.dart';

final _nf = NumberFormat('#,##0.##', 'tr_TR');
String nf(num n) => _nf.format(n);
String dayLabel(String k, {bool long = false}) {
  final d = DateTime.tryParse(k);
  if (d == null) return k;
  return (long ? DateFormat('d MMMM EEE', 'tr_TR') : DateFormat('d MMM', 'tr_TR')).format(d);
}

num sumOf(Iterable<num> xs) => xs.fold<num>(0, (a, b) => a + b);

double niceMax(double v) {
  if (v <= 4) return 4;
  final step = math.pow(10, (math.log(v) / math.ln10).floor()).toDouble();
  final n = (v / step).ceil();
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
}

int tickEvery(int days) => days <= 7 ? 1 : days <= 30 ? 2 : 7;

/// Web #rrggbb proje rengi; geçersizse null.
Color? parseHex(String? s) {
  if (s == null) return null;
  final h = s.replaceFirst('#', '');
  if (h.length != 6 && h.length != 8) return null;
  final v = int.tryParse(h, radix: 16);
  return v == null ? null : Color(h.length == 6 ? 0xFF000000 | v : v);
}

/// Eğimi korunan (monotone) kübik eğri: veriyi aşmadan yumuşak çizgi (web smoothPath).
Path smoothPath(List<Offset> pts) {
  final p = Path();
  if (pts.isEmpty) return p;
  p.moveTo(pts[0].dx, pts[0].dy);
  if (pts.length < 2) return p;
  final n = pts.length;
  final d = <double>[for (var i = 0; i < n - 1; i++) (pts[i + 1].dy - pts[i].dy) / (pts[i + 1].dx - pts[i].dx)];
  final m = <double>[d[0]];
  for (var i = 1; i < n - 1; i++) { m.add(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); }
  m.add(d[n - 2]);
  for (var i = 0; i < n - 1; i++) {
    if (d[i] == 0) { m[i] = 0; m[i + 1] = 0; continue; }
    final a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { final t = 3 / math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (var i = 0; i < n - 1; i++) {
    final dx = (pts[i + 1].dx - pts[i].dx) / 3;
    p.cubicTo(pts[i].dx + dx, pts[i].dy + m[i] * dx, pts[i + 1].dx - dx, pts[i + 1].dy - m[i + 1] * dx, pts[i + 1].dx, pts[i + 1].dy);
  }
  return p;
}

/// Önceki döneme göre değişim etiketi (web Delta).
class Delta extends StatelessWidget {
  const Delta({super.key, required this.cur, required this.prev, this.unit = '%', this.diff = false, this.lowerIsBetter = false});
  final double? cur, prev;
  final String unit;
  final bool diff, lowerIsBetter;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (cur == null || prev == null) return const SizedBox.shrink();
    double v;
    if (!diff) {
      if (prev == 0) return const SizedBox.shrink();
      v = ((cur! - prev!) / prev! * 100).roundToDouble();
    } else {
      v = (cur! - prev!) * 10;
      v = v.roundToDouble() / 10;
    }
    if (v == 0) return Text('±0$unit', style: TextStyle(fontSize: 12, color: t.text2));
    final good = lowerIsBetter ? v < 0 : v > 0;
    return Text('${v > 0 ? '+' : '−'}${nf(v.abs())}$unit', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: good ? t.up : t.down));
  }
}

/// Web .ins-card
class InsCard extends StatelessWidget {
  const InsCard({super.key, required this.title, required this.sub, required this.child, this.tools});
  final String title, sub;
  final Widget? tools;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      radius: 24, margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text)),
            Text(sub, style: TextStyle(fontSize: 13, color: t.text2)),
          ])),
          ?tools,
        ]),
        const SizedBox(height: 12),
        child,
      ]),
    );
  }
}

class KeyDot extends StatelessWidget {
  const KeyDot(this.color, this.label, {super.key, this.dashed = false, this.line = true});
  final Color color;
  final String label;
  final bool dashed, line;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        line
            ? SizedBox(width: 18, height: 3, child: CustomPaint(painter: _KeyLine(color, dashed)))
            : Container(width: 9, height: 9, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(fontSize: 12.5, color: context.tk.text2)),
      ]);
}

class _KeyLine extends CustomPainter {
  _KeyLine(this.c, this.dashed);
  final Color c;
  final bool dashed;
  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()..color = c..strokeWidth = 2.5..strokeCap = StrokeCap.round;
    if (!dashed) { canvas.drawLine(Offset(0, s.height / 2), Offset(s.width, s.height / 2), p); return; }
    canvas.drawLine(Offset(0, s.height / 2), Offset(6, s.height / 2), p);
    canvas.drawLine(Offset(11, s.height / 2), Offset(s.width, s.height / 2), p);
  }
  @override
  bool shouldRepaint(_KeyLine o) => o.c != c || o.dashed != dashed;
}
