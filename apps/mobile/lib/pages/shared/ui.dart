import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import 'format.dart';

/// Web .pchip: proje rengi noktalı küçük hap.
class ProjChip extends StatelessWidget {
  const ProjChip({super.key, required this.name, required this.color});
  final String name, color;
  @override
  Widget build(BuildContext context) {
    final c = hexColor(color);
    return Chip2(name, dot: c, bg: c.withValues(alpha: .16), color: context.tk.text);
  }
}

/// Web .prio
class PrioChip extends StatelessWidget {
  const PrioChip(this.p, {super.key});
  final String p;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final (fg, bg) = switch (p) {
      'urgent' => (t.prioUrgent, t.prioUrgentBg),
      'high' => (t.prioHigh, t.prioHighBg),
      'normal' => (t.prioNormal, t.prioNormalBg),
      _ => (t.text2, t.fill),
    };
    return Container(
      height: 22, padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(7)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (p == 'urgent') Padding(padding: const EdgeInsets.only(right: 4), child: Icon(LucideIcons.flag, size: 12, color: fg)),
        Text(priorityLabel[p] ?? p, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
      ]),
    );
  }
}

/// Web .glass.stat: küçük istatistik kutusu.
class StatTile extends StatelessWidget {
  const StatTile(this.label, this.value, {super.key, this.small, this.alert = false});
  final String label, value;
  final String? small;
  final bool alert;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      radius: 18, padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: t.text2)),
        const SizedBox(height: 4),
        Text.rich(TextSpan(children: [
          TextSpan(text: value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.5, color: alert ? t.danger : t.text)),
          if (small != null) TextSpan(text: ' $small', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: t.text2)),
        ])),
      ]),
    );
  }
}

/// Web .seg: segmentli kontrol.
class Seg<T> extends StatelessWidget {
  const Seg({super.key, required this.value, required this.items, required this.onChanged});
  final T value;
  final List<(T, String, IconData?)> items;
  final ValueChanged<T> onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final it in items)
          GestureDetector(
            onTap: () => onChanged(it.$1),
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(color: it.$1 == value ? t.glassSolid : Colors.transparent, borderRadius: BorderRadius.circular(99)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (it.$3 != null) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(it.$3, size: 16, color: it.$1 == value ? t.text : t.text2)),
                Text(it.$2, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: it.$1 == value ? t.text : t.text2)),
              ]),
            ),
          ),
      ]),
    );
  }
}

/// Web .tk-chip: filtre hapı.
class FilterChip2 extends StatelessWidget {
  const FilterChip2({super.key, required this.label, required this.onTap, this.on = false, this.leading, this.trailing});
  final String label;
  final VoidCallback onTap;
  final bool on;
  final Widget? leading, trailing;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Material(
      color: on ? t.accentSoft : t.fill, shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(), onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (leading != null) Padding(padding: const EdgeInsets.only(right: 7), child: leading),
            Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: on ? t.accentInk : t.text)),
            if (trailing != null) Padding(padding: const EdgeInsets.only(left: 6), child: trailing),
          ]),
        ),
      ),
    );
  }
}

/// Web .dot-ok / focus / warn / off
Color presenceColor(String p) => switch (p) {
      'online' => const Color(0xFF34C759),
      'focus' => const Color(0xFF8B7CF6),
      'meeting' => const Color(0xFFFF9F0A),
      _ => const Color(0xFF8E8E93),
    };

class PresenceDot extends StatelessWidget {
  const PresenceDot(this.p, {super.key});
  final String p;
  @override
  Widget build(BuildContext context) => Container(width: 8, height: 8, decoration: BoxDecoration(color: presenceColor(p), shape: BoxShape.circle));
}

/// Kişi avatarı kısayolu.
Widget personAvatar(UserRef u, {double size = 26}) => Avatar(name: u.fullName, src: u.avatarUrl, size: size);

Widget emptyText(BuildContext c, String s) =>
    Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Text(s, style: TextStyle(color: c.tk.text2, fontSize: 14.5)));

/// Çekmece/sayfa başlığı satırı için bölüm başlığı (web h4).
Widget sectionTitle(BuildContext c, String s, {String? count}) => Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 8),
      child: Row(children: [
        Text(s, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.tk.text)),
        if (count != null) Padding(padding: const EdgeInsets.only(left: 8), child: Text(count, style: TextStyle(fontSize: 13, color: c.tk.text2))),
      ]),
    );

String dueLabel(String? iso) => iso == null || iso.isEmpty ? '' : formatDue(iso);
