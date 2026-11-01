// Masraf / ödeme / süre takibi / akış sayfalarının ortak yardımcıları (web lib/format.ts, tracking/common.tsx, Modal/form sınıfları).
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../widgets/glass.dart';

String errMsg(Object e, [String fallback = 'İşlem başarısız']) => e is ApiError ? e.message : fallback;

/// Bitiş tarihleri UTC gece yarısı saklanır; tarih kısmı.
String dateKey(String iso) => iso.length >= 10 ? iso.substring(0, 10) : iso;
String localKey(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
String todayKey() => localKey(DateTime.now());

String fmtMoneyNum(num n, [String currency = 'TRY']) {
  final cur = RegExp(r'^[A-Z]{3}$').hasMatch(currency) ? currency : 'TRY';
  try {
    return NumberFormat.currency(locale: 'tr_TR', name: cur, decimalDigits: 2).format(n);
  } catch (_) {
    return '${n.toStringAsFixed(2)} $cur';
  }
}

/// Web fmtMoney: null/boş → "—".
String fmtMoney(Object? v, [String currency = 'TRY']) {
  if (v == null || '$v'.isEmpty) return '—';
  final n = v is num ? v : num.tryParse('$v');
  return n == null ? '—' : fmtMoneyNum(n, currency);
}

/// "31 Mar 2027" (gün olarak saklanan tarih).
String fmtDay(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(dateKey(iso));
  return d == null ? '—' : DateFormat('d MMM y', 'tr_TR').format(d);
}

/// Web shortDate: anlık tarih, yerel saat.
String shortDate(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? '—' : DateFormat('d MMM y', 'tr_TR').format(d);
}

String fmtDateTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? '—' : DateFormat('d MMM y HH:mm', 'tr_TR').format(d);
}

String fmtTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  return d == null ? '' : DateFormat('HH:mm:ss', 'tr_TR').format(d);
}

String fmtInt(num n) => NumberFormat.decimalPattern('tr_TR').format(n);

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

/// Kalan gün rozeti (web DaysLeft).
class DaysLeft extends StatelessWidget {
  const DaysLeft({super.key, required this.days, this.status});
  final int days;
  final String? status;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (status == 'renewed') return Chip2('Yenilendi');
    if (status == 'cancelled') return Chip2('İptal');
    if (days < 0) return Chip2('${-days} gün geçti', color: t.prioUrgent, bg: t.prioUrgentBg);
    if (days == 0) return Chip2('Bugün', color: t.prioUrgent, bg: t.prioUrgentBg);
    if (days <= 7) return Chip2('$days gün', color: t.prioUrgent, bg: t.prioUrgentBg);
    if (days <= 30) return Chip2('$days gün', color: t.prioHigh, bg: t.prioHighBg);
    return Chip2('$days gün', color: t.green, bg: t.green.withValues(alpha: .15));
  }
}

/// Durum hapı için renk: web .status / .pay-status sınıflarının karşılığı.
({Color fg, Color bg}) statusColors(Tokens t, String s) {
  switch (s) {
    case 'paid':
    case 'completed':
    case 'active':
    case 'approved':
    case 'accounting_approved':
      return (fg: t.green, bg: t.green.withValues(alpha: .15));
    case 'rejected':
    case 'failed':
    case 'expired':
      return (fg: t.prioUrgent, bg: t.prioUrgentBg);
    case 'awaiting':
    case 'submitted':
    case 'manager_approved':
    case 'running':
    case 'assigned':
      return (fg: t.prioHigh, bg: t.prioHighBg);
    case 'planned':
    case 'draft':
      return (fg: t.prioNormal, bg: t.prioNormalBg);
    default:
      return (fg: t.text2, bg: t.fill);
  }
}

Widget statusChip(BuildContext c, String status, String label) {
  final k = statusColors(c.tk, status);
  return Chip2(label, color: k.fg, bg: k.bg);
}

/// Web .seg: yatay kaydırılabilir sekme seçici.
class Seg<T> extends StatelessWidget {
  const Seg({super.key, required this.items, required this.value, required this.onChanged});
  final List<(T, String)> items;
  final T value;
  final ValueChanged<T> onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(99)),
        child: Row(children: [
          for (final (v, label) in items)
            GestureDetector(
              onTap: () => onChanged(v),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(color: v == value ? t.glassSolid : Colors.transparent, borderRadius: BorderRadius.circular(99)),
                child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: v == value ? t.text : t.text2)),
              ),
            ),
        ]),
      ),
    );
  }
}

/// Üstte sayım kutuları (web .stats / .stat).
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.child, this.onTap});
  final String label;
  final Widget child;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      radius: 18,
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: TextStyle(fontSize: 12.5, color: t.text2, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        child,
      ]),
    );
  }
}

Widget statNumber(BuildContext c, Object? v, {Color? color}) =>
    Text('${v ?? '–'}', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -.5, color: color ?? c.tk.text));

/// İki sütunlu 2x2 ızgara.
Widget statGrid(List<Widget> kids) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: LayoutBuilder(builder: (c, box) {
        final w = (box.maxWidth - 10) / 2;
        return Wrap(spacing: 10, runSpacing: 10, children: [for (final k in kids) SizedBox(width: w, child: k)]);
      }),
    );

/// Web .kv / .props satırı.
class KV extends StatelessWidget {
  const KV(this.k, this.v, {super.key, this.child});
  final String k;
  final String? v;
  final Widget? child;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 112, child: Text(k, style: TextStyle(fontSize: 14, color: t.text2))),
        Expanded(child: child ?? Text(v ?? '—', style: TextStyle(fontSize: 14.5, color: t.text, fontWeight: FontWeight.w500))),
      ]),
    );
  }
}

