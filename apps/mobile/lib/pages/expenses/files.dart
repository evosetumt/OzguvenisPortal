// Web lib/files.ts + components/workflow/Receipt.tsx karşılığı: yükleme (image_picker / file_picker), küçük resim, görüntüleyici.
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../widgets/glass.dart';

String formatSize(int n) => n < 1024 * 1024 ? '${(n / 1024).round().clamp(1, 1 << 30)} KB' : '${(n / 1024 / 1024).toStringAsFixed(1)} MB';

/// Dosyayı /attachments'a yükler; dönen id ilgili kayda bağlanır.
Future<FileRef> uploadPath(String path) async =>
    FileRef.fromJson(Map<String, dynamic>.from(await Api.i.upload('/attachments', 'file', path) as Map));

enum PickKind { camera, gallery, file }

/// "Fotoğraf çek / Galeriden seç / Dosya seç" sayfası; seçilen dosyanın yolunu verir (iptal → null).
Future<String?> pickFilePath(BuildContext context, {bool allowFile = true}) async {
  final kind = await showGlassSheet<PickKind>(
    context,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const SizedBox(height: 8),
        ListTile(leading: const Icon(LucideIcons.camera), title: const Text('Fotoğraf çek'), onTap: () => Navigator.pop(c, PickKind.camera)),
        ListTile(leading: const Icon(LucideIcons.image), title: const Text('Galeriden seç'), onTap: () => Navigator.pop(c, PickKind.gallery)),
        if (allowFile) ListTile(leading: const Icon(LucideIcons.fileText), title: const Text('Dosya seç (PDF…)'), onTap: () => Navigator.pop(c, PickKind.file)),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (kind == null) return null;
  if (kind == PickKind.file) return (await FilePicker.pickFile())?.path;
  final x = await ImagePicker().pickImage(source: kind == PickKind.camera ? ImageSource.camera : ImageSource.gallery, imageQuality: 85, maxWidth: 2400);
  return x?.path;
}

String attachmentUrl(int id) => Api.i.url('/api/attachments/$id');

bool isViewableImage(FileRef f) => f.mime.startsWith('image/') && f.mime != 'image/heic';

/// Dosyayı açar: görsel → uygulama içi görüntüleyici; diğerleri indirilip sistemde açılır.
Future<void> openFile(BuildContext context, int id, String name, {String mime = ''}) async {
  if (mime.startsWith('image/') && mime != 'image/heic') {
    await showDialog<void>(
      context: context,
      builder: (c) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(children: [
          Positioned.fill(
            child: InteractiveViewer(
              maxScale: 6,
              child: Center(child: Image.network(attachmentUrl(id), headers: Api.i.authHeaders, errorBuilder: (_, _, _) => const Text('Dosya açılamadı', style: TextStyle(color: Colors.white)))),
            ),
          ),
          SafeArea(child: Align(alignment: Alignment.topRight, child: IconButton(icon: const Icon(LucideIcons.x, color: Colors.white), onPressed: () => Navigator.pop(c)))),
        ]),
      ),
    );
    return;
  }
  try {
    final res = await http.get(Uri.parse(attachmentUrl(id)), headers: Api.i.authHeaders);
    if (res.statusCode >= 400) throw ApiError(res.statusCode, 'Dosya açılamadı');
    final safe = name.replaceAll(RegExp(r'[^\w.\-]'), '_');
    final f = File('${Directory.systemTemp.path}/$id-$safe');
    await f.writeAsBytes(res.bodyBytes);
    if (!await launchUrl(Uri.file(f.path))) throw ApiError(0, 'Dosya açılamadı');
  } catch (e) {
    if (context.mounted) showToast(context, e is ApiError ? e.message : 'Dosya açılamadı');
  }
}

/// Fiş küçük resmi (web Receipt): görseller yetkili istekle gösterilir, diğerleri simgeyle.
class ReceiptThumb extends StatelessWidget {
  const ReceiptThumb({super.key, required this.file, this.onRemove});
  final FileRef file;
  final VoidCallback? onRemove;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return GestureDetector(
      onTap: () => openFile(context, file.id, file.fileName, mime: file.mime),
      child: Stack(clipBehavior: Clip.none, children: [
        Container(
          width: 84, height: 84,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14), border: Border.all(color: t.sep)),
          child: isViewableImage(file)
              ? Image.network(attachmentUrl(file.id), headers: Api.i.authHeaders, fit: BoxFit.cover, errorBuilder: (_, _, _) => Icon(LucideIcons.fileText, color: t.text2))
              : Padding(
                  padding: const EdgeInsets.all(6),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Icon(LucideIcons.fileText, size: 22, color: t.text2),
                    const SizedBox(height: 4),
                    Text(file.fileName, maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 10.5, color: t.text2)),
                  ]),
                ),
        ),
        if (onRemove != null)
          Positioned(
            top: -6, right: -6,
            child: GestureDetector(
              onTap: onRemove,
              child: Container(width: 24, height: 24, decoration: BoxDecoration(color: t.danger, shape: BoxShape.circle), child: const Icon(LucideIcons.x, size: 14, color: Colors.white)),
            ),
          ),
      ]),
    );
  }
}
