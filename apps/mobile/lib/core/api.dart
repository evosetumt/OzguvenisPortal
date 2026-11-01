import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiError implements Exception {
  final int status;
  final String message;
  ApiError(this.status, this.message);
  @override
  String toString() => message;
}

/// Web'deki lib/api.ts karşılığı. Sunucu adresi ilk girişte sorulur (örn. https://portal.sirketadi.com.tr);
/// jeton güvenli depoda tutulur. Tüm istekler `<adres>/api/...` altına gider.
class Api {
  static final Api i = Api._();
  Api._();

  static const _tokenKey = 'ozg-token';
  static const _baseKey = 'ozg-base-url';
  static const _secure = FlutterSecureStorage();

  String baseUrl = '';
  String? token;
  /// 401 gelince (jeton süresi doldu / kullanıcı pasifleşti) oturumu kapatır.
  void Function()? onUnauthorized;

  Future<void> load() async {
    baseUrl = (await SharedPreferences.getInstance()).getString(_baseKey) ?? '';
    try { token = await _secure.read(key: _tokenKey); } catch (_) {}
  }

  Future<void> setBase(String url) async {
    var u = url.trim();
    while (u.endsWith('/')) { u = u.substring(0, u.length - 1); }
    // Uygulama /api'yi kendisi ekler; adresin sonuna yazılmışsa kırp.
    if (u.toLowerCase().endsWith('/api')) { u = u.substring(0, u.length - 4); }
    while (u.endsWith('/')) { u = u.substring(0, u.length - 1); }
    if (u.isNotEmpty && !u.startsWith('http')) u = 'https://$u';
    baseUrl = u;
    (await SharedPreferences.getInstance()).setString(_baseKey, u);
  }

  Future<void> setToken(String? t) async {
    token = t;
    try {
      if (t == null) { await _secure.delete(key: _tokenKey); } else { await _secure.write(key: _tokenKey, value: t); }
    } catch (_) {}
  }

  /// API'nin verdiği /api/... yollarını (dosya, avatar) tam adrese çevirir.
  String url(String path) => path.startsWith('/api/') ? baseUrl + path : path;
  Map<String, String> get authHeaders => token == null ? {} : {'Authorization': 'Bearer $token'};

  Future<dynamic> request(String method, String path, {Object? body, Map<String, String>? headers}) async {
    final uri = Uri.parse('$baseUrl/api$path');
    final h = {'Content-Type': 'application/json', ...authHeaders, ...?headers};
    final enc = body == null ? null : jsonEncode(body);
    http.Response res;
    try {
      res = await switch (method) {
        'GET' => http.get(uri, headers: h),
        'POST' => http.post(uri, headers: h, body: enc),
        'PATCH' => http.patch(uri, headers: h, body: enc),
        'PUT' => http.put(uri, headers: h, body: enc),
        'DELETE' => http.delete(uri, headers: h, body: enc),
        _ => throw ArgumentError(method),
      }.timeout(const Duration(seconds: 30));
    } on HandshakeException {
      throw ApiError(0, 'Sunucunun güvenlik sertifikası güvenilir değil. Şirket kök sertifikasını cihaza yükleyip güvenin.');
    } on TlsException {
      throw ApiError(0, 'Güvenli bağlantı kurulamadı (sertifika hatası).');
    } on TimeoutException {
      throw ApiError(0, 'Sunucu yanıt vermedi (zaman aşımı). Adresi ve ağ bağlantısını kontrol edin.');
    } on SocketException {
      throw ApiError(0, 'Sunucuya ulaşılamadı. Adresi ve ağ bağlantısını kontrol edin.');
    } on http.ClientException catch (e) {
      throw ApiError(0, 'Sunucuya bağlanılamadı: ${e.message}');
    } on FormatException {
      throw ApiError(0, 'Sunucu adresi geçersiz.');
    }
    if (res.statusCode == 401 && token != null && !path.startsWith('/auth/login')) onUnauthorized?.call();
    if (res.statusCode >= 400) {
      var msg = 'İstek başarısız';
      try {
        final m = jsonDecode(utf8.decode(res.bodyBytes))['message'];
        msg = m is List ? m.join(', ') : (m as String? ?? msg);
      } catch (_) {}
      throw ApiError(res.statusCode, msg);
    }
    if (res.statusCode == 204 || res.bodyBytes.isEmpty) return null;
    return jsonDecode(utf8.decode(res.bodyBytes));
  }

  Future<dynamic> get(String path) => request('GET', path);
  Future<dynamic> post(String path, [Object? body]) => request('POST', path, body: body);
  Future<dynamic> patch(String path, [Object? body]) => request('PATCH', path, body: body);
  Future<dynamic> put(String path, [Object? body]) => request('PUT', path, body: body);
  Future<dynamic> delete(String path) => request('DELETE', path);

  /// multipart dosya yükleme (ek, avatar, masraf fişi).
  Future<dynamic> upload(String path, String field, String filePath, {Map<String, String>? fields}) async {
    final req = http.MultipartRequest('POST', Uri.parse('$baseUrl/api$path'))
      ..headers.addAll(authHeaders)
      ..fields.addAll(fields ?? {})
      ..files.add(await http.MultipartFile.fromPath(field, filePath));
    final res = await http.Response.fromStream(await req.send());
    if (res.statusCode >= 400) {
      var msg = 'Yükleme başarısız';
      try { msg = jsonDecode(res.body)['message']?.toString() ?? msg; } catch (_) {}
      throw ApiError(res.statusCode, msg);
    }
    return res.body.isEmpty ? null : jsonDecode(res.body);
  }
}