Widget h4(BuildContext c, String s, {Widget? trailing}) => Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 6),
      child: Row(children: [
        Expanded(child: Text(s, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.tk.text))),
        ?trailing,
      ]),
    );

Widget emptyNote(BuildContext c, String s) => Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(s, style: TextStyle(color: c.tk.text3)));

Widget errorNote(BuildContext c, String s) =>
    Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(s, style: TextStyle(color: c.tk.danger, fontSize: 14)));

/// Zaman çizelgesi satırı (web .timeline li).
class TimelineRow extends StatelessWidget {
  const TimelineRow({super.key, required this.title, this.sub, this.note, this.color, this.trailing});
  final String title;
  final String? sub, note;
  final Color? color;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 10, height: 10, margin: const EdgeInsets.only(top: 5, right: 10), decoration: BoxDecoration(color: color ?? t.accent, shape: BoxShape.circle)),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: t.text)),
            if (sub != null && sub!.isNotEmpty) Text(sub!, style: TextStyle(fontSize: 12.5, color: t.text2)),
            if (note != null && note!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(note!, style: TextStyle(fontSize: 14, color: t.text))),
          ]),
        ),
        ?trailing,
      ]),
    );
  }
}

/// Alttan açılan çekmece/form iskeleti: başlık + kapat + kaydırılabilir gövde.
class SheetFrame extends StatelessWidget {
  const SheetFrame({super.key, required this.title, required this.child, this.actions = const [], this.leading});
  final String title;
  final Widget child;
  final List<Widget> actions;
  final String? leading;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 8, 6),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (leading != null) Text(leading!, style: TextStyle(fontSize: 12.5, color: t.text2)),
            Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -.3, color: t.text)),
          ])),
          ...actions,
          IconButton(tooltip: 'Kapat', icon: Icon(LucideIcons.x, size: 20, color: t.text2), onPressed: () => Navigator.of(context).maybePop()),
        ]),
      ),
      Flexible(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 24), child: child)),
    ]);
  }
}

Future<bool> confirmDialog(BuildContext context, String msg, {String ok = 'Evet'}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      content: Text(msg),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
        TextButton(onPressed: () => Navigator.pop(c, true), child: Text(ok)),
      ],
    ),
  );
  return r == true;
}

/// Form alanları: web .form label + input.
Widget gap([double h = 12]) => SizedBox(height: h);

class TextF extends StatelessWidget {
  const TextF(this.label, this.ctrl, {super.key, this.hint, this.lines = 1, this.number = false, this.decimal = false, this.maxLength, this.onBlur, this.upper = false});
  final String label;
  final TextEditingController ctrl;
  final String? hint;
  final int lines;
  final bool number, decimal, upper;
  final int? maxLength;
  final VoidCallback? onBlur;
  @override
  Widget build(BuildContext context) {
    final f = TextField(
      controller: ctrl,
      minLines: lines,
      maxLines: lines,
      maxLength: maxLength,
      keyboardType: decimal ? const TextInputType.numberWithOptions(decimal: true) : (number ? TextInputType.number : (lines > 1 ? TextInputType.multiline : TextInputType.text)),
      decoration: InputDecoration(labelText: label, hintText: hint, counterText: ''),
    );
    return onBlur == null ? f : Focus(onFocusChange: (h) { if (!h) onBlur!(); }, child: f);
  }
}

class DropF<T> extends StatelessWidget {
  const DropF({super.key, required this.label, required this.value, required this.items, required this.onChanged});
  final String label;
  final T? value;
  final List<(T, String)> items;
  final ValueChanged<T?> onChanged;
  @override
  Widget build(BuildContext context) => DropdownButtonFormField<T>(
        key: ValueKey(value),
        initialValue: items.any((e) => e.$1 == value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [for (final (v, l) in items) DropdownMenuItem<T>(value: v, child: Text(l, overflow: TextOverflow.ellipsis))],
        onChanged: onChanged,
      );
}

/// Tarih seçici alan; değer "yyyy-MM-dd" ya da boş.
class DateF extends StatelessWidget {
  const DateF({super.key, required this.label, required this.value, required this.onChanged, this.max, this.min, this.clearable = false});
  final String label, value;
  final ValueChanged<String> onChanged;
  final DateTime? max, min;
  final bool clearable;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final d = DateTime.tryParse(value);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
        final r = await showDatePicker(
          context: context,
          locale: const Locale('tr', 'TR'),
          initialDate: d ?? (max != null && DateTime.now().isAfter(max!) ? max! : DateTime.now()),
          firstDate: min ?? DateTime(2000),
          lastDate: max ?? DateTime(2100),
        );
        if (r != null) onChanged(localKey(r));
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: clearable && value.isNotEmpty
              ? IconButton(icon: const Icon(LucideIcons.x, size: 16), onPressed: () => onChanged(''))
              : Icon(LucideIcons.calendar, size: 18, color: t.text2),
        ),
        child: Text(d == null ? ' ' : DateFormat('d MMM y', 'tr_TR').format(d), style: TextStyle(color: t.text)),
      ),
    );
  }
}

/// Arama + filtre çubuğu için metin arama alanı.
class SearchF extends StatelessWidget {
  const SearchF({super.key, required this.hint, required this.onChanged});
  final String hint;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) => TextField(
        onChanged: onChanged,
        decoration: InputDecoration(hintText: hint, prefixIcon: const Icon(LucideIcons.search, size: 18), isDense: true),
      );
}
