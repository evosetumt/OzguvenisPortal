import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/theme.dart';

/// Web Avatar.tsx: fotoğraf ya da baş harfler; presence noktası.
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, this.src, this.size = 36, this.presence});
  final String name;
  final String? src, presence;
  final double size;

  static const _presenceColor = {'online': Color(0xFF34C46B), 'away': Color(0xFFFFB020), 'busy': Color(0xFFFF5A64), 'offline': Color(0xFF8A8A99)};

  String get _initials {
    final p = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (p.isEmpty) return '?';
    return (p.first[0] + (p.length > 1 ? p.last[0] : '')).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final circle = Container(
      width: size, height: size, alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.lerp(t.accent, Colors.white, .3)!, t.accent]),
      ),
      child: src != null && src!.isNotEmpty
          ? ClipOval(child: CachedNetworkImage(imageUrl: Api.i.url(src!), httpHeaders: Api.i.authHeaders, width: size, height: size, fit: BoxFit.cover,
              errorWidget: (_, __, ___) => _text()))
          : _text(),
    );
    if (presence == null) return circle;
    return Stack(clipBehavior: Clip.none, children: [
      circle,
      Positioned(right: -1, bottom: -1, child: Container(
        width: size * .3, height: size * .3,
        decoration: BoxDecoration(color: _presenceColor[presence] ?? _presenceColor['offline'], shape: BoxShape.circle, border: Border.all(color: t.glassSolid, width: 2)),
      )),
    ]);
  }

  Widget _text() => Text(_initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * .36));
}
