import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Web'deki styles/theme.css ve appearance.css belirteçlerinin birebir karşılığı.
/// Koyu tema varsayılan; "auto" sistemi izler. Tercih hesapta (PATCH /me {ui}) ve cihazda saklanır.
class Tokens {
  final Brightness brightness;
  final Color wbg1, wbg2, text, text2, text3, glass, glassSolid, glassThick, fill, fill2, fillHover, sep, well;
  final Color accent, accentInk, accentSoft, blue, purple, pink, orange, green, teal, danger, up, down;
  final Color prioUrgent, prioUrgentBg, prioHigh, prioHighBg, prioNormal, prioNormalBg;
  final Color rimHi, rimLo, sheen, wallTint;
  const Tokens({
    required this.brightness, required this.wbg1, required this.wbg2, required this.text, required this.text2,
    required this.text3, required this.glass, required this.glassSolid, required this.glassThick, required this.fill,
    required this.fill2, required this.fillHover, required this.sep, required this.well, required this.accent,
    required this.accentInk, required this.accentSoft, required this.blue, required this.purple, required this.pink,
    required this.orange, required this.green, required this.teal, required this.danger, required this.up,
    required this.down, required this.prioUrgent, required this.prioUrgentBg, required this.prioHigh,
    required this.prioHighBg, required this.prioNormal, required this.prioNormalBg, required this.rimHi,
    required this.rimLo, required this.sheen, required this.wallTint,
  });

  bool get dark => brightness == Brightness.dark;
  Color get warn => orange;
  Color get ok => green;
  Color get muted => text2;

  static Tokens of(BuildContext c) => Theme.of(c).extension<TokensExt>()!.t;

  static Tokens build(bool dark, Color accent, Color accentInk, [Color? wallTint]) {
    Color w(double o) => Colors.white.withValues(alpha: o);
    if (dark) {
      return Tokens(
        brightness: Brightness.dark, wbg1: const Color(0xFF232428), wbg2: const Color(0xFF232428),
        text: const Color(0xFFF5F5F7), text2: const Color(0xFFEBEBF5).withValues(alpha: .7),
        text3: const Color(0xFFEBEBF5).withValues(alpha: .55), glass: const Color(0xFF1A1A24).withValues(alpha: .42),
        glassSolid: const Color(0xFF1C1C20), glassThick: const Color(0xFF1A1A1E).withValues(alpha: .86),
        fill: const Color(0xFF9696AF).withValues(alpha: .16), fill2: const Color(0xFF9696AF).withValues(alpha: .26),
        fillHover: const Color(0xFF9696AF).withValues(alpha: .12), sep: w(.1), well: const Color(0xFF9696AF).withValues(alpha: .16),
        accent: accent, accentInk: accentInk, accentSoft: accent.withValues(alpha: .16),
        blue: const Color(0xFF4B8EFF), purple: const Color(0xFFA07CFF), pink: const Color(0xFFF2649F),
        orange: const Color(0xFFFF8A3D), green: const Color(0xFF34C46B), teal: const Color(0xFF22C3C0),
        danger: const Color(0xFFFF5A64), up: const Color(0xFF5FD88A), down: const Color(0xFFFF8189),
        prioUrgent: const Color(0xFFFF8B92), prioUrgentBg: const Color(0xFFD92D3A).withValues(alpha: .2),
        prioHigh: const Color(0xFFFFB27A), prioHighBg: const Color(0xFFF2711C).withValues(alpha: .2),
        prioNormal: const Color(0xFF8FB8FF), prioNormalBg: const Color(0xFF2F7CF6).withValues(alpha: .18),
        rimHi: w(.85), rimLo: w(.12), sheen: w(.1), wallTint: wallTint ?? const Color(0xFF1C1C20),
      );
    }
    return Tokens(
      brightness: Brightness.light, wbg1: const Color(0xFFECECF0), wbg2: const Color(0xFFE4E4E7),
      text: const Color(0xFF0F1017), text2: const Color(0xFF161826).withValues(alpha: .7),
      text3: const Color(0xFF161826).withValues(alpha: .56), glass: w(.42), glassSolid: const Color(0xFFF3F5FA),
      glassThick: const Color(0xFFFAFCFF).withValues(alpha: .86), fill: const Color(0xFF76768C).withValues(alpha: .13),
      fill2: const Color(0xFF76768C).withValues(alpha: .22), fillHover: const Color(0xFF76768C).withValues(alpha: .1),
      sep: const Color(0xFF282846).withValues(alpha: .12), well: const Color(0xFF76768C).withValues(alpha: .14),
      accent: accent, accentInk: accentInk, accentSoft: accent.withValues(alpha: .13),
      blue: const Color(0xFF2F7CF6), purple: const Color(0xFF8B5CF6), pink: const Color(0xFFE9468F),
      orange: const Color(0xFFF2711C), green: const Color(0xFF22A559), teal: const Color(0xFF0EA5A4),
      danger: const Color(0xFFD92D3A), up: const Color(0xFF13803A), down: const Color(0xFFC02631),
      prioUrgent: const Color(0xFFB0202C), prioUrgentBg: const Color(0xFFD92D3A).withValues(alpha: .14),
      prioHigh: const Color(0xFF9A4208), prioHighBg: const Color(0xFFF2711C).withValues(alpha: .16),
      prioNormal: const Color(0xFF1D55B8), prioNormalBg: const Color(0xFF2F7CF6).withValues(alpha: .14),
      rimHi: Colors.white, rimLo: w(.24), sheen: w(.34), wallTint: wallTint ?? const Color(0xFFF3F5FA),
    );
  }
}

