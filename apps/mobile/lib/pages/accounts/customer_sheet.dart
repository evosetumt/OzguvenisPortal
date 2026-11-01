import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/erp.dart';
import '../../widgets/glass.dart';
import '../orders/edoc_preview.dart';
import '../orders/erp_ui.dart';

Color balanceColor(BuildContext c, double b) => b > 0 ? c.tk.warn : (b < 0 ? c.tk.ok : c.tk.text);

/// Cari detayı (web CustomerDrawer): bakiye, bilgiler, ekstre, siparişler, teklifler.
Future<void> showCustomerSheet(BuildContext context, String code) => showGlassSheet(
      context, full: true,
      builder: (c) => ApiView<CustomerDetail>(
        path: '/erp/customers/${Uri.encodeComponent(code)}',
        decode: (j) => CustomerDetail.fromJson(Map<String, dynamic>.from(j as Map)),
        builder: (c, d, _) => _CustomerBody(d),
      ),
    );

class _CustomerBody extends StatelessWidget {
  const _CustomerBody(this.d);
  final CustomerDetail d;

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final k = d.customer;
    final now = DateTime.now();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
        child: Row(children: [
          Expanded(child: Text(k.name, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: t.text))),
          IconButton(tooltip: 'Kapat', icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 24), children: [
          SizedBox(
            height: 92,
            child: Row(children: [
              Expanded(child: ErpStat('Borç', money(k.debit))),
              const SizedBox(width: 8),
              Expanded(child: ErpStat('Alacak', money(k.credit))),
              const SizedBox(width: 8),
              Expanded(child: _BalanceStat(k.balance)),
            ]),
          ),
          const SizedBox(height: 12),
          Props([
            ('Kod', Text(k.code)),
            if (k.taxNo != null) ('Vergi', Text('${k.taxOffice ?? ''} ${k.taxNo}'.trim())),
            if (k.phone != null) ('Telefon', GestureDetector(onTap: () => launchUrl(Uri(scheme: 'tel', path: k.phone)), child: Text(k.phone!, style: TextStyle(color: t.accentInk)))),
            if (k.email != null) ('E-posta', GestureDetector(onTap: () => launchUrl(Uri(scheme: 'mailto', path: k.email)), child: Text(k.email!, style: TextStyle(color: t.accentInk)))),
            if (k.address != null || k.city != null) ('Adres', Text([k.address, k.city].whereType<String>().where((s) => s.isNotEmpty).join(', '))),
            ('Plasiyer', Text(k.repCode ?? '—')),
          ]),
          const SectionTitle('Ekstre'),
          _row(t, left: 'Devir (önceki dönem)', right: money(d.opening), muted: true),
          for (final x in d.statement)
            Container(
              margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Text(day(x.date), style: TextStyle(fontSize: 12.5, color: t.text2)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: x.eDoc && x.docNo != null
                        ? GestureDetector(
                            onTap: () => showEDocumentPreview(context, customerCode: k.code, docNo: x.docNo!),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.description_outlined, size: 14, color: t.accentInk),
                              const SizedBox(width: 4),
                              Flexible(child: Text(x.docNo!, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: t.accentInk))),
                            ]),
                          )
                        : Text(x.docNo ?? '—', overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: t.text)),
                  ),
                  Text(money(x.balance), style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                ]),
                if (x.description != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(x.description!, style: TextStyle(fontSize: 13, color: t.text2))),
                const SizedBox(height: 6),
                Wrap(spacing: 16, runSpacing: 2, children: [
                  if (x.dueDate != null)
                    Text('Vade ${day(x.dueDate)}', style: TextStyle(fontSize: 12.5, color: x.debit > 0 && (DateTime.tryParse(x.dueDate!)?.isBefore(now) ?? false) ? t.danger : t.text2)),
                  if (x.debit != 0) Text('Borç ${money(x.debit)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                  if (x.credit != 0) Text('Alacak ${money(x.credit)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                ]),
              ]),
            ),
          if (d.orders.isNotEmpty) ...[
            const SectionTitle('Siparişler'),
            for (final o in d.orders)
              InkWell(
                onTap: () { Navigator.of(context).pop(); context.go('/orders?order=${o.id}'); },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(children: [
                    Expanded(child: Text('${o.docNo} · ${day(o.date)}', style: TextStyle(color: t.text))),
                    StatusBadge(o.status),
                    const SizedBox(width: 8),
                    Text(money(o.total), style: TextStyle(fontSize: 12.5, color: t.text2)),
                  ]),
                ),
              ),
          ],
          if (d.quotes.isNotEmpty) ...[
            const SectionTitle('Teklifler'),
            for (final x in d.quotes)
              InkWell(
                onTap: () { Navigator.of(context).pop(); context.go('/orders?tab=quotes&quote=${x.id}'); },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(children: [
                    Expanded(child: Text('${x.docNo} · ${day(x.date)}', style: TextStyle(color: t.text))),
                    StatusBadge(x.status, quote: true),
                    const SizedBox(width: 8),
                    Text(money(x.total), style: TextStyle(fontSize: 12.5, color: t.text2)),
                  ]),
                ),
              ),
          ],
        ]),
      ),
    ]);
  }

  Widget _row(Tokens t, {required String left, required String right, bool muted = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Expanded(child: Text(left, style: TextStyle(fontStyle: FontStyle.italic, color: muted ? t.text2 : t.text))),
          Text(right, style: TextStyle(color: t.text2)),
        ]),
      );
}

class _BalanceStat extends StatelessWidget {
  const _BalanceStat(this.b);
  final double b;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Glass(
      radius: 18, padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Bakiye', style: TextStyle(fontSize: 12.5, color: t.text2)),
        const SizedBox(height: 2),
        // Web: bakiye > 0 ? erp-debit : erp-credit
        FittedBox(fit: BoxFit.scaleDown, child: Text(money(b), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: b > 0 ? t.warn : t.ok))),
      ]),
    );
  }
}
