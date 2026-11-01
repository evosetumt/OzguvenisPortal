import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/glass.dart';

/// Web lib/files.ts: ek yükleme / alma yardımcıları. Dosya yolu /api/attachments/:id.
class UploadedFile {
  final int id, size;
  final String fileName, mime;
  UploadedFile(this.id, this.fileName, this.mime, this.size);
  factory UploadedFile.fromJson(Map<String, dynamic> j) =>
      UploadedFile((j['id'] as num).toInt(), j['fileName'] ?? '', j['mime'] ?? '', (j['size'] as num?)?.toInt() ?? 0);
}

/// Dosyayı /api/attachments'a yükler; dönen id ilgili kayda bağlanır.
Future<UploadedFile> uploadFile(String filePath) async =>
    UploadedFile.fromJson(Map<String, dynamic>.from(await Api.i.upload('/attachments', 'file', filePath)));

class FetchedFile {
  final Uint8List bytes;
  final String mime;
  final String? name;
  FetchedFile(this.bytes, this.mime, this.name);
}

/// Yetkili istekle dosyayı getirir ve sunucunun verdiği dosya adını okur (web fileBlob).
Future<FetchedFile> fileBlob(int id) async {
  http.Response res;
  try {
    res = await http.get(Uri.parse(Api.i.url('/api/attachments/$id')), headers: Api.i.authHeaders).timeout(const Duration(seconds: 60));
  } catch (_) {
    throw ApiError(0, 'Dosya açılamadı');
  }
  if (res.statusCode >= 400) throw ApiError(res.statusCode, 'Dosya açılamadı');
  final cd = res.headers['content-disposition'] ?? '';
  final m = RegExp(r"filename\*=UTF-8''([^;]+)").firstMatch(cd);
  return FetchedFile(res.bodyBytes, (res.headers['content-type'] ?? '').split(';').first.trim(), m == null ? null : Uri.decodeComponent(m.group(1)!));
}

/// Dosyayı uygulama içi görüntüleyicide açar (web openFile).
Future<void> openFile(BuildContext context, int id, [String? name]) =>
    Navigator.of(context, rootNavigator: true).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => FilePreviewPage(id: id, name: name)));

/// Cihaza indirir ve harici uygulamayla açar (web "İndir").
Future<void> downloadFile(BuildContext context, FetchedFile f, String name) async {
  try {
    final dir = await Directory.systemTemp.createTemp('ozg');
    final file = File('${dir.path}/${name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_')}');
    await file.writeAsBytes(f.bytes);
    if (!await launchUrl(Uri.file(file.path), mode: LaunchMode.externalApplication) && context.mounted) showToast(context, 'Dosya açılamadı');
  } catch (_) {
    if (context.mounted) showToast(context, 'Dosya indirilemedi');
  }
}

/// Web FilePreview: görsel (yakınlaştır/döndür); diğer türler için indirme.
class FilePreviewPage extends StatefulWidget {
  const FilePreviewPage({super.key, required this.id, this.name});
  final int id;
  final String? name;
  @override
  State<FilePreviewPage> createState() => _FilePreviewPageState();
}

class _FilePreviewPageState extends State<FilePreviewPage> {
  FetchedFile? file;
  String err = '';
  int rot = 0;
  final _ctl = TransformationController();

  @override
  void initState() {
    super.initState();
    fileBlob(widget.id).then((f) { if (mounted) setState(() => file = f); }).catchError((e) {
      if (mounted) setState(() => err = e is ApiError ? e.message : 'Dosya açılamadı');
    });
  }

  @override
  void dispose() { _ctl.dispose(); super.dispose(); }

  String get _name => widget.name ?? file?.name ?? 'dosya-${widget.id}';

  void _zoom(double f) => _ctl.value = _ctl.value.clone()..scaleByDouble(f, f, 1, 1);

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final f = file;
    final isImage = f != null && f.mime.startsWith('image/');
    Widget body;
    if (err.isNotEmpty) {
      body = Center(child: Text(err, style: const TextStyle(color: Colors.white)));
    } else if (f == null) {
      body = const Center(child: CircularProgressIndicator());
    } else if (isImage) {
      body = InteractiveViewer(
        transformationController: _ctl, minScale: .5, maxScale: 4,
        child: Center(child: RotatedBox(quarterTurns: rot, child: Image.memory(f.bytes, fit: BoxFit.contain))),
      );
    } else {
      body = Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Bu dosya türü için önizleme yok.', style: TextStyle(color: Colors.white)),
        const SizedBox(height: 14),
        PillButton(label: 'İndir', icon: LucideIcons.download, primary: true, onPressed: () => downloadFile(context, f, _name)),
      ]));
    }
    return Scaffold(
      backgroundColor: Colors.black.withValues(alpha: .92),
      appBar: AppBar(
        backgroundColor: Colors.transparent, foregroundColor: Colors.white,
        title: Text(file == null && err.isEmpty && widget.name == null ? 'Yükleniyor…' : _name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        actions: [
          if (isImage) ...[
            IconButton(tooltip: 'Uzaklaştır', icon: const Icon(LucideIcons.minus), onPressed: () => _zoom(1 / 1.25)),
            IconButton(tooltip: 'Yakınlaştır', icon: const Icon(LucideIcons.plus), onPressed: () => _zoom(1.25)),
            IconButton(tooltip: 'Döndür', icon: const Icon(LucideIcons.rotateCw), onPressed: () => setState(() => rot = (rot + 1) % 4)),
          ],
          if (f != null) IconButton(tooltip: 'İndir', icon: const Icon(LucideIcons.download), onPressed: () => downloadFile(context, f, _name)),
          IconButton(tooltip: 'Kapat', icon: Icon(LucideIcons.x, color: t.dark ? Colors.white : Colors.white), onPressed: () => Navigator.of(context).pop()),
        ],
      ),
      body: body,
    );
  }
}
