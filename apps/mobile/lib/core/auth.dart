import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'realtime.dart';
import 'theme.dart';

/// GET /auth/me yanıtı (web lib/auth.tsx → Me).
class Me {
  final int id;
  final String email, fullName;
  String? avatarUrl, phone, title, presence;
  Map<String, dynamic>? department;
  Map<String, dynamic>? uiPrefs;
  Map<String, String> permissions;
  Me.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        email = j['email'] ?? '',
        fullName = j['fullName'] ?? '',
        avatarUrl = j['avatarUrl'],
        phone = j['phone'],
        title = j['title'],
        presence = j['presence'],
        department = j['department'],
        uiPrefs = j['uiPrefs'],
        permissions = {for (final e in ((j['permissions'] as Map?) ?? {}).entries) e.key as String: '${e.value}'};
}

class AuthController extends ChangeNotifier {
  AuthController(this.theme) {
    theme.onSave = (ui) async {
      if (me != null) { try { await Api.i.patch('/me', {'ui': ui}); } catch (_) {} }
    };
    Api.i.onUnauthorized = logout;
  }
  final ThemeController theme;
  Me? me;
  bool loading = true;
  Timer? _timer;

  /// Jeton bu aralıkla yenilenir: "Beni hatırla" süresi kullanıldıkça baştan başlar, izin değişiklikleri yansır.
  static const _refresh = Duration(hours: 6);

  bool can(String code) => me != null && me!.permissions.containsKey(code);
  bool canAny(List<String> codes) => codes.any(can);

  Future<void> init() async {
    if (Api.i.token != null && Api.i.baseUrl.isNotEmpty) {
      try {
        await _refreshToken();
        await _loadMe();
      } catch (_) {
        await Api.i.setToken(null);
      }
    }
    loading = false;
    notifyListeners();
  }

  Future<void> _refreshToken() async {
    final r = await Api.i.post('/auth/refresh');
    await Api.i.setToken(r['token']);
  }

  Future<void> _loadMe() async {
    me = Me.fromJson(await Api.i.get('/auth/me'));
    theme.applyRemote(me!.uiPrefs);
    Realtime.connect();
    _timer?.cancel();
    _timer = Timer.periodic(_refresh, (_) => _refreshToken().catchError((_) {}));
  }

  Future<void> login(String baseUrl, String email, String password, bool remember) async {
    await Api.i.setBase(baseUrl);
    final r = await Api.i.post('/auth/login', {'email': email, 'password': password, 'remember': remember});
    await Api.i.setToken(r['token']);
    await _loadMe();
    notifyListeners();
  }

  /// Yetkiler değişince (rol düzenlendi) jetonu ve oturumu yeniler; pasifleştirilmişse çıkış yapar.
  Future<void> reloadSession() async {
    try {
      await _refreshToken();
      await _loadMe();
      notifyListeners();
    } catch (_) {
      logout();
    }
  }

  void patchMe({String? avatarUrl, String? phone, String? presence}) {
    if (me == null) return;
    if (avatarUrl != null) me!.avatarUrl = avatarUrl;
    if (phone != null) me!.phone = phone;
    if (presence != null) me!.presence = presence;
    notifyListeners();
  }

  void logout() {
    if (me == null && Api.i.token == null) return;
    _timer?.cancel();
    Api.i.setToken(null);
    Realtime.disconnect();
    me = null;
    notifyListeners();
  }
}
