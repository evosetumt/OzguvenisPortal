import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../widgets/glass.dart';

/// Web format.ts → timeAgo
String timeAgo(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 60) return 'şimdi';
  if (s < 3600) return '${s ~/ 60} dk önce';
  if (s < 86400) return '${s ~/ 3600} sa önce';
  if (s < 7 * 86400) return '${s ~/ 86400} gün önce';
  return DateFormat('d MMM', 'tr_TR').format(d.toLocal());
}

String fmtDate(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? '' : DateFormat('d MMM y', 'tr_TR').format(d.toLocal());
}

String fmtTime(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? '' : DateFormat('HH:mm', 'tr_TR').format(d.toLocal());
}

String errText(Object e, String fallback) => e is Exception ? e.toString().replaceFirst('Exception: ', '') : fallback;

/// Web .glass.panel: başlıklı cam kart.
class Panel extends StatelessWidget {
  const Panel({super.key, this.title, this.icon, this.trailing, required this.children});
  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              if (icon != null) Padding(padding: const EdgeInsets.only(right: 8), child: Icon(icon, size: 18, color: t.text)),
              Expanded(child: Text(title!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: t.text))),
              ?trailing,
            ]),
          ),
        ...children,
      ]),
    );
  }
}

/// Alt başlık (web h4)
class H4 extends StatelessWidget {
  const H4(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(top: 16, bottom: 8), child: Text(text, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: context.tk.text)));
}

/// Web p.sub / p.hint
class Hint extends StatelessWidget {
  const Hint(this.text, {super.key, this.bottom = 10});
  final String text;
  final double bottom;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: EdgeInsets.only(bottom: bottom), child: Text(text, style: TextStyle(fontSize: 13.5, height: 1.35, color: context.tk.text2)));
}

/// Web p.ok / p.error
class Msg extends StatelessWidget {
  const Msg(this.ok, this.text, {super.key});
  final bool ok;
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: ok ? t.green : t.danger)),
    );
  }
}

/// Basit durum çifti: { ok, text }
class Note {
  final bool ok;
  final String text;
  const Note(this.ok, this.text);
}

Widget noteView(Note? n) => n == null ? const SizedBox.shrink() : Msg(n.ok, n.text);

/// Etiketli metin alanı (web label + input).
class Fld extends StatelessWidget {
  const Fld(this.label, this.c, {super.key, this.hint, this.keyboard, this.obscure = false, this.enabled = true, this.maxLength, this.onChanged, this.autofill});
  final String label;
  final TextEditingController c;
  final String? hint;
  final TextInputType? keyboard;
  final bool obscure, enabled;
  final int? maxLength;
  final ValueChanged<String>? onChanged;
  final Iterable<String>? autofill;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(bottom: 6, left: 2), child: Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text2))),
        TextField(
          controller: c, obscureText: obscure, enabled: enabled, keyboardType: keyboard, maxLength: maxLength, onChanged: onChanged,
          autofillHints: autofill, buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
          decoration: InputDecoration(hintText: hint),
        ),
      ]),
    );
  }
}

/// Etiketli açılır liste; null değer = boş seçenek.
class Sel<T> extends StatelessWidget {
  const Sel({super.key, this.label, required this.value, required this.items, required this.onChanged, this.enabled = true});
  final String? label;
  final T? value;
  final List<DropdownMenuItem<T?>> items;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (label != null) Padding(padding: const EdgeInsets.only(bottom: 6, left: 2), child: Text(label!, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text2))),
        DropdownButtonFormField<T?>(
          key: ValueKey(value), initialValue: value, items: items, isExpanded: true, dropdownColor: t.glassSolid,
          onChanged: enabled ? onChanged : null,
        ),
      ]),
    );
  }
}

/// Web label.check
class CheckRow extends StatelessWidget {
  const CheckRow(this.label, this.value, this.onChanged, {super.key});
  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return InkWell(
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 28, height: 28, child: Checkbox(value: value, onChanged: onChanged == null ? null : (v) => onChanged!(v ?? false), activeColor: t.accent)),
          const SizedBox(width: 8),
          Expanded(child: Padding(padding: const EdgeInsets.only(top: 4), child: Text(label, style: TextStyle(fontSize: 14.5, color: t.text)))),
        ]),
      ),
    );
  }
}

/// Seçilebilir hap (web .chip / .chip.on)
class ChipBtn extends StatelessWidget {
  const ChipBtn(this.label, this.on, this.onTap, {super.key});
  final String label;
  final bool on;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Material(
      color: on ? t.accentSoft : t.fill, shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(), onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: on ? t.accentInk : t.text2)),
        ),
      ),
    );
  }
}

/// Satır etiketi + değer (web dl.props)
class Prop extends StatelessWidget {
  const Prop(this.k, this.v, {super.key});
  final String k, v;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(k, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: t.text3)),
        Text(v, style: TextStyle(fontSize: 14.5, color: t.text)),
      ]),
    );
  }
}

Future<bool> confirmDialog(BuildContext c, String text) async =>
    await showDialog<bool>(
      context: c,
      builder: (d) => AlertDialog(
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Vazgeç')),
          TextButton(onPressed: () => Navigator.pop(d, true), child: const Text('Tamam')),
        ],
      ),
    ) ??
    false;

/// ApiData sahibi + dinleyen yardımcı: builder, verinin kendisini (setData için) alır.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.path, required this.decode, required this.builder});
  final String path;
  final T Function(dynamic) decode;
  final Widget Function(BuildContext, ApiData<T> d) builder;
  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late final ApiData<T> d = ApiData<T>(widget.path, decode: widget.decode);
  @override
  void dispose() { d.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: d, builder: (c, _) => widget.builder(c, d));
}

extension ApiDataSet<T> on ApiData<T> {
  /// web useApi → setData
  // ignore: invalid_use_of_protected_member, invalid_use_of_visible_for_testing_member
  void setData(T? v) { data = v; notifyListeners(); }
}

Widget errLine(BuildContext c, String e) => e.isEmpty ? const SizedBox.shrink() : Msg(false, e);

Widget emptyLine(BuildContext c, String text) =>
    Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Center(child: Text(text, style: TextStyle(color: c.tk.text3))));

/// Küçük hap düğme (web .btn.sm)
Widget smBtn(String label, VoidCallback? onTap, {bool primary = false, bool danger = false, IconData? icon, bool busy = false}) =>
    PillButton(label: label, onPressed: onTap, primary: primary, danger: danger, icon: icon, busy: busy);
