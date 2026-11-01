import 'package:flutter/foundation.dart';
import '../../core/api.dart';
import '../../core/realtime.dart';

/// Web useUnreadMessages: okunmamış mesaj toplamı (menü rozeti); yeni mesaj, okundu ve sohbet
/// olaylarında ve yeniden bağlanınca tazelenir. Kabukta bir kez oluşturulup [start] çağrılır.
class UnreadMessages extends ChangeNotifier {
  UnreadMessages(this.meId);
  final int meId;
  int count = 0;
  bool _started = false, _disposed = false;
  final _subs = <String, void Function(dynamic)>{};

  Future<void> load() async {
    try {
      final r = await Api.i.get('/chat/unread');
      final n = (r['unread'] as num?)?.toInt() ?? 0;
      if (!_disposed && n != count) { count = n; notifyListeners(); }
    } catch (_) {/* geçici hata */}
  }

  void start() {
    if (_started) return;
    _started = true;
    load();
    void on(String ev, void Function(dynamic) fn) { _subs[ev] = fn; Realtime.socket.on(ev, fn); }
    on('message:new', (m) { if (m is Map && m['senderId'] != meId) load(); });
    on('read', (r) { if (r is Map && r['userId'] == meId) load(); });
    on('conversation:updated', (_) => load());
    on('connect', (_) => load());
  }

  @override
  void dispose() {
    _disposed = true;
    _subs.forEach((e, f) => Realtime.socket.off(e, f));
    super.dispose();
  }
}
