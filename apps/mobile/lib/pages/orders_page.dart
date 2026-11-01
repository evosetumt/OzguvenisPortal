import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../models/erp.dart';
import '../widgets/glass.dart';
import 'orders/erp_ui.dart';
import 'orders/order_lists.dart';
import 'orders/order_sheets.dart';

/// Netsis'ten senkronlanan sipariş, teklif ve sevkiyatlar (salt okunur).
class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  static const _tabs = [
    ('orders', 'Siparişler', 'order.read', LucideIcons.package),
    ('quotes', 'Teklifler', 'quote.read', LucideIcons.fileText),
    ('shipments', 'Sevkiyatlar', 'shipment.read', LucideIcons.truck),
  ];
  final _search = TextEditingController();
  Timer? _deb;
  String? _tab;
  String _qd = '', _status = '', _kind = 'sales', _uri = '';
  DateTime? _from, _to;

  @override
  void dispose() { _deb?.cancel(); _search.dispose(); super.dispose(); }

  List<(String, String, IconData?)> _avail(AuthController a) =>
      [for (final t in _tabs) if (a.can(t.$3)) (t.$1, t.$2, t.$4 as IconData?)];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uri = GoRouterState.of(context).uri;
    if (uri.toString() == _uri) return;
    _uri = uri.toString();
    final auth = context.read<AuthController>();
    final avail = _avail(auth);
    final p = uri.queryParameters;
    final want = avail.where((t) => t.$1 == p['tab']).firstOrNull?.$1;
    _tab = want ?? _tab ?? avail.firstOrNull?.$1;
    if (p['q'] != null) { _search.text = p['q']!; _qd = p['q']!.trim(); }
    final order = int.tryParse(p['order'] ?? ''), quote = int.tryParse(p['quote'] ?? '');
    if (order != null) WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) showOrderSheet(context, order); });
    if (quote != null) {
      _tab = 'quotes';
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) showQuoteSheet(context, quote); });
    }
  }

  void _switch(String t) => setState(() {
        _tab = t; _status = ''; _kind = t == 'shipments' ? '' : 'sales';
        _search.clear(); _qd = '';
      });

  String get _query {
    final q = <String, String>{};
    if (_qd.isNotEmpty) q['q'] = _qd;
    if (_status.isNotEmpty) q['status'] = _status;
    if (_kind.isNotEmpty) q['kind'] = _kind;
    if (_from != null) q['from'] = isoOf(_from!);
    if (_to != null) q['to'] = isoOf(_to!, addDay: true);
    return q.entries.map((e) => '${e.key}=${Uri.encodeQueryComponent(e.value)}').join('&');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthController>();
    final avail = _avail(auth);
    if (_tab == null || avail.isEmpty) {
      return ListView(children: const [PageHead(title: 'Sipariş / Teklif', sub: 'Bu bölüm için yetkiniz yok.')]);
    }
    final tab = avail.any((t) => t.$1 == _tab) ? _tab! : avail.first.$1;
    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      const PageHead(title: 'Sipariş / Teklif', sub: "Netsis'ten salt okunur aktarılır; değişiklikler Netsis'te yapılır."),
      if (auth.can('report.read'))
        ApiView<ErpSummary>(
          path: '/erp/reports/summary',
          decode: (j) => ErpSummary.fromJson(Map<String, dynamic>.from(j as Map)),
          builder: (c, s, _) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: StatRow([
              ErpStat('Açık sipariş', '${s.openOrders.count}', sub: money(s.openOrders.total)),
              ErpStat('Bu ay sipariş', '${s.monthOrders.count}', sub: money(s.monthOrders.total)),
              ErpStat('Açık teklif', '${s.openQuotes.count}', sub: money(s.openQuotes.total)),
              ErpStat('Bu ay sevk', '${s.monthShipments}'),
              ErpStat('Vadesi geçmiş alacak', money(s.overdueTotal), danger: s.overdueTotal != 0),
            ]),
          ),
        ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Glass(
          radius: 22, padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Seg<String>(items: avail, value: tab, onChanged: _switch),
            const SizedBox(height: 10),
            SearchField(
              controller: _search, hint: 'Belge no, cari kodu veya ünvan…',
              onChanged: (v) { _deb?.cancel(); _deb = Timer(const Duration(milliseconds: 300), () => setState(() => _qd = v.trim())); },
            ),
            const SizedBox(height: 8),
            if (tab == 'orders')
              Wrap(spacing: 8, runSpacing: 8, children: [
                Pick(label: 'Sipariş türü', value: _kind, options: const [('sales', 'Müşteri siparişleri'), ('purchase', 'Satıcı siparişleri')], onChanged: (v) => setState(() => _kind = v)),
                Pick(label: 'Durum', value: _status, options: [('', 'Tüm durumlar'), ('active', 'Açık + kısmi'), for (final e in orderStatusLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => _status = v)),
              ]),
            if (tab == 'quotes')
              Pick(label: 'Durum', value: _status, options: [('', 'Tüm durumlar'), for (final e in quoteStatusLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => _status = v)),
            if (tab == 'shipments')
              Pick(label: 'Belge türü', value: _kind, options: const [('', 'İrsaliye + fatura'), ('waybill', 'İrsaliye'), ('invoice', 'Fatura')], onChanged: (v) => setState(() => _kind = v)),
            const SizedBox(height: 8),
            DateRangePick(from: _from, to: _to, onChanged: (f, t) => setState(() { _from = f; _to = t; })),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      if (tab == 'orders') OrdersList(query: _query, onOpen: (id) => showOrderSheet(context, id)),
      if (tab == 'quotes') QuotesList(query: _query, onOpen: (id) => showQuoteSheet(context, id)),
      if (tab == 'shipments') ShipmentsList(query: _query),
    ]);
  }
}
