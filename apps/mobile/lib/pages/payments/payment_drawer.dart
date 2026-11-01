// Web components/payments/PaymentDrawer.tsx: ödeme ayrıntısı (alt sayfa).
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../models/payments.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';
import 'assign_form.dart';
import 'payment_form.dart';

Future<void> showPaymentDrawer(
  BuildContext context, {
  required int id,
  required List<UserRef> users,
  required List<Department> departments,
  required int defaultLeadDays,
  required VoidCallback onChanged,
}) =>
    showGlassSheet<void>(context, builder: (c) => _PaymentDrawer(id: id, users: users, departments: departments, defaultLeadDays: defaultLeadDays, onChanged: onChanged));

class _PaymentDrawer extends StatefulWidget {
  const _PaymentDrawer({required this.id, required this.users, required this.departments, required this.defaultLeadDays, required this.onChanged});
  final int id, defaultLeadDays;
  final List<UserRef> users;
  final List<Department> departments;
  final VoidCallback onChanged;
  @override
  State<_PaymentDrawer> createState() => _PaymentDrawerState();
}

class _PaymentDrawerState extends State<_PaymentDrawer> {
  String err = '';

  Future<void> _run(Future<dynamic> Function() fn, Future<void> Function() reload) async {
    setState(() => err = '');
    try {
      await fn();
      await reload();
      widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => err = errMsg(e, 'İşlem yapılamadı'));
    }
  }

  Future<void> _remove() async {
    if (!await confirmDialog(context, 'Ödeme kaydı silinsin mi?')) return;
    try {
      await Api.i.delete('/payments/${widget.id}');
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => err = errMsg(e, 'Silinemedi'));
    }
  }

  Future<void> _edit(Payment p, Future<void> Function() reload) async {
    final r = await showPaymentForm(context, payment: p, departments: widget.departments, defaultLeadDays: widget.defaultLeadDays);
    if (r != null) { await reload(); widget.onChanged(); }
  }

  Future<void> _assign(Payment p, Future<void> Function() reload) async {
    if (await showAssignForm(context, p, widget.users) == true) { await reload(); widget.onChanged(); }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return ApiView<Payment>(
      path: '/payments/${widget.id}',
      decode: (j) => Payment.fromJson(Map<String, dynamic>.from(j)),
      builder: (c, p, reload) {
        final open = p.isOpen;
        return SheetFrame(
          title: p.title,
          leading: '#${p.id} · ${paymentTypeLabel[p.type]}',
          actions: [
            if (p.canEdit && open) IconButton(tooltip: 'Düzenle', icon: const Icon(LucideIcons.pencil, size: 18), onPressed: () => _edit(p, reload)),
            if (p.canEdit) IconButton(tooltip: 'Sil', icon: const Icon(LucideIcons.trash2, size: 18), onPressed: _remove),
          ],
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(fmtMoney(p.amount, p.currency), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -.5, color: t.text)),
            gap(8),
            Wrap(spacing: 8, children: [if (open) DaysLeft(days: p.daysLeft), statusChip(c, p.status, paymentStatusLabel[p.status] ?? p.status)]),
            if (err.isNotEmpty) errorNote(c, err),
            if (p.status == 'awaiting' && p.canAssign)
              Container(
                margin: const EdgeInsets.only(top: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: t.prioHighBg, borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Görevlendirme bekliyor', style: TextStyle(fontWeight: FontWeight.w700, color: t.prioHigh)),
                  Text('Bu ödemenin görevi size düştü. Ödemeyi yapacak kişiyi seçin.', style: TextStyle(color: t.prioHigh, fontSize: 13.5)),
                ]),
              ),
            gap(8),
            KV('Vade', fmtDay(p.dueDate)),
            KV('Banka / firma', p.counterparty),
            KV('Belge no', p.docNo),
            KV('Birim', null,
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: p.department.name),
                  if (p.department.manager != null) TextSpan(text: ' · yönetici ${p.department.manager!.fullName}', style: TextStyle(color: t.text2, fontWeight: FontWeight.w400)),
                ]), style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: t.text))),
            KV('Görev açılışı', '${p.effectiveLeadDays} gün önce (${fmtDay(p.taskDate)})${p.leadDays == null ? ' · varsayılan' : ''}'),
            KV('Tekrar', recurrenceLabel[p.recurrence]),
            KV('Görevli', p.assignee?.fullName),
            if (p.taskId != null) KV('Görev', '#${p.taskId} · ${p.taskStatusName ?? ''}'),
            if ((p.notes ?? '').isNotEmpty) ...[h4(c, 'Notlar'), Text(p.notes!, style: TextStyle(color: t.text))],
            gap(14),
            Wrap(spacing: 10, runSpacing: 10, children: [
              if (p.canAssign) PillButton(label: p.taskId != null ? 'Görevi devret' : 'Şimdi görevlendir', icon: LucideIcons.userPlus, primary: true, onPressed: () => _assign(p, reload)),
              if (p.canPay)
                PillButton(
                  label: 'Ödendi', icon: LucideIcons.circleCheck,
                  onPressed: () async {
                    if (await confirmDialog(c, 'Ödeme yapıldı olarak işaretlensin mi? Görevi de kapanır.')) await _run(() => Api.i.post('/payments/${widget.id}/pay'), reload);
                  },
                ),
              if (p.canEdit && open)
                PillButton(
                  label: 'İptal et', icon: LucideIcons.ban,
                  onPressed: () async {
                    if (await confirmDialog(c, 'Ödeme iptal edilsin mi? Açık görevi kaldırılır.')) await _run(() => Api.i.post('/payments/${widget.id}/cancel'), reload);
                  },
                ),
            ]),
            h4(c, 'Geçmiş'),
            TimelineRow(title: 'Kaydedildi · ${p.createdBy.fullName}', sub: timeAgo(p.createdAt)),
            if (p.taskOpenedAt != null)
              TimelineRow(title: 'Görev açıldı${p.department.manager != null ? ' · ${p.department.manager!.fullName}' : ''}', sub: timeAgo(p.taskOpenedAt!))
            else if (open)
              TimelineRow(title: 'Görev açılacak', sub: fmtDay(p.taskDate)),
            if (p.status != 'awaiting' && p.assignee != null && p.taskOpenedAt != null) TimelineRow(title: 'Görevli: ${p.assignee!.fullName}'),
            if (p.paidAt != null) TimelineRow(title: 'Ödendi${p.paidBy != null ? ' · ${p.paidBy!.fullName}' : ''}', sub: timeAgo(p.paidAt!), color: t.green),
          ]),
        );
      },
    );
  }
}
