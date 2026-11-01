import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/erp.dart';
import '../../widgets/glass.dart';

// Web types-erp.ts biçim yardımcıları (tr_TR).
final _tl = NumberFormat('#,##0.00', 'tr_TR');
final _qty = NumberFormat('#,##0.###', 'tr_TR');
final _day = DateFormat('dd.MM.yyyy', 'tr_TR');
String money(num? n) => n == null ? '—' : '${_tl.format(n)} ₺';
String qty(num n) => _qty.format(n);
String day(String? s) {
  if (s == null || s.isEmpty) return '—';
  final d = DateTime.tryParse(s);
  return d == null ? '—' : _day.format(d.toLocal());
}

/// Filtre tarihini API'ye gider biçimde (ISO, UTC) üretir. addDay: bitişe +1 gün (web ile aynı).
String isoOf(DateTime d, {bool addDay = false}) {
  final x = DateTime(d.year, d.month, d.day + (addDay ? 1 : 0));
  return x.toUtc().toIso8601String();
}

({Color fg, Color bg}) statusColors(BuildContext c, String status) {
  final t = c.tk;
  switch (status) {
    case 'open':
      return (fg: t.accentInk, bg: t.accent.withValues(alpha: .15));
    case 'partial':
      return (fg: t.warn, bg: t.warn.withValues(alpha: .15));
    case 'shipped':
      return (fg: t.ok, bg: t.ok.withValues(alpha: .15));
    default:
      return (fg: t.text2, bg: t.fill);
  }
}

/// Web .erp-status
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key, this.quote = false});
  final String status;
  final bool quote;
  @override
  Widget build(BuildContext context) {
    final c = statusColors(context, status);
    final label = (quote ? quoteStatusLabel : orderStatusLabel)[status] ?? status;
    return Chip2(label, color: c.fg, bg: c.bg);
  }
}

class ShipProgress extends StatelessWidget {
  const ShipProgress({super.key, required this.shipped, required this.total});
  final double shipped, total;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (total <= 0) return Text('—', style: TextStyle(fontSize: 12, color: t.text2));
    final pct = (shipped / total * 100).round().clamp(0, 100);
    return Tooltip(
      message: '${qty(shipped)} / ${qty(total)}',
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(
          width: 70, height: 6,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(9),
            child: Stack(children: [
              Container(color: t.fill2),
              FractionallySizedBox(widthFactor: pct / 100, child: Container(color: t.accent)),
            ]),
          ),
        ),
        const SizedBox(width: 6),
        Text('%$pct', style: TextStyle(fontSize: 12, color: t.text2)),
      ]),
    );
  }
}

/// Cari adı + kodu; account.read yetkisi varsa cari kartına gider.
class CustomerCell extends StatelessWidget {
  const CustomerCell({super.key, required this.code, required this.name, this.bold = false});
  final String code;
  final String? name;
  final bool bold;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final body = Text.rich(TextSpan(children: [
      TextSpan(text: name ?? code, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: t.text)),
      if (name != null) TextSpan(text: '  $code', style: TextStyle(fontSize: 12, color: t.text2)),
    ]));
    if (!context.read<AuthController>().can('account.read')) return body;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.go('/accounts?code=${Uri.encodeQueryComponent(code)}'),
      child: body,
    );
  }
}

/// Web .stat (üst özet kartı).
class ErpStat extends StatelessWidget {
  const ErpStat(this.label, this.value, {super.key, this.sub, this.danger = false});
  final String label, value;
  final String? sub;
  final bool danger;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      radius: 18, padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(label, style: TextStyle(fontSize: 12.5, color: t.text2)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: danger ? t.danger : t.text)),
        if (sub != null) Text(sub!, style: TextStyle(fontSize: 12.5, color: t.text2)),
      ]),
    );
  }
}

/// Yatay kaydırılan istatistik şeridi (web .stats).
class StatRow extends StatelessWidget {
  const StatRow(this.children, {super.key});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 96,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: children.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => SizedBox(width: 150, child: children[i]),
        ),
      );
}

/// Web .seg (segmentli sekme)
class Seg<T> extends StatelessWidget {
  const Seg({super.key, required this.items, required this.value, required this.onChanged});
  final List<(T, String, IconData?)> items;
  final T value;
  final ValueChanged<T> onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(99)),
      child: Row(children: [
        for (final (k, label, icon) in items)
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(k),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(vertical: 9),
                decoration: BoxDecoration(color: k == value ? t.glassSolid : Colors.transparent, borderRadius: BorderRadius.circular(99)),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (icon != null) ...[Icon(icon, size: 15, color: k == value ? t.text : t.text2), const SizedBox(width: 5)],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: k == value ? t.text : t.text2))),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

class SearchField extends StatelessWidget {
  const SearchField({super.key, required this.controller, required this.hint, this.onChanged});
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;
  @override
  Widget build(BuildContext context) => TextField(
        controller: controller, onChanged: onChanged, textInputAction: TextInputAction.search,
        decoration: InputDecoration(hintText: hint, prefixIcon: Icon(Icons.search, size: 20, color: context.tk.text3), isDense: true),
      );
}

