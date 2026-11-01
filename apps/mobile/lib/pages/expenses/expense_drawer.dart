// Web ExpensesPage.tsx → ExpenseDrawer: masraf ayrıntısı (çekmece = alt sayfa).
import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../models/expenses.dart';
import '../../widgets/glass.dart';
import 'expense_summary.dart';
import 'ui.dart';

/// Sonuç: düzenlenmek istenirse ExpenseDetail döner, aksi halde null. [onChanged] listeyi tazelemek içindir.
Future<ExpenseDetail?> showExpenseDrawer(BuildContext context, int id, {required VoidCallback onChanged}) =>
    showGlassSheet<ExpenseDetail>(context, builder: (c) => _ExpenseDrawer(id: id, onChanged: onChanged));

class _ExpenseDrawer extends StatefulWidget {
  const _ExpenseDrawer({required this.id, required this.onChanged});
  final int id;
  final VoidCallback onChanged;
  @override
  State<_ExpenseDrawer> createState() => _ExpenseDrawerState();
}

class _ExpenseDrawerState extends State<_ExpenseDrawer> {
  String err = '';
  bool busy = false;

  Future<void> _act(Future<dynamic> Function() fn, Future<void> Function() reload, {bool close = false}) async {
    setState(() { err = ''; busy = true; });
    try {
      await fn();
      widget.onChanged();
      if (close) {
        if (mounted) Navigator.pop(context);
        return;
      }
      await reload();
    } catch (x) {
      if (mounted) err = errMsg(x);
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return SheetFrame(
      title: 'Masraf #${widget.id}',
      child: ApiView<ExpenseDetail>(
        path: '/expenses/${widget.id}',
        decode: (j) => ExpenseDetail.fromJson(Map<String, dynamic>.from(j)),
        builder: (c, e, reload) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ExpenseSummary(e: e),
          if (err.isNotEmpty) errorNote(c, err),
          if (e.canEdit) ...[
            gap(16),
            Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 10, children: [
              if (e.status == 'draft')
                PillButton(
                  label: 'Sil', danger: true,
                  onPressed: busy ? null : () async {
                    if (await confirmDialog(c, 'Taslak silinsin mi?')) await _act(() => Api.i.delete('/expenses/${widget.id}'), reload, close: true);
                  },
                ),
              PillButton(label: 'Düzenle', onPressed: busy ? null : () => Navigator.pop(c, e)),
              PillButton(
                label: e.status == 'rejected' ? 'Yeniden gönder' : 'Onaya gönder', primary: true, busy: busy,
                onPressed: () => _act(() => Api.i.post('/expenses/${widget.id}/submit'), reload),
              ),
            ]),
          ],
        ]),
      ),
    );
  }
}