class TokensExt extends ThemeExtension<TokensExt> {
  final Tokens t;
  const TokensExt(this.t);
  @override
  TokensExt copyWith({Tokens? t}) => TokensExt(t ?? this.t);
  @override
  TokensExt lerp(ThemeExtension<TokensExt>? other, double x) => x < .5 ? this : (other as TokensExt);
}

extension TokensCtx on BuildContext {
  Tokens get tk => Tokens.of(this);
}

class AccentOption {
  final String id, label;
  final Color color, ink;
  const AccentOption(this.id, this.label, this.color, this.ink);
}

/// Vurgu renkleri (lib/theme.ts → ACCENTS). ink: koyu temada okunur ton.
const accents = [
  AccentOption('mavi', 'Mavi', Color(0xFF2F7CF6), Color(0xFF7DB4FF)),
  AccentOption('mor', 'Mor', Color(0xFF8B5CF6), Color(0xFFB79CFF)),
  AccentOption('pembe', 'Pembe', Color(0xFFE8457C), Color(0xFFFF8DB3)),
  AccentOption('turuncu', 'Turuncu', Color(0xFFF2731C), Color(0xFFFFB27A)),
  AccentOption('yesil', 'Yeşil', Color(0xFF22A55A), Color(0xFF6FE0A0)),
  AccentOption('grafit', 'Grafit', Color(0xFF6B7280), Color(0xFFB4BAC6)),
  AccentOption('altin', 'Özgüveniş altını', Color(0xFFB08D48), Color(0xFFE0C284)),
];

class Wallpaper {
  final String id, label;
  final Gradient dark, light;
  final Color tint;
  const Wallpaper(this.id, this.label, this.dark, this.light, this.tint);
}

LinearGradient _lin(Color a, Color b) => LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [a, b]);

List<Wallpaper> wallpapers = [
  Wallpaper('duz', 'Varsayılan', _lin(const Color(0xFF232428), const Color(0xFF232428)), _lin(const Color(0xFFECECF0), const Color(0xFFE4E4E7)), const Color(0xFF1C1C20)),
  Wallpaper('kul', 'Kül', _lin(const Color(0xFF2C2D33), const Color(0xFF1B1C20)), _lin(const Color(0xFFECECF0), const Color(0xFFDCDCE2)), const Color(0xFF2C2D33)),
  Wallpaper('kum', 'Kum', _lin(const Color(0xFF3B3026), const Color(0xFF1F1914)), _lin(const Color(0xFFF3EBDF), const Color(0xFFE4D5BF)), const Color(0xFF3B3026)),
  Wallpaper('adacayi', 'Adaçayı', _lin(const Color(0xFF27322B), const Color(0xFF161C18)), _lin(const Color(0xFFE6EFE7), const Color(0xFFD0DFD3)), const Color(0xFF27322B)),
  Wallpaper('kutup', 'Kutup ışığı', _lin(const Color(0xFF0D1424), const Color(0xFF0A0F1C)), _lin(const Color(0xFFF1F5FC), const Color(0xFFE6ECF7)), const Color(0xFF2D3F7A)),
  Wallpaper('duman', 'Duman', _lin(const Color(0xFF1D1E22), const Color(0xFF121315)), _lin(const Color(0xFFF4F4F6), const Color(0xFFE7E7EB)), const Color(0xFF2A2B30)),
  Wallpaper('gelgit', 'Gelgit', _lin(const Color(0xFF0F1A4A), const Color(0xFF1B0F45)), _lin(const Color(0xFF3A5FD0), const Color(0xFF5B3AC4)), const Color(0xFF2B3FA0)),
  Wallpaper('cicek', 'Çiçek', _lin(const Color(0xFF3B0A35), const Color(0xFF4A1022)), _lin(const Color(0xFFD94A98), const Color(0xFFE8803A)), const Color(0xFFA0206F)),
  Wallpaper('kor', 'Kor', _lin(const Color(0xFF3A0D07), const Color(0xFF2A0F05)), _lin(const Color(0xFFE5622A), const Color(0xFFE5A02A)), const Color(0xFFB04A1A)),
  Wallpaper('koru', 'Koru', _lin(const Color(0xFF06291B), const Color(0xFF0B2A26)), _lin(const Color(0xFF2FAE6A), const Color(0xFF2FB5A5)), const Color(0xFF138A55)),
  Wallpaper('alacakaranlik', 'Alacakaranlık', _lin(const Color(0xFF1A1033), const Color(0xFF3A1230)), _lin(const Color(0xFF7A5AD0), const Color(0xFFE0688A)), const Color(0xFF5A2A8A)),
];

