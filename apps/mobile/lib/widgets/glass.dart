import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/theme.dart';

/// Pane tarzı cam yüzey (web .glass): bulanık zemin + üst parlama + kenar ışıması.
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.radius = 24, this.padding, this.margin, this.blur = 14, this.onTap, this.solid = false});
  final Widget child;
  final double radius, blur;
  final EdgeInsetsGeometry? padding, margin;
  final VoidCallback? onTap;
  /// Açılır yüzeyler (sayfa, çekmece): okunaklı buzlu zemin.
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final r = BorderRadius.circular(radius);
    final body = Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: r,
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [t.sheen, Colors.transparent], stops: const [0, .34]),
        color: solid ? Color.alphaBlend(t.glassSolid.withValues(alpha: .78), Colors.transparent) : t.glass,
        border: Border.all(color: t.rimLo.withValues(alpha: t.dark ? .35 : .7), width: 1),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: t.dark ? .35 : .1), blurRadius: 28, offset: const Offset(0, 14), spreadRadius: -14)],
      ),
      child: child,
    );
    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: r,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: onTap == null ? body : Material(color: Colors.transparent, child: InkWell(onTap: onTap, child: body)),
        ),
      ),
    );
  }
}

/// Duvar kâğıdı: tüm uygulamanın arkasındaki degrade.
class WallpaperBackdrop extends StatelessWidget {
  const WallpaperBackdrop({super.key, required this.theme, required this.child});
  final ThemeController theme;
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final w = theme.wallpaper;
    return DecoratedBox(decoration: BoxDecoration(gradient: theme.isDark ? w.dark : w.light), child: child);
  }
}

class PageHead extends StatelessWidget {
  const PageHead({super.key, required this.title, this.sub, this.actions = const []});
  final String title;
  final String? sub;
  final List<Widget> actions;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 12, 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: -1, height: 1.05, color: t.text)),
          if (sub != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(sub!, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: t.text2))),
        ])),
        ...actions,
      ]),
    );
  }
}

/// Web .btn / .btn.primary
class PillButton extends StatelessWidget {
  const PillButton({super.key, required this.label, required this.onPressed, this.primary = false, this.icon, this.danger = false, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final bool primary, danger, busy;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final bg = primary ? t.accent : (danger ? t.danger.withValues(alpha: .16) : t.fill);
    final fg = primary ? Colors.white : (danger ? t.danger : t.text);
    return Opacity(
      opacity: onPressed == null || busy ? .55 : 1,
      child: Material(
        color: bg, shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: busy ? null : onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (busy) SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
              else if (icon != null) Icon(icon, size: 18, color: fg),
              if (busy || icon != null) const SizedBox(width: 8),
              Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: fg)),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Web .tag / .prio / .pchip benzeri küçük hap.
class Chip2 extends StatelessWidget {
  const Chip2(this.label, {super.key, this.color, this.bg, this.dot});
  final String label;
  final Color? color, bg, dot;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg ?? t.fill, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (dot != null) Container(width: 8, height: 8, margin: const EdgeInsets.only(right: 6), decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
        Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color ?? t.text2))),
      ]),
    );
  }
}

/// Alttan açılan cam sayfa (web çekmece/modal karşılığı).
Future<T?> showGlassSheet<T>(BuildContext context, {required WidgetBuilder builder, bool full = false}) {
  return showModalBottomSheet<T>(
    context: context, isScrollControlled: true, backgroundColor: Colors.transparent, useSafeArea: true,
    builder: (c) => Padding(
      padding: EdgeInsets.only(top: full ? 0 : 60, bottom: MediaQuery.of(c).viewInsets.bottom),
      child: Glass(radius: 28, solid: true, blur: 30, child: builder(c)),
    ),
  );
}

void showToast(BuildContext c, String msg) => ScaffoldMessenger.of(c)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
