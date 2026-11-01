// Web components/workflow/ExpenseSummary.tsx: masraf özeti + onay zaman çizelgesi (masraf çekmecesi ve onay kutusunda ortak).
import 'package:flutter/material.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import 'files.dart';
import 'ui.dart';

class ExpenseSummary extends StatelessWidget {
  const ExpenseSummary({super.key, required this.e});
  final ExpenseDetail e;

  Color _dot(Tokens t, String d) => d == 'rejected' ? t.danger : (d == 'paid' || d == 'approved' ? t.green : t.accent);

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      KV('Durum', null, child: Align(alignment: Alignment.centerLeft, child: statusChip(context, e.status, expenseStatusLabel[e.status] ?? e.status))),
      KV('Personel', e.user.fullName),
      KV('Tutar', null,
          child: Text.rich(TextSpan(children: [
            TextSpan(text: fmtMoney(e.amount, e.currency), style: const TextStyle(fontWeight: FontWeight.w700)),
            if (e.currency != 'TRY') TextSpan(text: ' · ${fmtMoney(e.amountTry)}', style: TextStyle(color: t.text2)),
          ]), style: TextStyle(fontSize: 14.5, color: t.text))),
      KV('Kategori', e.categoryName),
      KV('Tarih', shortDate(e.expenseDate)),
      KV('Açıklama', e.description),
      h4(context, 'Fişler'),
      if (e.receipts.isEmpty) emptyNote(context, 'Fiş eklenmemiş') else Wrap(spacing: 10, runSpacing: 10, children: [for (final f in e.receipts) ReceiptThumb(file: f)]),
      h4(context, 'Onay geçmişi'),
      if (e.submittedAt != null) TimelineRow(title: 'Onaya gönderildi', sub: timeAgo(e.submittedAt!), color: t.green),
      for (final a in e.approvals)
        TimelineRow(
          title: '${stepLabel[a.step] ?? a.step}: ${decisionDone[a.decision] ?? a.decision}',
          sub: '${a.approver?.fullName != null ? '${a.approver!.fullName} · ' : ''}${timeAgo(a.at)}',
          note: a.comment,
          color: _dot(t, a.decision),
        ),
      for (final k in e.openTasks) TimelineRow(title: '${k.name} bekleniyor', sub: k.candidateLabel ?? k.assignee?.fullName ?? '', color: t.orange),
      if (e.submittedAt == null && e.approvals.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text('Henüz onaya gönderilmedi', style: TextStyle(color: t.text2))),
    ]);
  }
}
