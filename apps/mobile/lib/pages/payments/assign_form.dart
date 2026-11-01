// Web components/payments/AssignForm.tsx: birim yöneticisi ödemeyi bir kişiye görevlendirir.
import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../models/payments.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';

/// Görevlendirme yapıldıysa true döner.
Future<bool?> showAssignForm(BuildContext context, Payment p, List<UserRef> users) =>
    showGlassSheet<bool>(context, builder: (c) => _AssignForm(payment: p, users: users));

class _AssignForm extends StatefulWidget {
  const _AssignForm({required this.payment, required this.users});
  final Payment payment;
  final List<UserRef> users;
  @override
  State<_AssignForm> createState() => _AssignFormState();
}

class _AssignFormState extends State<_AssignForm> {
  late int? assigneeId = widget.payment.status == 'assigned' ? widget.payment.assignee?.id : null;
  String error = '';
  bool busy = false;

  Future<void> _submit() async {
    setState(() { busy = true; error = ''; });
    try {
      await Api.i.post('/payments/${widget.payment.id}/assign', {'assigneeId': assigneeId});
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Görevlendirilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final p = widget.payment;
    // Birim çalışanları listede önce gelir.
    final own = widget.users.where((u) => u.departmentId == p.departmentId).toList();
    final others = widget.users.where((u) => u.departmentId != p.departmentId).toList();
    final items = [for (final u in [...own, ...others]) (u.id, u.fullName)];
    return SheetFrame(
      title: 'Ödemeyi görevlendir',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text.rich(TextSpan(children: [
          TextSpan(text: p.title, style: const TextStyle(fontWeight: FontWeight.w700)),
          TextSpan(text: ' · ${fmtMoney(p.amount, p.currency)} · vade ${fmtDay(p.dueDate)}'),
        ]), style: TextStyle(color: t.text2)),
        gap(),
        DropF<int>(label: 'Görevli', value: assigneeId, items: items, onChanged: (v) => setState(() => assigneeId = v)),
        gap(8),
        Text('Seçilen kişiye görev atanır ve bildirim gider. Görev tamamlanınca ödeme “ödendi” olur.', style: TextStyle(fontSize: 13, color: t.text2)),
        if (error.isNotEmpty) errorNote(context, error),
        gap(16),
        Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          PillButton(label: busy ? 'Kaydediliyor…' : 'Görevlendir', primary: true, onPressed: busy || assigneeId == null ? null : _submit),
        ]),
      ]),
    );
  }
}
