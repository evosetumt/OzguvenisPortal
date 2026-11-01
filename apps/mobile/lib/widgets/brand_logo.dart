import 'package:flutter/material.dart';
import '../core/theme.dart';

class _Part { final String file, tone; final double x, y, w, h; const _Part(this.file, this.tone, this.x, this.y, this.w, this.h); }

/// assets/brand/pieces.ts ile aynı katmanlar. Koyu temada gri parçalar açılır (web brand.css).
const _emblem = [
  _Part('ringGrey-grey', 'grey', 32, 37, 169, 225), _Part('ringGold-gold', 'gold', 105, 22, 168, 224),
  _Part('hook-grey', 'grey', 104, 155, 97, 74), _Part('bar1-gold', 'gold', 104, 75, 97, 27), _Part('bar2-gold', 'gold', 104, 115, 97, 27),
];
const _letters = [
  _Part('l0-gold', 'gold', 293, 92, 93, 93), _Part('l0-grey', 'grey', 323, 117, 30, 28), _Part('l1-gold', 'gold', 386, 94, 71, 89),
  _Part('l2-gold', 'gold', 458, 92, 84, 93), _Part('l3-gold', 'gold', 553, 93, 66, 92), _Part('l3-grey', 'grey', 575, 93, 22, 28),
  _Part('l4-gold', 'gold', 620, 92, 82, 93), _Part('l5-gold', 'gold', 703, 94, 55, 89), _Part('l6-gold', 'gold', 764, 92, 71, 93),
  _Part('l7-gold', 'gold', 848, 116, 18, 68), _Part('l7-grey', 'grey', 848, 92, 18, 12), _Part('l8-gold', 'gold', 874, 92, 59, 112),
  _Part('line-grey', 'grey', 305, 194, 578, 10),
];

class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.emblem = false, this.width = 52});
  final bool emblem;
  final double width;
  @override
  Widget build(BuildContext context) {
    final dark = context.tk.dark;
    final bx = emblem ? 22.0 : 0.0, by = emblem ? 12.0 : 0.0;
    final bw = emblem ? 260.0 : 945.0, bh = emblem ? 260.0 : 283.0;
    final parts = [..._emblem, if (!emblem) ..._letters];
    final k = width / bw;
    return SizedBox(
      width: width, height: bh * k,
      child: Stack(children: [
        for (final p in parts)
          Positioned(
            left: (p.x - bx) * k, top: (p.y - by) * k, width: p.w * k, height: p.h * k,
            child: ColorFiltered(
              // koyu temada gri parçalar açılır
              colorFilter: p.tone == 'grey' && dark ? const ColorFilter.matrix([-1, 0, 0, 0, 255, 0, -1, 0, 0, 255, 0, 0, -1, 0, 255, 0, 0, 0, 1, 0]) : const ColorFilter.mode(Colors.transparent, BlendMode.dst),
              child: Image.asset('assets/brand/${p.file}.webp', fit: BoxFit.fill),
            ),
          ),
      ]),
    );
  }
}
