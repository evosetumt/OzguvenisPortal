import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../widgets/glass.dart';
import 'common.dart';

/// Hesap sekmesi: şifre değiştir (web PasswordForm).
class PasswordForm extends StatefulWidget {
  const PasswordForm({super.key});
  @override
  State<PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<PasswordForm> {
  final cur = TextEditingController(), nw = TextEditingController(), rep = TextEditingController();
  Note? msg;
  bool busy = false;

  @override
  void dispose() { cur.dispose(); nw.dispose(); rep.dispose(); super.dispose(); }

  Future<void> submit() async {
    if (cur.text.isEmpty || nw.text.length < 8 || rep.text.length < 8) {
      setState(() => msg = const Note(false, 'Yeni şifre en az 8 karakter olmalı'));
      return;
    }
    if (nw.text != rep.text) { setState(() => msg = const Note(false, 'Yeni şifreler eşleşmiyor')); return; }
    setState(() { busy = true; msg = null; });
    try {
      await Api.i.post('/auth/password', {'currentPassword': cur.text, 'newPassword': nw.text});
      cur.clear(); nw.clear(); rep.clear();
      msg = const Note(true, 'Şifre değiştirildi');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Değiştirilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Panel(title: 'Şifre değiştir', children: [
        Fld('Mevcut şifre', cur, obscure: true, autofill: const [AutofillHints.password]),
        Fld('Yeni şifre', nw, obscure: true, autofill: const [AutofillHints.newPassword]),
        Fld('Tekrar', rep, obscure: true, autofill: const [AutofillHints.newPassword]),
        noteView(msg),
        const SizedBox(height: 8),
        Align(alignment: Alignment.centerRight, child: PillButton(label: 'Kaydet', primary: true, busy: busy, onPressed: submit)),
      ]);
}
