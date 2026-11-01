import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../../core/realtime.dart';

/// Web lib/rtc.ts: eşler arası (mesh) WebRTC oturumu. Sinyal socket.io 'rtc:signal' ile aynı protokol:
/// emit {callId, to, data:{description:{sdp,type}} | {candidate:{candidate,sdpMid,sdpMLineIndex}|null}},
/// gelen {callId, from, data}. 'call:joined' / 'call:left' / 'call:media' olayları da aynıdır.
/// Çakışmalar "perfect negotiation" ile çözülür (küçük kimlikli taraf kibardır).

class MediaFlags {
  final bool mic, cam, screen;
  const MediaFlags({required this.mic, required this.cam, required this.screen});
}

class PeerView {
  final int userId;
  final MediaStream? stream;
  final MediaFlags media;
  final RTCPeerConnectionState? connection;
  const PeerView(this.userId, this.stream, this.media, this.connection);
}

class _Peer {
  _Peer(this.pc, this.polite);
  final RTCPeerConnection pc;
  final bool polite;
  bool makingOffer = false, ignoreOffer = false;
  RTCRtpTransceiver? audioTx, videoTx;
  MediaStream? stream;
  MediaFlags media = const MediaFlags(mic: true, cam: true, screen: false);
  RTCPeerConnectionState? state;
  final pendingCandidates = <RTCIceCandidate>[];
  bool remoteSet = false;
}

String describeMediaError(Object e) {
  final s = e.toString();
  if (s.contains('NotAllowed') || s.contains('Permission') || s.contains('denied')) return 'Kamera/mikrofon izni verilmedi. Ayarlardan izin verip tekrar deneyin.';
  if (s.contains('NotFound')) return 'Kamera veya mikrofon bulunamadı.';
  if (s.contains('NotReadable')) return 'Kamera/mikrofon başka bir uygulama tarafından kullanılıyor.';
  return s.replaceFirst('Exception: ', '');
}

/// Görüntülüde kamera+mikrofon, olmazsa yalnızca mikrofon, o da olmazsa yalnızca dinleyici.
Future<({MediaStream stream, String warning})> getLocalMedia(bool video) async {
  final audio = {'echoCancellation': true, 'noiseSuppression': true, 'autoGainControl': true};
  Future<MediaStream> get(bool withVideo) => navigator.mediaDevices.getUserMedia({
        'audio': audio,
        'video': withVideo ? {'facingMode': 'user', 'width': {'ideal': 1280}, 'height': {'ideal': 720}} : false,
      });
  try {
    return (stream: await get(video), warning: '');
  } catch (e) {
    if (!video) return (stream: await createLocalMediaStream('local'), warning: describeMediaError(e));
    try {
      return (stream: await get(false), warning: 'Kamera açılamadı, yalnızca sesle katıldınız. ${describeMediaError(e)}');
    } catch (e2) {
      return (stream: await createLocalMediaStream('local'), warning: describeMediaError(e2));
    }
  }
}

class MeshSession extends ChangeNotifier {
  MeshSession(this.callId, this.selfId, this.iceServers, this.local) {
    _cam = local.getVideoTracks().isEmpty ? null : local.getVideoTracks().first;
    final s = Realtime.socket;
    void on(String ev, void Function(Map m) fn) {
      void h(dynamic d) { if (d is Map) fn(d); }
      s.on(ev, h);
      _offs.add(() => s.off(ev, h));
    }
    on('rtc:signal', (m) { if (m['callId'] == callId) _onSignal((m['from'] as num).toInt(), Map<String, dynamic>.from(m['data'] as Map)); });
    on('call:joined', (m) { if (m['callId'] == callId) _sendMedia(); });
    on('call:left', (m) { if (m['callId'] == callId) _dropPeer((m['userId'] as num).toInt()); });
    on('call:media', (m) {
      final p = _peers[(m['userId'] as num?)?.toInt()];
      if (m['callId'] != callId || p == null) return;
      p.media = MediaFlags(mic: m['mic'] == true, cam: m['cam'] == true, screen: m['screen'] == true);
      _notify();
    });
    void onConnect(dynamic _) => _sendMedia();
    s.on('connect', onConnect);
    _offs.add(() => s.off('connect', onConnect));
  }

