import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import '../shared/format.dart';
import '../shared/ui.dart';
import 'home_models.dart';

/// Web .hm-card: başlıklı cam kart (isteğe bağlı sağ bağlantı).
class HmCard extends StatelessWidget {
  const HmCard({super.key, required this.title, this.sub, this.link, this.linkTo, this.trailing, required this.child});
  final String title;
  final String? sub, link, linkTo;
  final Widget? trailing;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      child: Glass(
        radius: 24, padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -.2, color: t.text)),
              if (sub != null) Text(sub!, style: TextStyle(fontSize: 13.5, color: t.text2)),
            ])),
            if (link != null) GestureDetector(onTap: () => context.go(linkTo!), child: Text(link!, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.accentInk))),
            ?trailing,
          ]),
          const SizedBox(height: 12),
          child,
        ]),
      ),
    );
  }
}

/// Halka renkleri (home.css → --ring-tasks / --ring-focus / --ring-meet).
List<Color> ringColors(bool dark) => dark
    ? const [Color(0xFFFF2D6F), Color(0xFF4ADE6B), Color(0xFF22C3F0)]
    : const [Color(0xFFF0145A), Color(0xFF2FBF4F), Color(0xFF0AA6D8)];

class RingSpec {
  final double value, max;
  final Color color;
  const RingSpec(this.value, this.max, this.color);
}

/// İç içe ilerleme halkaları (dıştan içe).
class Rings extends StatelessWidget {
  const Rings({super.key, required this.rings, this.size = 150});
  final List<RingSpec> rings;
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: CustomPaint(painter: _RingsPainter(rings)));
}

class _RingsPainter extends CustomPainter {
  _RingsPainter(this.rings);
  final List<RingSpec> rings;
  @override
  void paint(Canvas canvas, Size s) {
    const stroke = 15.0, gap = 4.0;
    final scale = s.width / 150;
    final c = Offset(s.width / 2, s.height / 2);
    for (var i = 0; i < rings.length; i++) {
      final r = (75 - stroke / 2 - i * (stroke + gap)) * scale;
      final paint = Paint()..style = PaintingStyle.stroke..strokeWidth = stroke * scale..strokeCap = StrokeCap.round;
      canvas.drawCircle(c, r, paint..color = rings[i].color.withValues(alpha: .2));
      final pct = rings[i].max > 0 ? math.min(1.0, rings[i].value / rings[i].max) : 0.0;
      if (pct > 0) canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, 2 * math.pi * pct, false, paint..color = rings[i].color);
    }
  }

  @override
  bool shouldRepaint(_RingsPainter o) => true;
}

/// Web Attn: "Dikkat" satırı.
class AttnRow extends StatelessWidget {
  const AttnRow({super.key, required this.to, required this.icon, required this.hue, required this.label, required this.value, required this.empty});
  final String to, label, empty;
  final IconData icon;
  final Color hue;
  final int value;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return InkWell(
      borderRadius: BorderRadius.circular(14), onTap: () => context.go(to),
      child: Opacity(
        opacity: value > 0 ? 1 : .6,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
          child: Row(children: [
            Container(width: 34, height: 34, decoration: BoxDecoration(color: hue.withValues(alpha: .16), borderRadius: BorderRadius.circular(11)), child: Icon(icon, size: 18, color: hue)),
            const SizedBox(width: 12),
            Expanded(child: Text(value > 0 ? label : empty, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: t.text))),
            if (value > 0) Text('$value', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: hue)),
          ]),
        ),
      ),
    );
  }
}

class WeekDelta extends StatelessWidget {
  const WeekDelta({super.key, required this.cur, required this.prev});
  final int cur, prev;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (prev == 0) return Text('geçen hafta $prev', style: TextStyle(fontSize: 13.5, color: t.text2));
    final v = ((cur - prev) / prev * 100).round();
    return Text('${v >= 0 ? '+' : '−'}%${v.abs()} geçen haftaya göre', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: v >= 0 ? t.up : t.down));
  }
}