class ThemeController extends ChangeNotifier {
  static const _key = 'ozg-ui';
  String themePref = 'auto'; // dark | light | auto
  String wallpaperId = 'duz';
  String accentId = 'mavi';
  Brightness _system = WidgetsBinding.instance.platformDispatcher.platformBrightness;
  /// Hesaba yazma (PATCH /me {ui}); AuthController bağlar.
  Future<void> Function(Map<String, String> ui)? onSave;

  Future<void> load() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_key);
      if (raw != null) _apply(Map<String, dynamic>.from(jsonDecode(raw)));
    } catch (_) {}
    notifyListeners();
  }

  void _apply(Map<String, dynamic> m) {
    themePref = (m['theme'] as String?) ?? themePref;
    wallpaperId = (m['wallpaper'] as String?) ?? wallpaperId;
    accentId = (m['accent'] as String?) ?? accentId;
  }

  /// Sunucudaki tercihi kaydetmeden uygular (giriş sonrası).
  void applyRemote(Map<String, dynamic>? m) {
    if (m == null) return;
    _apply(m);
    _cache();
    notifyListeners();
  }

  void setSystem(Brightness b) { _system = b; if (themePref == 'auto') notifyListeners(); }
  bool get isDark => themePref == 'auto' ? _system == Brightness.dark : themePref == 'dark';
  Wallpaper get wallpaper => wallpapers.firstWhere((w) => w.id == wallpaperId, orElse: () => wallpapers.first);
  AccentOption get accent => accents.firstWhere((a) => a.id == accentId, orElse: () => accents.first);

  void set({String? theme, String? wallpaper, String? accent}) {
    themePref = theme ?? themePref;
    wallpaperId = wallpaper ?? wallpaperId;
    accentId = accent ?? accentId;
    _cache();
    notifyListeners();
    onSave?.call({'theme': themePref, 'wallpaper': wallpaperId, 'accent': accentId});
  }

  void toggle() => set(theme: isDark ? 'light' : 'dark');

  void _cache() async {
    try {
      (await SharedPreferences.getInstance()).setString(_key, jsonEncode({'theme': themePref, 'wallpaper': wallpaperId, 'accent': accentId}));
    } catch (_) {}
  }

  Tokens get tokens => Tokens.build(isDark, accent.color, isDark ? accent.ink : accent.color, wallpaper.tint);

  ThemeData get themeData {
    final t = tokens;
    final base = ThemeData(brightness: t.brightness, useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: Colors.transparent,
      colorScheme: ColorScheme.fromSeed(seedColor: t.accent, brightness: t.brightness).copyWith(primary: t.accent, surface: t.glassSolid, error: t.danger),
      textTheme: base.textTheme.apply(bodyColor: t.text, displayColor: t.text),
      dividerColor: t.sep,
      splashFactory: InkRipple.splashFactory,
      inputDecorationTheme: InputDecorationTheme(
        filled: true, fillColor: t.fill,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: t.accent, width: 1.5)),
        hintStyle: TextStyle(color: t.text3),
      ),
      extensions: [TokensExt(t)],
    );
  }
}