  final int callId, selfId;
  final List<Map<String, dynamic>> iceServers;
  final MediaStream local;
  final _peers = <int, _Peer>{};
  final _offs = <void Function()>[];
  MediaStreamTrack? _cam;
  bool _closed = false;

  void _notify() { if (!_closed) notifyListeners(); }

  /// İçeride olanlara bağlan (yeni katılan taraf teklif gönderir).
  Future<void> connectTo(List<int> peerIds) async {
    for (final id in peerIds) { await _peer(id, true); }
    _sendMedia();
  }

  MediaStreamTrack? get _mic => local.getAudioTracks().isEmpty ? null : local.getAudioTracks().first;
  MediaFlags get media => MediaFlags(mic: _mic?.enabled ?? false, cam: _cam?.enabled ?? false, screen: false);
  bool get hasMic => _mic != null;
  bool get hasCam => _cam != null;
  MediaStreamTrack? get localVideoTrack => (_cam?.enabled ?? false) ? _cam : null;

  List<PeerView> get peerViews => [for (final e in _peers.entries) PeerView(e.key, e.value.stream, e.value.media, e.value.state)];

  void _send(int to, Map<String, dynamic> data) => Realtime.socket.emit('rtc:signal', {'callId': callId, 'to': to, 'data': data});
  void _sendMedia() {
    if (_closed) return;
    final m = media;
    Realtime.socket.emit('call:media', {'callId': callId, 'mic': m.mic, 'cam': m.cam, 'screen': false});
  }

