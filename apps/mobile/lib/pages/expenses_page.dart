// Web pages/ExpensesPage.tsx: fişli masraf girişi ve onay durumu.
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/expenses.dart';
import '../widgets/glass.dart';
import 'expenses/expense_drawer.dart';
import 'expenses/expense_form.dart';
import 'expenses/ui.dart';

class ExpensesPage extends StatefulWidget {
  const ExpensesPage({super.key});
  @override
  State<ExpensesPage> createState() => _ExpensesPageState();
}

class _ExpensesPageState extends State<ExpensesPage> {
  String view = 'mine', status = '';
  int rev = 0;

  Future<void> _openDrawer(int id) async {
    final edit = await showExpenseDrawer(context, id, onChanged: () => setState(() => rev++));
    if (edit != null && mounted) await _openForm(edit);
  }

  Future<void> _openForm(ExpenseDetail? e) async {
    final saved = await showExpenseForm(context, expense: e);
    if (saved != null && mounted) {
      setState(() => rev++);
      await _openDrawer(saved.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final perms = context.read<AuthController>().me!.permissions;
    final views = <(String, String)>[
      ('mine', 'Masraflarım'),
      if (perms.containsKey('expense.approve')) ('team', 'Ekibim'),
      if (perms['expense.accounting'] == 'all' || perms['expense.approve'] == 'all') ('all', 'Tümü'),
    ];
    final canCreate = perms.containsKey('expense.create');
    final q = Uri(queryParameters: {'view': view, if (status.isNotEmpty) 'status': status}).query;
    final path = canCreate || view != 'mine' ? '/expenses?$q' : null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      PageHead(
        title: 'Masraflar',
        sub: 'Fişli masraf girişi ve onay durumu',
        actions: [if (canCreate) PillButton(label: 'Masraf', icon: LucideIcons.plus, primary: true, onPressed: () => _openForm(null))],
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (views.length > 1) Padding(padding: const EdgeInsets.only(bottom: 10), child: Seg<String>(items: views, value: view, onChanged: (v) => setState(() { view = v; status = ''; }))),
          DropF<String>(
            label: 'Durum',
            value: status,
            items: [('', 'Tüm durumlar'), for (final s in expenseStatusLabel.keys.where((s) => view == 'mine' || s != 'draft')) (s, expenseStatusLabel[s]!)],
            onChanged: (v) => setState(() => status = v ?? ''),
          ),
        ]),
      ),
      Expanded(
        child: path == null
            ? const SizedBox()
            : ApiView<List<Expense>>(
                key: ValueKey('$q-$rev'),
                path: path,
                decode: (j) => (j as List).map((e) => Expense.fromJson(Map<String, dynamic>.from(e))).toList(),
                builder: (c, rows, reload) {
                  final total = rows.fold<num>(0, (s, r) => s + r.amountTry);
                  return RefreshIndicator(
                    onRefresh: reload,
                    child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
                      Padding(padding: const EdgeInsets.only(bottom: 8, left: 4), child: Text('${rows.length} kayıt · ${fmtMoneyNum(total)}', style: TextStyle(color: t.text2, fontSize: 13))),
                      if (rows.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Kayıt yok', style: TextStyle(color: t.text3)))),
                      for (final r in rows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Glass(
                            radius: 18,
                            onTap: () => _openDrawer(r.id),
                            padding: const EdgeInsets.all(14),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Expanded(
                                  child: Text.rich(TextSpan(children: [
                                    TextSpan(text: r.description),
                                    if (r.receiptCount > 0) TextSpan(text: '  ${r.receiptCount} fiş', style: TextStyle(fontSize: 12, color: t.text2)),
                                  ]), style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: t.text)),
                                ),
                                const SizedBox(width: 10),
                                Text(fmtMoney(r.amount, r.currency), style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text)),
                              ]),
                              const SizedBox(height: 8),
                              Row(children: [
                                Expanded(child: Text('${shortDate(r.expenseDate)} · ${r.categoryName}${view != 'mine' ? ' · ${r.user.fullName}' : ''}', style: TextStyle(fontSize: 13, color: t.text2))),
                                statusChip(c, r.status, expenseStatusLabel[r.status] ?? r.status),
                              ]),
                            ]),
                          ),
                        ),
                    ]),
                  );
                },
              ),
      ),
    ]);
  }
}
