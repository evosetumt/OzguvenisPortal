import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/call.dart';
import '../../widgets/avatar.dart';
import 'call_controller.dart';
import 'meeting_side_panel.dart';
import 'rtc.dart';

String _elapsed(String? from, DateTime now) {
  if (from == null) return '';
  final s = now.difference(DateTime.parse(from)).inSeconds.clamp(0, 1 << 30);
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Web CallRoom: katılımcı kareleri, mikrofon/kamera/kamera çevir/notlar/bitir düğmeleri.
class CallRoom extends StatefulWidget {
  const CallRoom({super.key, required this.calls});
  final CallController calls;
  @override
  State<CallRoom> createState() => _CallRoomState();
}

class _CallRoomState extends State<CallRoom> {
  late Timer tick;
  DateTime now = DateTime.now();
  bool side = false;
  String? warn;

  @override
  void initState() {
    super.initState();
    tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => now = DateTime.now()));
  }

  @override
  void dispose() { tick.cancel(); super.dispose(); }

  Future<void> toggle(Future<void> Function() fn) async {
    try { await fn(); if (mounted) setState(() => warn = ''); } catch (e) { if (mounted) setState(() => warn = describeMediaError(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.calls.active;
    if (a == null) return const SizedBox.shrink();
    final me = context.read<AuthController>().me!;
    final session = a.session;
    final call = a.call;
    return ListenableBuilder(listenable: session, builder: (c, _) {
      final media = session.media;
      final peers = session.peerViews;
      final people = {for (final p in call.participants) p.id: p};
      final ringing = call.participants.where((p) => p.state == 'ringing' && p.id != me.id).toList();
      final canAssign = const ['all', 'department'].contains(me.permissions['task.write']);
      final status = call.status == 'ringing'
          ? (call.startedById == me.id ? 'Çalıyor…' : 'Bağlanıyor…')
          : '${peers.length + 1} katılımcı · ${_elapsed(call.answeredAt ?? call.createdAt, now)}';
      final w = warn ?? a.warning;
      final tiles = <Widget>[
        _Tile(name: '${me.fullName} (siz)', media: media, avatar: me.avatarUrl, track: session.localVideoTrack, local: session, mirror: true),
        for (final p in peers) _Tile(
          key: ValueKey(p.userId), name: people[p.userId]?.fullName ?? '#${p.userId}', media: p.media, avatar: people[p.userId]?.avatarUrl,
          stream: p.stream, connecting: p.connection != RTCPeerConnectionState.RTCPeerConnectionStateConnected,
        ),
      ];
      final cols = tiles.length <= 1 ? 1 : (tiles.length <= 4 ? 2 : 3);
      return ColoredBox(
        color: const Color(0xFF0E0E12),
        child: SafeArea(child: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 6), child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(callTitle(call, me.id), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 17)),
              Text('$status${ringing.isNotEmpty && call.status != 'ringing' ? ' · Çalıyor: ${ringing.map((p) => p.fullName.split(' ').first).join(', ')}' : ''}',
                  style: const TextStyle(color: Colors.white70, fontSize: 13)),
            ])),
          ])),
          if (w.isNotEmpty) Container(
            width: double.infinity, margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: .2), borderRadius: BorderRadius.circular(12)),
            child: Text(w, style: const TextStyle(color: Colors.white, fontSize: 13)),
          ),
          Expanded(child: side && call.meetingId != null
              ? Container(
                  margin: const EdgeInsets.symmetric(horizontal: 12), padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(20)),
                  child: SingleChildScrollView(child: MeetingSidePanel(meetingId: call.meetingId!, canAssignTasks: canAssign, dark: true)),
                )
              : Padding(padding: const EdgeInsets.all(8), child: LayoutBuilder(builder: (c, box) {
                  final rows = (tiles.length / cols).ceil();
                  final h = (box.maxHeight / rows) - 8;
                  return GridView.count(
                    crossAxisCount: cols, mainAxisSpacing: 8, crossAxisSpacing: 8, physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: (box.maxWidth / cols - 8) / h.clamp(80, 2000), children: tiles);
                }))),
          Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 14), child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _Round(media.mic ? LucideIcons.mic : LucideIcons.micOff, off: !media.mic, tip: media.mic ? 'Mikrofonu kapat' : 'Mikrofonu aç', onTap: session.hasMic ? session.toggleMic : null),
            _Round(media.cam ? LucideIcons.video : LucideIcons.videoOff, off: !media.cam, tip: media.cam ? 'Kamerayı kapat' : 'Kamerayı aç', onTap: () => toggle(session.toggleCam)),
            if (session.hasCam && media.cam) _Round(LucideIcons.switchCamera, tip: 'Kamerayı çevir', onTap: () => toggle(session.switchCamera)),
            if (call.meetingId != null) _Round(LucideIcons.notebookPen, on: side, tip: canAssign ? 'Notlarım ve görevler' : 'Notlarım', onTap: () => setState(() => side = !side)),
            _Round(LucideIcons.phoneOff, leave: true, tip: 'Aramayı bitir', onTap: () => widget.calls.hangup()),
          ])),
        ])),
      );
    });
  }
}