  Future<_Peer> _peer(int userId, bool initiator) async {
    final existing = _peers[userId];
    if (existing != null) return existing;
    final pc = await createPeerConnection({'iceServers': iceServers, 'sdpSemantics': 'unified-plan'});
    final p = _Peer(pc, selfId < userId);
    _peers[userId] = p;

    pc.onIceCandidate = (c) => _send(userId, {'candidate': c.candidate == null ? null : {'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex}});
    pc.onTrack = (e) {
      p.stream = e.streams.isNotEmpty ? e.streams.first : p.stream;
      e.track.onUnMute = _notify;
      e.track.onMute = _notify;
      _notify();
    };
    pc.onConnectionState = (s) {
      p.state = s;
      if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed) pc.restartIce();
      _notify();
    };
    pc.onRenegotiationNeeded = () => _negotiate(userId, p);

    if (initiator) {
      // Teklif eden taraf ses ve görüntü kanallarını her zaman açar; sonradan kamera açmak yeni bağlantı gerektirmesin.
      final mic = _mic, vid = localVideoTrack;
      RTCRtpTransceiverInit init(MediaStreamTrack? tr) =>
          RTCRtpTransceiverInit(direction: tr != null ? TransceiverDirection.SendRecv : TransceiverDirection.RecvOnly, streams: [local]);
      p.audioTx = mic != null
          ? await pc.addTransceiver(track: mic, init: init(mic))
          : await pc.addTransceiver(kind: RTCRtpMediaType.RTCRtpMediaTypeAudio, init: init(null));
      p.videoTx = vid != null
          ? await pc.addTransceiver(track: vid, init: init(vid))
          : await pc.addTransceiver(kind: RTCRtpMediaType.RTCRtpMediaTypeVideo, init: init(null));
      await _negotiate(userId, p);
    }
    _notify();
    return p;
  }

  Future<void> _negotiate(int userId, _Peer p) async {
    if (_closed || p.makingOffer) return;
    if (p.pc.signalingState != null && p.pc.signalingState != RTCSignalingState.RTCSignalingStateStable) return;
    try {
      p.makingOffer = true;
      final offer = await p.pc.createOffer();
      if (p.pc.signalingState != RTCSignalingState.RTCSignalingStateStable) return;
      await p.pc.setLocalDescription(offer);
      _send(userId, {'description': {'sdp': offer.sdp, 'type': offer.type}});
    } catch (e) {
      debugPrint('WebRTC teklif hatası: $e');
    } finally {
      p.makingOffer = false;
    }
  }

  Future<void> _flushCandidates(_Peer p) async {
    p.remoteSet = true;
    for (final c in p.pendingCandidates) { try { await p.pc.addCandidate(c); } catch (_) {} }
    p.pendingCandidates.clear();
  }

  Future<void> _onSignal(int from, Map<String, dynamic> data) async {
    if (_closed) return;
    final p = await _peer(from, false);
    final pc = p.pc;
    try {
      if (data['description'] is Map) {
        final d = Map<String, dynamic>.from(data['description'] as Map);
        final type = d['type'] as String?;
        final collision = type == 'offer' && (p.makingOffer || pc.signalingState != RTCSignalingState.RTCSignalingStateStable);
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        if (collision) {
          // Kibar taraf: kendi teklifini geri alıp karşı teklifi kabul eder.
          try { await pc.setLocalDescription(RTCSessionDescription('', 'rollback')); } catch (_) {}
        }
        await pc.setRemoteDescription(RTCSessionDescription(d['sdp'] as String?, type));
        await _flushCandidates(p);
        if (type == 'offer') {
          if (p.audioTx == null || p.videoTx == null) await _attachToOffered(p);
          final answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          _send(from, {'description': {'sdp': answer.sdp, 'type': answer.type}});
        }
      } else if (data.containsKey('candidate')) {
        final c = data['candidate'];
        if (c is! Map) return; // null: aday sonu işareti
        final cand = RTCIceCandidate(c['candidate'] as String?, c['sdpMid'] as String?, (c['sdpMLineIndex'] as num?)?.toInt());
        if (!p.remoteSet) { p.pendingCandidates.add(cand); return; }
        try { await pc.addCandidate(cand); } catch (e) { if (!p.ignoreOffer) debugPrint('ICE hatası: $e'); }
      }
    } catch (e) {
      debugPrint('WebRTC sinyal hatası: $e');
    }
  }

  /// Yanıtlayan taraf: teklifteki ses/görüntü kanallarına kendi akışını bağlar.
  Future<void> _attachToOffered(_Peer p) async {
    for (final t in await p.pc.getTransceivers()) {
      final kind = t.receiver.track?.kind;
      final track = kind == 'audio' ? _mic : localVideoTrack;
      if (kind == 'audio' && p.audioTx == null) {
        p.audioTx = t;
      } else if (kind == 'video' && p.videoTx == null) {
        p.videoTx = t;
      } else {
        continue;
      }
      if (track != null) await t.sender.replaceTrack(track);
      await t.setDirection(track != null ? TransceiverDirection.SendRecv : TransceiverDirection.RecvOnly);
    }
  }

  Future<void> _setOutgoingVideo(MediaStreamTrack? track) async {
    for (final p in _peers.values) {
      final tx = p.videoTx;
      if (tx == null) continue;
      await tx.sender.replaceTrack(track);
      if (track != null) await tx.setDirection(TransceiverDirection.SendRecv);
    }
  }

  void toggleMic() {
    final t = _mic;
    if (t == null) return;
    t.enabled = !t.enabled;
    _sendMedia();
    _notify();
  }

  Future<void> toggleCam() async {
    final c = _cam;
    if (c != null) {
      c.enabled = !c.enabled;
      await _setOutgoingVideo(c.enabled ? c : null);
    } else {
      final s = await navigator.mediaDevices.getUserMedia({'video': {'facingMode': 'user', 'width': {'ideal': 1280}, 'height': {'ideal': 720}}});
      _cam = s.getVideoTracks().first;
      await local.addTrack(_cam!);
      await _setOutgoingVideo(_cam);
    }
    _sendMedia();
    _notify();
  }

  Future<void> switchCamera() async {
    final c = _cam;
    if (c != null) await Helper.switchCamera(c);
  }

  void _dropPeer(int userId) {
    final p = _peers.remove(userId);
    if (p == null) return;
    p.pc.close();
    _notify();
  }

  void close() {
    if (_closed) return;
    _closed = true;
    for (final off in _offs) { off(); }
    for (final p in _peers.values) { p.pc.close(); }
    _peers.clear();
    for (final t in local.getTracks()) { t.stop(); }
    local.dispose();
    super.dispose();
  }
}
