import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/chat.dart';
import '../../widgets/glass.dart';
import 'format.dart';

/// Web AttachmentView + openFile: resimler satır içinde görünür ve tam ekran açılır; diğer dosyalar
/// yetkili istekle indirilip cihazdaki uygulamayla açılır.
class AttachmentView extends StatelessWidget {
  const AttachmentView({super.key, required this.a});
  final ChatAttachment a;

  bool get isImage => a.mime.startsWith('image/') && a.mime != 'image/heic';
  String get url => Api.i.url('/api/attachments/${a.id}');

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (isImage) {
      return GestureDetector(
        onTap: () => openAttachment(context, a),
        child: ClipRRect(borderRadius: BorderRadius.circular(12), child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 220, maxWidth: 240),
          child: CachedNetworkImage(imageUrl: url, httpHeaders: Api.i.authHeaders, fit: BoxFit.cover,
              placeholder: (_, _) => const SizedBox(width: 120, height: 90, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
              errorWidget: (_, _, _) => const SizedBox(width: 120, height: 60, child: Icon(Icons.broken_image_outlined))),
        )),
      );
    }
    return InkWell(
      onTap: () => openAttachment(context, a),
      borderRadius: BorderRadius.circular(12),
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(LucideIcons.fileText, size: 18, color: t.text),
        const SizedBox(width: 8),
        Flexible(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(a.fileName, style: TextStyle(color: t.text, fontWeight: FontWeight.w600)),
          Text(formatSize(a.size), style: TextStyle(fontSize: 12, color: t.text2)),
        ])),
      ])),
    );
  }
}

Future<void> openAttachment(BuildContext context, ChatAttachment a) async {
  final url = Api.i.url('/api/attachments/${a.id}');
  if (a.mime.startsWith('image/') && a.mime != 'image/heic') {
    await showGlassSheet<void>(context, full: true, builder: (c) => Stack(children: [
      Positioned.fill(child: InteractiveViewer(child: CachedNetworkImage(imageUrl: url, httpHeaders: Api.i.authHeaders, fit: BoxFit.contain))),
      Positioned(right: 8, top: 8, child: IconButton(onPressed: () => Navigator.of(c).pop(), icon: const Icon(Icons.close))),
    ]));
    return;
  }
  try {
    final res = await http.get(Uri.parse(url), headers: Api.i.authHeaders);
    if (res.statusCode >= 400) throw ApiError(res.statusCode, 'Dosya açılamadı');
    final dir = await Directory.systemTemp.createTemp('ozg');
    final f = File('${dir.path}/${a.fileName.replaceAll(RegExp(r'[\\/]'), '_')}');
    await f.writeAsBytes(res.bodyBytes);
    if (!await launchUrl(Uri.file(f.path))) throw ApiError(0, 'Dosya açılamadı');
  } catch (e) {
    if (context.mounted) showToast(context, e is ApiError ? e.message : 'Dosya açılamadı');
  }
}
