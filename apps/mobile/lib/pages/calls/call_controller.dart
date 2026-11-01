import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../core/api.dart';
import '../../core/realtime.dart';
import '../../models/call.dart';
import 'rtc.dart';

class ActiveCall {
  ActiveCall(this.call, this.session, this.warning);
  CallView call;
  final MeshSession session;
  String warning;
}

const _endText = {
  'declined': 'Arama reddedildi',
  'missed': 'Cevap verilmedi',
  'cancelled': 'Arama iptal edildi',
  'ended': 'Arama sona erdi',
};

/// Web lib/calls.tsx → CallProvider: gelen arama zili, aktif arama (tek seferde bir), sohbetten arama
/// başlatma ve toplantıya katılma. Ekranları [CallLayer] çizer; sayfalar `context.read<CallController>()` ile erişir.
class CallController extends ChangeNotifier {
  CallController(this.meId) {
    _hook();
    _restore();
  }
  final int meId;
  CallView? incoming;
  ActiveCall? active;
  /// Arama bitince kısa süre gösterilen bilgi ("Arama reddedildi" vb.).
  String notice = '';
  bool _disposed = false;
  Timer? _noticeTimer, _ringTimer;
  final _subs = <String, void Function(dynamic)>{};

  void _notify() { if (!_disposed) notifyListeners(); }

  void _flash(String text) {
    notice = text;
    _notify();
    _noticeTimer?.cancel();
    _noticeTimer = Timer(const Duration(seconds: 4), () { notice = ''; _notify(); });
  }

  void _end([String? text]) {
    active?.session.close();
    active = null;
    _updateTone();
    if (text != null) { _flash(text); } else { _notify(); }
  }

  Future<void> _begin(JoinResult r, MediaStream stream, String warning) async {
    final session = MeshSession(r.call.id, meId, r.iceServers, stream);
    active = ActiveCall(r.call, session, warning);
    _updateTone();
    _notify();
    if (r.call.video) { try { await Helper.setSpeakerphoneOn(true); } catch (_) {} }
    await session.connectTo(r.peers);
  }

  /// Medyayı önce al, sonra katıl: içeridekilere giden teklif ses/görüntüyü baştan içersin.
  Future<void> _withMedia(bool video, Future<dynamic> Function() join) async {
    if (active != null) throw Exception('Zaten bir aramadasınız');
    final m = await getLocalMedia(video);
    try {
      await _begin(JoinResult.fromJson(await join() as Map<String, dynamic>), m.stream, m.warning);
    } catch (e) {
      for (final t in m.stream.getTracks()) { t.stop(); }
      rethrow;
    }
  }

  Future<void> startCall(int conversationId, String kind) =>
      _withMedia(kind == 'video', () => Api.i.post('/calls', {'conversationId': conversationId, 'kind': kind}));

  Future<void> joinMeeting(int meetingId) => _withMedia(true, () => Api.i.post('/meetings/$meetingId/join'));

  Future<void> accept([String? kind]) async {
    final c = incoming;
    if (c == null) return;
    incoming = null;
    _updateTone();
    _notify();
    if (active != null) await hangup();
    await _withMedia((kind ?? c.kind) == 'video', () => Api.i.post('/calls/${c.id}/join'));
  }

  Future<void> decline() async {
    final c = incoming;
    incoming = null;
    _updateTone();
    _notify();
    if (c != null) { try { await Api.i.post('/calls/${c.id}/decline'); } catch (_) {} }
  }

  Future<void> hangup() async {
    final a = active;
    if (a == null) return;
    _end();
    try { await Api.i.post('/calls/${a.call.id}/leave'); } catch (_) {}
  }

  /// Açılışta: çalmakta olan arama varsa zil ekranı geri gelsin; yenilemeden önce bağlı kalınan arama kapatılır.
  Future<void> _restore() async {
    try {
      final rows = await Api.i.get('/calls/mine') as List;
      for (final r in rows) {
        final c = CallView.fromJson(r as Map<String, dynamic>);
        final mine = c.participants.where((p) => p.id == meId).firstOrNull;
        if (mine?.state == 'ringing') {
          incoming = c;
        } else if (mine?.state == 'joined' && active == null) {
          try { await Api.i.post('/calls/${c.id}/leave'); } catch (_) {}
        }
      }
      _updateTone();
      _notify();
    } catch (_) {}
  }

  void _hook() {
    void on(String ev, void Function(dynamic) fn) { _subs[ev] = fn; Realtime.socket.on(ev, fn); }
    on('call:incoming', (d) {
      if (d is! Map<String, dynamic>) return;
      incoming = CallView.fromJson(d);
      _updateTone();
      _notify();
    });
    on('call:updated', (d) {
      if (d is! Map<String, dynamic>) return;
      final c = CallView.fromJson(d);
      // Başka cihazdan cevaplandı/reddedildi: bu cihazda zil susar.
      if (incoming?.id == c.id && c.participants.where((p) => p.id == meId).firstOrNull?.state != 'ringing') incoming = null;
      if (active?.call.id == c.id) active!.call = c;
      _updateTone();
      _notify();
    });
    on('call:ended', (d) {
      if (d is! Map) return;
      final id = (d['callId'] as num?)?.toInt();
      if (incoming?.id == id) incoming = null;
      if (active?.call.id == id) { _end(_endText[d['status']] ?? _endText['ended']); } else { _updateTone(); _notify(); }
    });
  }

  /// Zil sesi: dosya gerektirmez, sistem uyarı sesi (gelen aramada 2 sn, giden aramada 3 sn aralıkla).
  void _updateTone() {
    final out = active != null && active!.call.status == 'ringing' && active!.call.startedById == meId;
    final kind = incoming != null ? 2 : (out ? 3 : 0);
    _ringTimer?.cancel();
    _ringTimer = null;
    if (kind == 0) return;
    void ring() => SystemSound.play(SystemSoundType.alert);
    ring();
    _ringTimer = Timer.periodic(Duration(seconds: kind), (_) => ring());
  }

  @override
  void dispose() {
    _disposed = true;
    _noticeTimer?.cancel();
    _ringTimer?.cancel();
    _subs.forEach((e, f) => Realtime.socket.off(e, f));
    final a = active;
    if (a != null) {
      a.session.close();
      Api.i.post('/calls/${a.call.id}/leave').catchError((_) {});
    }
    super.dispose();
  }
}

/// Kabukta CallLayer yoksa null döner (arama düğmeleri gizlenir).
CallController? callsOf(BuildContext context, {bool listen = true}) {
  try {
    return Provider.of<CallController>(context, listen: listen);
  } catch (_) {
    return null;
  }
}
