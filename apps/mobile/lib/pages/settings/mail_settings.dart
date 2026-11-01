import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../models/settings.dart';
import 'common.dart';

/// Ayarlar → Bildirim kuralları: e-posta kanalının SMTP sunucusu. Şifre ekrana geri gelmez.
class MailSettings extends StatelessWidget {
  const MailSettings({super.key});
  @override
  Widget build(BuildContext context) => Loader<MailConfig>(
        path: '/notifications/mail',
        decode: (j) => MailConfig.fromJson(Map<String, dynamic>.from(j as Map)),
        builder: (c, d) => Panel(title: 'E-posta sunucusu (SMTP)', children: [
          const Hint('Bildirim kurallarında “E-posta” seçili olaylar bu sunucu üzerinden kullanıcının kayıtlı e-posta adresine gönderilir.'),
          errLine(c, d.error),
          if (d.data != null) _MailForm(data: d.data!, onSaved: (m) => d.setData(m)),
        ]),
      );
}

class _MailForm extends StatefulWidget {
  const _MailForm({required this.data, required this.onSaved});
  final MailConfig data;
  final ValueChanged<MailConfig> onSaved;
  @override
  State<_MailForm> createState() => _MailFormState();
}

class _MailFormState extends State<_MailForm> {
  late final host = TextEditingController(text: widget.data.host);
  late final port = TextEditingController(text: '${widget.data.port}');
  late final user = TextEditingController(text: widget.data.user);
  late final from = TextEditingController(text: widget.data.from);
  // Web: boşsa location'dan türetilir; mobilde sunucu adresi kullanılır.
  late final portalUrl = TextEditingController(text: widget.data.portalUrl.isNotEmpty ? widget.data.portalUrl : Api.i.baseUrl);
  final password = TextEditingController(), testTo = TextEditingController();
  late bool secure = widget.data.secure;
  bool busy = false;
  Note? msg;

  @override
  void dispose() {
    for (final c in [host, port, user, from, portalUrl, password, testTo]) { c.dispose(); }
    super.dispose();
  }

  Future<void> submit() async {
    final p = int.tryParse(port.text);
    if (host.text.trim().isEmpty || from.text.trim().isEmpty || p == null || p < 1 || p > 65535) {
      setState(() => msg = const Note(false, 'Sunucu, geçerli bir port ve gönderen gerekli'));
      return;
    }
    setState(() { busy = true; msg = null; });
    try {
      final r = await Api.i.put('/notifications/mail', {
        'host': host.text, 'port': p, 'secure': secure, 'user': user.text, 'from': from.text, 'portalUrl': portalUrl.text,
        if (password.text.isNotEmpty) 'password': password.text,
      });
      widget.onSaved(MailConfig.fromJson(Map<String, dynamic>.from(r as Map)));
      password.clear();
      msg = const Note(true, 'Kaydedildi');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Kaydedilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> test() async {
    setState(() { busy = true; msg = null; });
    try {
      final r = await Api.i.post('/notifications/mail/test', testTo.text.trim().isNotEmpty ? {'to': testTo.text.trim()} : {});
      msg = Note(true, 'Deneme e-postası gönderildi: ${r['to']}');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Gönderilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Fld('Sunucu', host, hint: 'smtp.ornek.com'),
      Fld('Port', port, keyboard: TextInputType.number),
      CheckRow('SSL/TLS bağlantı (port 465). Kapalıysa STARTTLS (port 587) kullanılır.', secure, (v) => setState(() {
            secure = v;
            port.text = v ? '465' : (port.text == '465' ? '587' : port.text);
          })),
      const SizedBox(height: 8),
      Fld('Kullanıcı adı', user),
      Fld('Şifre', password, obscure: true, hint: d.passwordSet ? 'Kayıtlı — değiştirmek için yazın' : null, autofill: const [AutofillHints.newPassword]),
      Fld('Gönderen', from, hint: 'Özgüveniş Portal <portal@ozguvenis.com.tr>'),
      Fld('Portal adresi (e-postadaki bağlantı)', portalUrl),
      if (d.source == 'env') const Hint('Şu an sunucu ortam değişkenlerindeki ayarlar kullanılıyor; kaydettiğinizde bu ekrandaki ayarlar geçerli olur.'),
      Fld('Deneme alıcısı', testTo, keyboard: TextInputType.emailAddress, hint: 'Boş bırakılırsa kendi adresiniz'),
      Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.end, children: [
        smBtn('Deneme gönder', busy || d.source == 'none' ? null : test, icon: LucideIcons.send),
        smBtn('Kaydet', busy ? null : submit, primary: true),
      ]),
      noteView(msg),
    ]);
  }
}