class _Round extends StatelessWidget {
  const _Round(this.icon, {required this.tip, required this.onTap, this.off = false, this.on = false, this.leave = false});
  final IconData icon;
  final String tip;
  final VoidCallback? onTap;
  final bool off, on, leave;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final bg = leave ? t.danger : on ? t.accent : off ? Colors.white : Colors.white24;
    final fg = off && !leave && !on ? Colors.black87 : Colors.white;
    return Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Tooltip(message: tip, child: Opacity(opacity: onTap == null ? .4 : 1, child: Material(
      color: bg, shape: const CircleBorder(),
      child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: 52, height: 52, child: Icon(icon, size: 22, color: fg))),
    ))));
  }
}

/// Yerel kare ([track]) ya da uzak kare ([stream]). Ses ayrı çalınır: görüntü kapalıyken de duyulsun
/// (uzak ses akışı yerel olarak otomatik oynar, renderer yalnızca görüntü içindir).
class _Tile extends StatefulWidget {
  const _Tile({super.key, required this.name, required this.media, this.avatar, this.stream, this.track, this.local, this.connecting = false, this.mirror = false});
  final String name;
  final MediaFlags media;
  final String? avatar;
  final MediaStream? stream;
  final MediaStreamTrack? track;
  final MeshSession? local;
  final bool connecting, mirror;
  @override
  State<_Tile> createState() => _TileState();
}

class _TileState extends State<_Tile> {
  final r = RTCVideoRenderer();
  bool ready = false;

  @override
  void initState() {
    super.initState();
    r.initialize().then((_) { if (mounted) { ready = true; _bind(); setState(() {}); } });
  }

  void _bind() {
    if (!ready) return;
    if (widget.local != null) {
      final tr = widget.track;
      if (tr == null) { r.srcObject = null; return; }
      // Yerel görüntü için tek izli yeni akış (ses çalınmasın).
      createLocalMediaStream('preview').then((s) async { await s.addTrack(tr); if (mounted) setState(() => r.srcObject = s); });
    } else {
      r.srcObject = widget.stream;
    }
  }

  @override
  void didUpdateWidget(_Tile old) {
    super.didUpdateWidget(old);
    if (old.stream != widget.stream || old.track != widget.track) _bind();
  }

  @override
  void dispose() { r.srcObject = null; r.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final vt = widget.stream?.getVideoTracks().firstOrNull;
    final showVideo = widget.local != null ? widget.track != null : (vt != null && vt.muted != true && (widget.media.cam || widget.media.screen));
    return ClipRRect(borderRadius: BorderRadius.circular(18), child: Stack(fit: StackFit.expand, children: [
      Container(color: Colors.white10),
      if (showVideo && ready) RTCVideoView(r, mirror: widget.mirror, objectFit: widget.media.screen ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
      else Center(child: Avatar(name: widget.name, src: widget.avatar, size: 72)),
      Positioned(left: 8, bottom: 8, right: 8, child: Row(children: [
        Flexible(child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(99)),
          child: Text('${widget.name}${widget.media.screen ? ' · ekran' : ''}${widget.connecting ? ' · bağlanıyor…' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 12.5)),
        )),
        if (!widget.media.mic) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(LucideIcons.micOff, size: 14, color: Colors.white)),
      ])),
    ]));
  }
}
