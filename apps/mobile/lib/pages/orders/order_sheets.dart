import 'package:flutter/material.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/erp.dart';
import '../../widgets/glass.dart';
import 'erp_ui.dart';

Widget _sheetFrame(BuildContext c, String title, Widget body) => Column(mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
        child: Row(children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: c.tk.text))),
          IconButton(tooltip: 'Kapat', icon: const Icon(Icons.close), onPressed: () => Navigator.of(c).pop()),
        ]),
      ),
      Flexible(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 24), child: body)),
    ]);

Future<void> showOrderSheet(BuildContext context, int id) => showGlassSheet(
      context,
      builder: (c) => ApiView<OrderDetail>(
        path: '/erp/orders/$id',
        decode: (j) => OrderDetail.fromJson(Map<String, dynamic>.from(j as Map)),
        builder: (c, d, _) {
          final o = d.order;
          final t = c.tk;
          return _sheetFrame(
            c, 'Sipariş ${o.docNo}',
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Props([
                ('Cari', CustomerCell(code: o.customerCode, name: o.customerName)),
                ('Tür', Text(o.kind == 'sales' ? 'Müşteri siparişi' : 'Satıcı siparişi')),
                ('Tarih', Text('${day(o.date)}${o.dueDate != null ? ' · vade ${day(o.dueDate)}' : ''}')),
                ('Durum', Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [StatusBadge(o.status), ShipProgress(shipped: o.shippedQty, total: o.totalQty)])),
                ('Tutar', Text.rich(TextSpan(children: [
                  TextSpan(text: '${money(o.gross)} + KDV ${money(o.vat)} = '),
                  TextSpan(text: money(o.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                ]))),
                if (o.description != null) ('Açıklama', Text(o.description!)),
                ('Plasiyer', Text(o.repCode ?? '—')),
              ]),
              ItemsList(items: d.items, showShipped: true),
              const SectionTitle('Sevkiyatlar'),
              if (d.shipments.isEmpty) Text('Henüz sevk yok.', style: TextStyle(color: t.text2)),
              for (final s in d.shipments)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(children: [
                    Expanded(child: Text('${shipTypeLabel[s.docType] ?? s.docType} ${s.docNo}', style: TextStyle(color: t.text))),
                    Text('${day(s.date)} · ${money(s.total)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                  ]),
                ),
              LinkedTasks(d.tasks),
            ]),
          );
        },
      ),
    );

Future<void> showQuoteSheet(BuildContext context, int id) => showGlassSheet(
      context,
      builder: (c) => ApiView<QuoteDetail>(
        path: '/erp/quotes/$id',
        decode: (j) => QuoteDetail.fromJson(Map<String, dynamic>.from(j as Map)),
        builder: (c, d, _) {
          final x = d.quote;
          return _sheetFrame(
            c, 'Teklif ${x.docNo}',
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Props([
                ('Cari', CustomerCell(code: x.customerCode, name: x.customerName)),
                ('Tarih', Text(day(x.date))),
                ('Durum', Align(alignment: Alignment.centerLeft, child: StatusBadge(x.status, quote: true))),
                ('Tutar', Text.rich(TextSpan(children: [
                  TextSpan(text: '${money(x.gross)} + KDV ${money(x.vat)} = '),
                  TextSpan(text: money(x.total), style: const TextStyle(fontWeight: FontWeight.w700)),
                ]))),
                if (x.description != null) ('Açıklama', Text(x.description!)),
                ('Plasiyer', Text(x.repCode ?? '—')),
              ]),
              ItemsList(items: d.items),
              LinkedTasks(d.tasks),
            ]),
          );
        },
      ),
    );