class WeekBars extends StatelessWidget {
  const WeekBars({super.key, required this.week});
  final List<WeekDay> week;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final mx = math.max(1, week.fold<int>(0, (m, d) => math.max(m, d.completed)));
    final today = todayKey();
    return SizedBox(
      height: 130,
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final d in week)
          Expanded(
            child: Opacity(
              opacity: d.date.compareTo(today) > 0 ? .5 : 1,
              child: Column(children: [
                Expanded(child: Align(alignment: Alignment.bottomCenter, child: FractionallySizedBox(
                  heightFactor: math.max(.06, d.completed / mx), widthFactor: .55,
                  child: Container(
                    alignment: Alignment.topCenter, padding: const EdgeInsets.only(top: 3),
                    decoration: BoxDecoration(color: d.date == today ? t.accent : t.accent.withValues(alpha: .45), borderRadius: BorderRadius.circular(8)),
                    child: Text(d.completed > 0 ? '${d.completed}' : '', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ))),
                const SizedBox(height: 6),
                Text(DateFormat2.wk(d.date), style: TextStyle(fontSize: 12, fontWeight: d.date == today ? FontWeight.w700 : FontWeight.w500, color: d.date == today ? t.text : t.text2)),
              ]),
            ),
          ),
      ]),
    );
  }
}

class DateFormat2 {
  static String wk(String date) {
    final d = DateTime.tryParse('${date}T00:00:00');
    return d == null ? '' : _short[d.weekday - 1];
  }

  static const _short = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
}

/// Web RightNow: "Şu an" (Ekip / Hareketler).
class RightNow extends StatefulWidget {
  const RightNow({super.key, required this.home});
  final HomeData home;
  @override
  State<RightNow> createState() => _RightNowState();
}

class _RightNowState extends State<RightNow> {
  late String tab = widget.home.scope == 'own' ? 'activity' : 'team';
  static const _icon = {'completed': LucideIcons.circleCheck, 'commented': LucideIcons.messageSquare, 'created': LucideIcons.calendarDays};
  static const _verb = {'completed': 'tamamladı', 'commented': 'yorum yaptı', 'created': 'oluşturdu'};

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final home = widget.home;
    final showTeam = home.scope != 'own';
    Color kindColor(String k) => switch (k) { 'completed' => t.green, 'commented' => t.blue, _ => t.purple };
    return HmCard(
      title: 'Şu an',
      trailing: showTeam ? Seg<String>(value: tab, onChanged: (v) => setState(() => tab = v), items: const [('team', 'Ekip', null), ('activity', 'Hareketler', null)]) : null,
      child: tab == 'team' && showTeam
          ? Column(children: [
              if (home.team.isEmpty) emptyText(context, 'Atanmış açık iş yok.'),
              for (final m in home.team)
                InkWell(
                  borderRadius: BorderRadius.circular(14), onTap: () => context.go('/tasks?assignee=${m.id}'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                    child: Row(children: [
                      Stack(clipBehavior: Clip.none, children: [
                        Avatar(name: m.fullName, size: 38),
                        Positioned(right: -1, bottom: -1, child: Container(width: 11, height: 11, decoration: BoxDecoration(
                          color: m.overdue > 0 ? t.danger : (m.dueToday > 0 ? t.orange : t.green), shape: BoxShape.circle, border: Border.all(color: t.glassSolid, width: 2)))),
                      ]),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(m.fullName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
                        Text('${m.open} açık iş${m.dueToday > 0 ? ' · ${m.dueToday} bugün' : ''}${m.overdue > 0 ? ' · ${m.overdue} geciken' : ''}${m.department != null ? ' · ${m.department}' : ''}',
                            style: TextStyle(fontSize: 13, color: t.text2)),
                      ])),
                    ]),
                  ),
                ),
            ])
          : Column(children: [
              if (home.activity.isEmpty) emptyText(context, 'Henüz hareket yok.'),
              for (final a in home.activity)
                InkWell(
                  borderRadius: BorderRadius.circular(14), onTap: () => context.go('/tasks?id=${a.taskId}'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                    child: Row(children: [
                      Container(width: 34, height: 34, decoration: BoxDecoration(color: kindColor(a.kind).withValues(alpha: .16), shape: BoxShape.circle), child: Icon(_icon[a.kind] ?? LucideIcons.calendarDays, size: 16, color: kindColor(a.kind))),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text.rich(TextSpan(children: [
                          TextSpan(text: '${a.who ?? 'Biri'} ', style: TextStyle(fontWeight: FontWeight.w600, color: t.text)),
                          TextSpan(text: _verb[a.kind] ?? '', style: TextStyle(fontWeight: FontWeight.w400, color: t.text2)),
                        ]), style: const TextStyle(fontSize: 15)),
                        Text('${a.title}${a.text != null ? ' — ${a.text}' : ''}', maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: t.text2)),
                      ])),
                      const SizedBox(width: 8),
                      Text(timeAgo(a.at), style: TextStyle(fontSize: 12.5, color: t.text3)),
                    ]),
                  ),
                ),
            ]),
    );
  }
}
