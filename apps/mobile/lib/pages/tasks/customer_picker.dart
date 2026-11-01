import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/task.dart';

/// Web CustomerPicker: Netsis cari kodu alanı; yazdıkça /erp/customers/lookup'tan kod/ad önerir.
/// Netsis yoksa / yetki yoksa düz metin alanı gibi çalışır.
class CustomerPicker extends StatefulWidget {
  const CustomerPicker({super.key, required this.value, required this.onChanged, this.onCommit, this.disabled = false});
  final String value;
  final ValueChanged<String> onChanged;
  /// Alandan çıkınca (çekmecede kaydetmek için)
  final ValueChanged<String>? onCommit;
  final bool disabled;
  @override
  State<CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<CustomerPicker> {
  late final TextEditingController _c = TextEditingController(text: widget.value);
  final _focus = FocusNode();
  List<CustomerLookup> options = [];
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() {
      if (!_focus.hasFocus) widget.onCommit?.call(_c.text.trim());
    });
  }

  @override
  void dispose() { _t?.cancel(); _c.dispose(); _focus.dispose(); super.dispose(); }

  void _changed(String v) {
    widget.onChanged(v);
    _t?.cancel();
    final q = v.trim();
    if (widget.disabled || q.length < 2) { setState(() => options = []); return; }
    _t = Timer(const Duration(milliseconds: 250), () async {
      try {
        final r = await Api.i.get('/erp/customers/lookup?q=${Uri.encodeQueryComponent(q)}');
        if (mounted && _c.text.trim() == q) {
          setState(() => options = [for (final e in (r as List)) CustomerLookup.fromJson(Map<String, dynamic>.from(e))]);
        }
      } catch (_) {
        if (mounted) setState(() => options = []);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final code = _c.text.trim().toUpperCase();
    final match = options.where((o) => o.code.toUpperCase() == code).firstOrNull;
    final sugg = match != null ? const <CustomerLookup>[] : options.take(6).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextField(controller: _c, focusNode: _focus, enabled: !widget.disabled, maxLength: 60, onChanged: _changed,
          decoration: const InputDecoration(hintText: 'Kod veya ünvan yazın', counterText: '')),
      if (match != null) Padding(padding: const EdgeInsets.only(top: 4, left: 4), child: Text(match.name, style: TextStyle(fontSize: 13, color: t.text2))),
      for (final o in sugg)
        InkWell(
          onTap: () {
            _c.text = o.code;
            widget.onChanged(o.code);
            setState(() => options = [o]);
            widget.onCommit?.call(o.code);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
            child: Text('${o.code} · ${o.name}${o.city != null ? ' · ${o.city}' : ''}', style: TextStyle(fontSize: 14, color: t.text)),
          ),
        ),
    ]);
  }
}
