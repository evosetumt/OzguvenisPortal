import 'package:flutter/widgets.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api.dart';

/// Web'deki lib/realtime.ts: tek socket.io bağlantısı (yol /api/socket.io), JWT el sıkışmada gönderilir.
class Realtime {
  static io.Socket? _s;
  static io.Socket get socket => _s ?? connect();

  static io.Socket connect() {
    if (_s != null) return _s!;
    final s = io.io(
      Api.i.baseUrl,
      io.OptionBuilder()
          .setPath('/api/socket.io')
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': Api.i.token})
          .enableReconnection()
          .setReconnectionDelayMax(10000)
          .disableAutoConnect()
          .build(),
    );
    s.onReconnectAttempt((_) => s.auth = {'token': Api.i.token});
    s.on('auth_error', (_) => s.disconnect());
    // Uygulama ön planda mı? Sunucu mesaj bildirimini yalnız hiçbir cihaz ön planda değilse push olarak yollar.
    void report() => s.emit('presence:visible', {'visible': WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused});
    s.onConnect((_) => report());
    s.connect();
    _s = s;
    return s;
  }

  static void setVisible(bool v) => _s?.emit('presence:visible', {'visible': v});

  static void disconnect() {
    _s?.dispose();
    _s = null;
  }

  static void typing(int conversationId) => _s?.emit('typing', {'conversationId': conversationId});
}

/// Sunucu olayına abone olan widget durumu karışımı (useSocketEvent karşılığı).
mixin SocketEvents<T extends StatefulWidget> on State<T> {
  final _subs = <String, void Function(dynamic)>{};
  void onSocket(String event, void Function(dynamic data) handler) {
    void fn(dynamic d) { if (mounted) handler(d); }
    _subs[event] = fn;
    Realtime.socket.on(event, fn);
  }

  @override
  void dispose() {
    _subs.forEach((e, f) => _s?.off(e, f));
    super.dispose();
  }

  io.Socket? get _s => Realtime.socket;
}
