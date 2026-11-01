import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../shared/format.dart';

/// Web form `label` bloğu: üstte etiket, altta alan, isteğe bağlı ipucu.
class FieldBox extends StatelessWidget {
  const FieldBox(this.label, {super.key, required this.child, this.hint});
  final String label;
  final Widget child;
  final String? hint;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 6), child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: t.text2))),
        child,
        if (hint != null) Padding(padding: const EdgeInsets.only(left: 4, top: 4), child: Text(hint!, style: TextStyle(fontSize: 12.5, color: t.text3))),
      ]),
    );
  }
}

/// Web `<select>` karşılığı.
class SelectField<T> extends StatelessWidget {
  const SelectField({super.key, required this.value, required this.items, required this.onChanged, this.disabled = false});
  final T value;
  final List<(T, String)> items;
  final ValueChanged<T>? onChanged;
  final bool disabled;
  @override
  Widget build(BuildContext context) {
    final has = items.any((e) => e.$1 == value);
    return DropdownButtonFormField<T>(
      key: ValueKey(value),
      initialValue: has ? value : null,
      isExpanded: true,
      icon: const Icon(LucideIcons.chevronDown, size: 18),
      dropdownColor: context.tk.glassSolid,
      decoration: const InputDecoration(),
      items: [for (final e in items) DropdownMenuItem<T>(value: e.$1, child: Text(e.$2, overflow: TextOverflow.ellipsis))],
      onChanged: disabled || onChanged == null ? null : (v) => onChanged!(v as T),
    );
  }
}

/// Web `<input type="date">`: değer "yyyy-MM-dd" ya da ISO; boşsa null.
class DateField extends StatelessWidget {
  const DateField({super.key, required this.value, required this.onChanged, this.disabled = false});
  final String? value;
  final ValueChanged<String?> onChanged;
  final bool disabled;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final d = value == null || value!.isEmpty ? null : DateTime.tryParse(dateKey(value!));
    return Opacity(
      opacity: disabled ? .6 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: disabled ? null : () async {
          final now = DateTime.now();
          final r = await showDatePicker(
            context: context, initialDate: d ?? now, firstDate: DateTime(2000), lastDate: DateTime(2100), locale: const Locale('tr', 'TR'));
          if (r != null) onChanged(localKey(r));
        },
        child: InputDecorator(
          decoration: InputDecoration(suffixIcon: d != null && !disabled
              ? IconButton(icon: const Icon(LucideIcons.x, size: 16), onPressed: () => onChanged(null))
              : const Icon(LucideIcons.calendarDays, size: 18)),
          child: Text(d == null ? 'gg.aa.yyyy' : DateFormat('dd.MM.yyyy').format(d), style: TextStyle(fontSize: 16, color: d == null ? t.text3 : t.text)),
        ),
      ),
    );
  }
}
