import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/erp.dart';
import '../widgets/glass.dart';
import 'accounts/customer_sheet.dart';
import 'orders/erp_ui.dart';

/// Netsis cari kartları, bakiyeler ve ekstre (salt okunur).
class AccountsPage extends StatefulWidget {
  const AccountsPage({super.key});
  @override
  State<AccountsPage> createState() => _AccountsPageState();
}

class _AccountsPageState extends State<AccountsPage> {
  final _search = TextEditingController();
  Timer? _deb;
  String _qd = '', _uri = '';
  bool _debtors = false;

  @override
  void dispose() { _deb?.cancel(); _search.dispose(); super.dispose(); }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final uri = GoRouterState.of(context).uri;
    if (uri.toString() == _uri) return;
    _uri = uri.toString();
    final code = uri.queryParameters['code'];
    if (code != null && code.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) showCustomerSheet(context, code); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthController>();
    final t = context.tk;
    final q = <String>[if (_qd.isNotEmpty) 'q=${Uri.encodeQueryComponent(_qd)}', if (_debtors) 'debtors=1'].join('&');

    Widget summaryList(String title, String total, List<TopCustomer> rows, {bool danger = false, String? empty, String? foot}) => Glass(
          radius: 22, margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text))),
              Text(total, style: TextStyle(fontWeight: FontWeight.w700, color: danger ? t.danger : t.text)),
            ]),
            const SizedBox(height: 6),
            if (rows.isEmpty && empty != null) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(empty, style: TextStyle(color: t.text2))),
            for (final r in rows)
              InkWell(
                onTap: () => showCustomerSheet(context, r.code),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(children: [
                    Expanded(child: Text(r.name, overflow: TextOverflow.ellipsis, style: TextStyle(color: t.text))),
                    Text(money(r.amount), style: TextStyle(fontSize: 12.5, color: danger ? t.danger : t.text2)),
                  ]),
                ),
              ),
            if (foot != null) Text(foot, style: TextStyle(fontSize: 12, color: t.text3)),
          ]),
        );

    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      const PageHead(title: 'Cari Hesaplar', sub: 'Netsis cari kartları ve bakiyeleri. Bakiye = borç − alacak (pozitif: cari bize borçlu).'),
      if (auth.can('report.read'))
        ApiView<ErpSummary>(
          path: '/erp/reports/summary',
          decode: (j) => ErpSummary.fromJson(Map<String, dynamic>.from(j as Map)),
          builder: (c, s, _) => Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(children: [
              summaryList('Toplam alacak', money(s.receivables), s.topCustomers),
              summaryList('Vadesi geçmiş alacak', money(s.overdueTotal), s.overdue,
                  danger: true, empty: 'Vadesi geçmiş alacak yok.',
                  foot: 'Yaklaşık: vadesi geçmiş borç hareketleri, carinin güncel bakiyesiyle sınırlanır.'),
            ]),
          ),
        ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Glass(
          radius: 22, padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SearchField(
              controller: _search, hint: 'Cari kodu, ünvan veya vergi no…',
              onChanged: (v) { _deb?.cancel(); _deb = Timer(const Duration(milliseconds: 300), () => setState(() => _qd = v.trim())); },
            ),
            const SizedBox(height: 4),
            CheckboxListTile(
              dense: true, contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading,
              value: _debtors, onChanged: (v) => setState(() => _debtors = v ?? false),
              title: const Text('Yalnız borçlular'),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      ApiView<({int total, List<Customer> items})>(
        path: '/erp/customers${q.isEmpty ? '' : '?$q'}',
        decode: (j) {
          final m = Map<String, dynamic>.from(j as Map);
          final items = ((m['items'] as List?) ?? const []).whereType<Map>().map((e) => Customer.fromJson(Map<String, dynamic>.from(e))).toList();
          return (total: (m['total'] as num?)?.toInt() ?? items.length, items: items);
        },
        builder: (c, data, _) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text('${data.total} cari${data.total > data.items.length ? ' (ilk ${data.items.length})' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
            ),
            for (final k in data.items)
              DocCard(
                onTap: () => showCustomerSheet(context, k.code),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(k.name, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text))),
                    Text(money(k.balance), style: TextStyle(fontWeight: FontWeight.w700, color: balanceColor(c, k.balance))),
                  ]),
                  Text('${k.code}${k.city != null ? ' · ${k.city}' : ''}${k.repCode != null ? ' · ${k.repCode}' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 18, children: [
                    Text('Borç ${money(k.debit)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                    Text('Alacak ${money(k.credit)}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                  ]),
                ]),
              ),
            if (data.items.isEmpty) const EmptyNote('Cari bulunamadı.'),
          ]),
        ),
      ),
    ]);
  }
}
