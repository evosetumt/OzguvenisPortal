import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/theme.dart';
import 'common.dart';

const _themes = [
  ('light', 'Açık', LucideIcons.sun),
  ('dark', 'Koyu', LucideIcons.moon),
  ('auto', 'Otomatik', LucideIcons.monitor),
];

/// Ayarlar → Görünüm: tema, duvar kâğıdı, vurgu rengi. Seçim anında uygulanır ve hesaba kaydedilir (ThemeController.set).
class AppearanceSettings extends StatelessWidget {
  const AppearanceSettings({super.key});
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final ctl = context.watch<ThemeController>();
    return Panel(title: 'Görünüm', children: [
      Text('Tercihleriniz hesabınızda saklanır; hangi cihazdan girerseniz girin aynı görünür.', style: TextStyle(fontSize: 13, color: t.text3)),
      const SizedBox(height: 14),
      Text('Tema', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
      Text(ctl.themePref == 'auto' ? 'Otomatik: cihazın açık/koyu ayarını izler' : ctl.themePref == 'light' ? 'Açık' : 'Koyu', style: TextStyle(fontSize: 13, color: t.text3)),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(99)),
        child: Row(children: [
          for (final (id, label, icon) in _themes)
            Expanded(
              child: GestureDetector(
                onTap: () => ctl.set(theme: id),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(color: ctl.themePref == id ? t.glassSolid : Colors.transparent, borderRadius: BorderRadius.circular(99)),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(icon, size: 15, color: ctl.themePref == id ? t.text : t.text2),
                    const SizedBox(width: 6),
                    Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: ctl.themePref == id ? t.text : t.text2)),
                  ]),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 18),
      Text('Duvar kâğıdı', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
      Text(ctl.wallpaper.label, style: TextStyle(fontSize: 13, color: t.text3)),
      const SizedBox(height: 10),
      Wrap(spacing: 12, runSpacing: 12, children: [
        for (final w in wallpapers)
          GestureDetector(
            onTap: () => ctl.set(wallpaper: w.id),
            child: SizedBox(
              width: 84,
              child: Column(children: [
                Container(
                  height: 56, alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: ctl.isDark ? w.dark : w.light,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: ctl.wallpaperId == w.id ? t.accent : t.sep, width: ctl.wallpaperId == w.id ? 2.5 : 1),
                  ),
                  child: ctl.wallpaperId == w.id
                      ? Container(width: 22, height: 22, decoration: BoxDecoration(color: t.accent, shape: BoxShape.circle), child: const Icon(LucideIcons.check, size: 12, color: Colors.white))
                      : null,
                ),
                const SizedBox(height: 4),
                Text(w.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: t.text2)),
              ]),
            ),
          ),
      ]),
      const SizedBox(height: 18),
      Text('Vurgu rengi', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
      Text(ctl.accent.label, style: TextStyle(fontSize: 13, color: t.text3)),
      const SizedBox(height: 10),
      Wrap(spacing: 12, runSpacing: 12, children: [
        for (final a in accents)
          Semantics(
            label: a.label, button: true, selected: ctl.accentId == a.id,
            child: GestureDetector(
              onTap: () => ctl.set(accent: a.id),
              child: Container(
                width: 40, height: 40, decoration: BoxDecoration(color: a.color, shape: BoxShape.circle,
                    border: ctl.accentId == a.id ? Border.all(color: t.text, width: 2) : null),
                child: ctl.accentId == a.id ? const Icon(LucideIcons.check, size: 16, color: Colors.white) : null,
              ),
            ),
          ),
      ]),
    ]);
  }
}
