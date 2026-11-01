import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/erp.dart';
import 'erp_ui.dart';

List<T> _list<T>(dynamic j, T Function(Map<String, dynamic>) f) =>
    j is List ? j.whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList() : <T>[];

Widget _meta(BuildContext c, String k, Widget v) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(k, style: TextStyle(fontSize: 11.5, color: c.tk.text2)),
      DefaultTextStyle.merge(style: TextStyle(fontSize: 13.5, color: c.tk.text), child: v),
    ]);

class OrdersList extends StatelessWidget {
  const OrdersList({super.key, required this.query, required this.onOpen});
  final String query;
  final ValueChanged<int> onOpen;
  @override
  Widget build(BuildContext context) => ApiView<List<Order>>(
        path: '/erp/orders?$query',
        decode: (j) => _list(j, Order.fromJson),
        builder: (c, data, _) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            for (final o in data)
              DocCard(
                onTap: () => onOpen(o.id),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(o.docNo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.tk.text))),
                    StatusBadge(o.status),
                  ]),
                  const SizedBox(height: 4),
                  CustomerCell(code: o.customerCode, name: o.customerName),
                  const SizedBox(height: 10),
                  Wrap(spacing: 18, runSpacing: 8, children: [
                    _meta(c, 'Tarih', Text(day(o.date))),
                    _meta(c, 'Vade', Text(day(o.dueDate))),
                    _meta(c, 'Sevk', ShipProgress(shipped: o.shippedQty, total: o.totalQty)),
                    _meta(c, 'Plasiyer', Text(o.repCode ?? '—')),
                    _meta(c, 'Tutar', Text(money(o.total), style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ]),
              ),
            if (data.isEmpty) const EmptyNote('Kayıt yok.'),
            if (data.length == 300) const EmptyNote('İlk 300 kayıt gösteriliyor; filtreyi daraltın.'),
          ]),
        ),
      );
}

class QuotesList extends StatelessWidget {
  const QuotesList({super.key, required this.query, required this.onOpen});
  final String query;
  final ValueChanged<int> onOpen;
  @override
  Widget build(BuildContext context) => ApiView<List<Quote>>(
        path: '/erp/quotes?$query',
        decode: (j) => _list(j, Quote.fromJson),
        builder: (c, data, _) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            for (final x in data)
              DocCard(
                onTap: () => onOpen(x.id),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(x.docNo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.tk.text))),
                    StatusBadge(x.status, quote: true),
                  ]),
                  const SizedBox(height: 4),
                  CustomerCell(code: x.customerCode, name: x.customerName),
                  if (x.description != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(x.description!, style: TextStyle(fontSize: 13.5, color: c.tk.text2))),
                  const SizedBox(height: 10),
                  Wrap(spacing: 18, runSpacing: 8, children: [
                    _meta(c, 'Tarih', Text(day(x.date))),
                    _meta(c, 'Plasiyer', Text(x.repCode ?? '—')),
                    _meta(c, 'Tutar', Text(money(x.total), style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ]),
              ),
            if (data.isEmpty) const EmptyNote('Kayıt yok.'),
          ]),
        ),
      );
}

class ShipmentsList extends StatelessWidget {
  const ShipmentsList({super.key, required this.query});
  final String query;
  @override
  Widget build(BuildContext context) => ApiView<List<Shipment>>(
        path: '/erp/shipments?$query',
        decode: (j) => _list(j, Shipment.fromJson),
        builder: (c, data, _) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(children: [
            for (final s in data)
              DocCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(s.docNo, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.tk.text))),
                    Text(money(s.total), style: TextStyle(fontWeight: FontWeight.w700, color: c.tk.text)),
                  ]),
                  const SizedBox(height: 4),
                  CustomerCell(code: s.customerCode, name: s.customerName),
                  const SizedBox(height: 10),
                  Wrap(spacing: 18, runSpacing: 8, children: [
                    _meta(c, 'Tür', Text(shipTypeLabel[s.docType] ?? s.docType)),
                    _meta(c, 'Tarih', Text(day(s.date))),
                    _meta(
                      c, 'Siparişler',
                      s.orderNos == null
                          ? const Text('—')
                          : Wrap(spacing: 10, children: [
                              for (final n in s.orderNos!.split(','))
                                GestureDetector(
                                  onTap: () => c.go('/orders?tab=orders&q=${Uri.encodeQueryComponent(n)}'),
                                  child: Text(n, style: TextStyle(color: c.tk.accentInk, fontWeight: FontWeight.w600)),
                                ),
                            ]),
                    ),
                  ]),
                ]),
              ),
            if (data.isEmpty) const EmptyNote('Kayıt yok.'),
          ]),
        ),
      );
}
