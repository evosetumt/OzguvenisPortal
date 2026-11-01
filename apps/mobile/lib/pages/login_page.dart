import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api.dart';
import '../core/auth.dart';
import '../core/theme.dart';
import '../widgets/brand_logo.dart';
import '../widgets/glass.dart';

/// Web LoginPage: logo + cam giriş kartı. Mobilde ek olarak sunucu adresi alanı vardır.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  static const _emailKey = 'ozg-remember-email';
  final _server = TextEditingController(text: Api.i.baseUrl);
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _remember = false, _busy = false;
  String _error = '';

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      final e = p.getString(_emailKey);
      if (e != null && mounted) setState(() { _email.text = e; _remember = true; });
    });
  }

  Future<void> _submit() async {
    if (_server.text.trim().isEmpty) { setState(() => _error = 'Sunucu adresini girin'); return; }
    setState(() { _busy = true; _error = ''; });
    try {
      await context.read<AuthController>().login(_server.text, _email.text.trim(), _pass.text, _remember);
      final p = await SharedPreferences.getInstance();
      _remember ? p.setString(_emailKey, _email.text.trim()) : p.remove(_emailKey);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiError ? e.message : 'Giriş başarısız');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const BrandLogo(emblem: true, width: 120),
                const SizedBox(height: 28),
                Glass(
                  radius: 30, padding: const EdgeInsets.all(24),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Giriş yap', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: t.text)),
                    const SizedBox(height: 4),
                    Text('Şirket e-posta adresinizle devam edin', style: TextStyle(color: t.text2)),
                    const SizedBox(height: 20),
                    _field('Sunucu adresi', _server, hint: 'https://portal.sirketadi.com.tr', type: TextInputType.url),
                    _field('E-posta', _email, type: TextInputType.emailAddress, autofill: AutofillHints.username),
                    _field('Şifre', _pass, obscure: true, autofill: AutofillHints.password, onSubmit: _submit),
                    CheckboxListTile(
                      value: _remember, onChanged: (v) => setState(() => _remember = v ?? false),
                      title: const Text('Beni hatırla'), contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, dense: true,
                    ),
                    if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(_error, style: TextStyle(color: t.danger))),
                    SizedBox(height: 48, child: PillButton(label: _busy ? 'Giriş yapılıyor…' : 'Giriş yap', primary: true, busy: _busy, onPressed: _submit)),
                  ]),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(String label, TextEditingController c, {String? hint, bool obscure = false, TextInputType? type, String? autofill, VoidCallback? onSubmit}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.tk.text2)),
          const SizedBox(height: 6),
          TextField(controller: c, obscureText: obscure, keyboardType: type, autofillHints: autofill == null ? null : [autofill],
              autocorrect: false, onSubmitted: onSubmit == null ? null : (_) => onSubmit(), decoration: InputDecoration(hintText: hint)),
        ]),
      );
}