/// Açılır filtre (web <select>).
class Pick extends StatelessWidget {
  const Pick({super.key, required this.value, required this.options, required this.onChanged, required this.label});
  final String value, label;
  final List<(String, String)> options;
  final ValueChanged<String> onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value, isDense: true, borderRadius: BorderRadius.circular(14), dropdownColor: t.glassSolid,
          icon: Icon(Icons.expand_more, size: 18, color: t.text2),
          style: TextStyle(fontSize: 14, color: t.text, fontWeight: FontWeight.w500),
          items: [for (final (k, v) in options) DropdownMenuItem(value: k, child: Text(v))],
          onChanged: (v) => onChanged(v ?? value),
          hint: Text(label),
        ),
      ),
    );
  }
}

/// Tarih aralığı seçici (web .date-range).
class DateRangePick extends StatelessWidget {
  const DateRangePick({super.key, required this.from, required this.to, required this.onChanged});
  final DateTime? from, to;
  final void Function(DateTime? from, DateTime? to) onChanged;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    Future<void> pick(bool isFrom) async {
      final now = DateTime.now();
      final d = await showDatePicker(
        context: context, locale: const Locale('tr', 'TR'),
        initialDate: (isFrom ? from : to) ?? now, firstDate: DateTime(2000), lastDate: DateTime(now.year + 5),
      );
      if (d != null) onChanged(isFrom ? d : from, isFrom ? to : d);
    }

    Widget cell(bool isFrom, String hint, DateTime? v) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(14), onTap: () => pick(isFrom),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
              decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
              child: Row(children: [
                Expanded(child: Text(v == null ? hint : _day.format(v), style: TextStyle(fontSize: 14, color: v == null ? t.text3 : t.text))),
                if (v != null) GestureDetector(onTap: () => onChanged(isFrom ? null : from, isFrom ? to : null), child: Icon(Icons.close, size: 16, color: t.text2)),
              ]),
            ),
          ),
        );
    return Row(children: [cell(true, 'Başlangıç', from), const SizedBox(width: 8), cell(false, 'Bitiş', to)]);
  }
}

/// Web dl.props
class Props extends StatelessWidget {
  const Props(this.rows, {super.key});
  final List<(String, Widget)> rows;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(children: [
      for (final (k, v) in rows)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 90, child: Text(k, style: TextStyle(fontSize: 13.5, color: t.text2))),
            Expanded(child: DefaultTextStyle.merge(style: TextStyle(fontSize: 14.5, color: t.text), child: v)),
          ]),
        ),
    ]);
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 16, 0, 8),
        child: Text(text, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: context.tk.text)),
      );
}

class EmptyNote extends StatelessWidget {
  const EmptyNote(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.all(16), child: Center(child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: context.tk.text2))));
}

class ErrorNote extends StatelessWidget {
  const ErrorNote(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.all(16), child: Text(text, style: TextStyle(color: context.tk.danger)));
}

/// Kalem tablosu yerine kart listesi (web Items).
class ItemsList extends StatelessWidget {
  const ItemsList({super.key, required this.items, this.showShipped = false});
  final List<DocItem> items;
  final bool showShipped;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Kalemler'),
      if (items.isEmpty) Text('Kalem yok.', style: TextStyle(color: t.text2)),
      for (final it in items)
        Container(
          margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(it.stockName ?? it.stockCode, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
            Text(it.stockCode, style: TextStyle(fontSize: 12, color: t.text2)),
            const SizedBox(height: 8),
            Wrap(spacing: 16, runSpacing: 4, children: [
              _kv(t, 'Miktar', '${qty(it.qty)} ${it.unit ?? ''}'.trim()),
              if (showShipped) _kv(t, 'Sevk', qty(it.shippedQty ?? 0)),
              _kv(t, 'Birim fiyat', money(it.unitPrice)),
              _kv(t, 'KDV %', qty(it.vatRate)),
              _kv(t, 'Tutar', money(it.qty * it.unitPrice), bold: true),
            ]),
          ]),
        ),
    ]);
  }

  Widget _kv(Tokens t, String k, String v, {bool bold = false}) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(k, style: TextStyle(fontSize: 11.5, color: t.text2)),
        Text(v, style: TextStyle(fontSize: 13.5, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: t.text)),
      ]);
}

class LinkedTasks extends StatelessWidget {
  const LinkedTasks(this.tasks, {super.key});
  final List<LinkedTask> tasks;
  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return const SizedBox.shrink();
    final t = context.tk;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Bu belgeyle tamamlanan iş emirleri'),
      for (final k in tasks)
        ListTile(
          dense: true, contentPadding: EdgeInsets.zero,
          title: Text(k.title, style: TextStyle(color: t.accentInk)),
          onTap: () { Navigator.of(context).maybePop(); context.go('/tasks?id=${k.id}'); },
        ),
    ]);
  }
}

/// Liste satırı kartı (tablo satırı karşılığı).
class DocCard extends StatelessWidget {
  const DocCard({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Glass(
        radius: 18, margin: const EdgeInsets.only(bottom: 10), onTap: onTap,
        padding: const EdgeInsets.all(14), child: SizedBox(width: double.infinity, child: child),
      );
}
