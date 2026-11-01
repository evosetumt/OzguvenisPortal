import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/call.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import 'call_controller.dart';
import 'call_room.dart';

/// Web CallLayer + CallProvider: kabuğun gövdesini sarar. CallController'ı sağlar, gelen arama kartını,
/// aktif arama odasını ve kısa bilgi mesajını çocuğun üstüne çizer.
///   `CallLayer(child: shellGövdesi)`
/// Giriş yapmış kullanıcı (AuthController.me) gerektirir.
class CallLayer extends StatefulWidget {
  const CallLayer({super.key, required this.child});
  final Widget child;
  @override
  State<CallLayer> createState() => _CallLayerState();
}

class _CallLayerState extends State<CallLayer> {
  CallController? ctl;

  @override
  void initState() {
    super.initState();
    final me = context.read<AuthController>().me;
    if (me != null) ctl = CallController(me.id);
  }

  @override
  void dispose() { ctl?.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final c = ctl;
    if (c == null) return widget.child;
    return ChangeNotifierProvider<CallController>.value(
      value: c,
      child: Stack(children: [
        Positioned.fill(child: widget.child),
        Positioned.fill(child: Consumer<CallController>(builder: (ctx, calls, _) => Material(
          type: MaterialType.transparency,
          child: Stack(children: [
            if (calls.active != null) Positioned.fill(child: CallRoom(key: ValueKey(calls.active!.call.id), calls: calls)),
            if (calls.incoming != null) Positioned(left: 14, right: 14, top: MediaQuery.of(ctx).padding.top + 10, child: _IncomingCall(call: calls.incoming!, calls: calls)),
            if (calls.notice.isNotEmpty) Positioned(left: 0, right: 0, bottom: MediaQuery.of(ctx).padding.bottom + 90, child: Center(child: _Notice(calls.notice))),
          ]),
        ))),
      ]),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: .8), borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      );
}

class _IncomingCall extends StatefulWidget {
  const _IncomingCall({required this.call, required this.calls});
  final CallView call;
  final CallController calls;
  @override
  State<_IncomingCall> createState() => _IncomingCallState();
}

class _IncomingCallState extends State<_IncomingCall> {
  String error = '';
  Future<void> run(Future<void> Function() fn) => fn().catchError((e) { if (mounted) setState(() => error = '$e'.replaceFirst('Exception: ', '')); });

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final call = widget.call;
    final meId = context.read<AuthController>().me!.id;
    final video = call.video;
    Widget round(Color bg, IconData icon, String tip, VoidCallback tap) => Tooltip(message: tip, child: Material(
          color: bg, shape: const CircleBorder(),
          child: InkWell(customBorder: const CircleBorder(), onTap: tap, child: SizedBox(width: 48, height: 48, child: Icon(icon, color: Colors.white, size: 22))),
        ));
    return Glass(
      radius: 24, solid: true, blur: 30, padding: const EdgeInsets.all(14),
      child: Row(children: [
        Avatar(name: call.startedBy.fullName, src: call.startedBy.avatarUrl, size: 48),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(call.startedBy.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: t.text)),
          Text('${video ? 'Görüntülü' : 'Sesli'} arama${call.conversationType == 'group' ? ' · ${callTitle(call, meId)}' : ''}', style: TextStyle(fontSize: 13, color: t.text2)),
          if (error.isNotEmpty) Text(error, style: TextStyle(fontSize: 12, color: t.danger)),
        ])),
        round(t.danger, Icons.call_end, 'Reddet', () => widget.calls.decline()),
        if (video) ...[const SizedBox(width: 8), round(t.green, Icons.call, 'Sesli cevapla', () => run(() => widget.calls.accept('audio')))],
        const SizedBox(width: 8),
        round(t.green, video ? Icons.videocam : Icons.call, video ? 'Görüntülü cevapla' : 'Cevapla', () => run(() => widget.calls.accept())),
      ]),
    );
  }
}
