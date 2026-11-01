import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/realtime.dart';
import '../../core/theme.dart';
import 'format.dart';

class _Uploaded {
  _Uploaded(this.id, this.fileName, this.size);
  final int id, size;
  final String fileName;
}

/// Web Composer: metin, dosya eki (Api.i.upload → /attachments), "yazıyor…" bildirimi (en çok 2,5 sn'de bir).
class Composer extends StatefulWidget {
  const Composer({super.key, required this.conversationId, required this.onError});
  final int conversationId;
  final void Function(String msg) onError;
  @override
  State<Composer> createState() => _ComposerState();
}

class _ComposerState extends State<Composer> {
  final text = TextEditingController();
  _Uploaded? file;
  bool busy = false;
  int lastTyping = 0;

  @override
  void dispose() { text.dispose(); super.dispose(); }

  bool get canSend => !busy && (text.text.trim().isNotEmpty || file != null);

  Future<void> send() async {
    if (!canSend) return;
    setState(() => busy = true);
    try {
      await Api.i.post('/chat/conversations/${widget.conversationId}/messages', {
        if (text.text.trim().isNotEmpty) 'body': text.text.trim(),
        if (file != null) 'attachmentId': file!.id,
      });
      text.clear();
      file = null;
      widget.onError('');
    } catch (e) {
      widget.onError(e is ApiError ? e.message : 'Gönderilemedi');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> pick() async {
    final f = await FilePicker.pickFile();
    if (f?.path == null) return;
    setState(() => busy = true);
    try {
      final r = await Api.i.upload('/attachments', 'file', f!.path!);
      file = _Uploaded((r['id'] as num).toInt(), r['fileName'] as String? ?? f.name, (r['size'] as num?)?.toInt() ?? 0);
      widget.onError('');
    } catch (e) {
      widget.onError(e is ApiError ? e.message : 'Dosya yüklenemedi');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void changed(String _) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - lastTyping > 2500) { lastTyping = now; Realtime.typing(widget.conversationId); }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final f = file;
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (f != null) Container(
          margin: const EdgeInsets.only(bottom: 6), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(99)),
          child: Row(children: [
            Icon(LucideIcons.paperclip, size: 14, color: t.text),
            const SizedBox(width: 6),
            Expanded(child: Text('${f.fileName}  ${formatSize(f.size)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.text, fontSize: 13))),
            InkWell(onTap: () {
              Api.i.delete('/attachments/${f.id}').catchError((_) {});
              setState(() => file = null);
            }, child: Icon(LucideIcons.x, size: 14, color: t.text2)),
          ]),
        ),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          IconButton(tooltip: 'Dosya ekle', onPressed: busy ? null : pick, icon: Icon(LucideIcons.paperclip, size: 20, color: t.text)),
          Expanded(child: TextField(
            controller: text, minLines: 1, maxLines: 5, maxLength: 4000, onChanged: changed, textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(hintText: 'Mesaj yazın…', counterText: '', isDense: true, filled: true, fillColor: t.fill,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
          )),
          const SizedBox(width: 6),
          Opacity(opacity: canSend ? 1 : .5, child: Material(color: t.accent, shape: const CircleBorder(), child: InkWell(
            customBorder: const CircleBorder(), onTap: canSend ? send : null,
            child: const SizedBox(width: 44, height: 44, child: Icon(LucideIcons.send, size: 18, color: Colors.white)),
          ))),
        ]),
      ]),
    );
  }
}
