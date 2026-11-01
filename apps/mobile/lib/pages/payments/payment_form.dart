// Web components/payments/PaymentForm.tsx: ödeme ekleme / düzenleme.
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/theme.dart';
import '../../models/payments.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';

const _placeholder = {
  'cheque': 'örn. ABC Ltd. verilen çek', 'credit_card': 'örn. Şirket kartı ekstresi', 'loan': 'örn. İşletme kredisi taksiti',
  'tax': 'örn. KDV beyannamesi', 'sgk': 'örn. SGK primi', 'rent': 'örn. Depo kirası', 'invoice': 'örn. Elektrik faturası', 'other': 'Ödeme adı',
};
const _docLabel = {'cheque': 'Çek no', 'credit_card': 'Kart son 4 hane', 'loan': 'Kredi / sözleşme no'};

/// Kaydedilen ödemeyi döndürür (vazgeçildiyse null).
Future<Payment?> showPaymentForm(BuildContext context, {Payment? payment, required List<Department> departments, required int defaultLeadDays}) =>
    showGlassSheet<Payment>(context, full: true, builder: (c) => PaymentForm(payment: payment, departments: departments, defaultLeadDays: defaultLeadDays));

class PaymentForm extends StatefulWidget {
  const PaymentForm({super.key, this.payment, required this.departments, required this.defaultLeadDays});
  final Payment? payment;
  final List<Department> departments;
  final int defaultLeadDays;
  @override
  State<PaymentForm> createState() => _PaymentFormState();
}

class _PaymentFormState extends State<PaymentForm> {
  late String type, currency, dueDate, recurrence;
  late int? departmentId;
  late final TextEditingController title, counterparty, docNo, amount, leadDays, notes;
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final p = widget.payment;
    final me = context.read<AuthController>().me!;
    type = p?.type ?? 'cheque';
    currency = p?.currency ?? 'TRY';
    dueDate = p != null ? dateKey(p.dueDate) : '';
    recurrence = p?.recurrence ?? 'none';
    final myDept = me.department?['id'] as int?;
    departmentId = p?.departmentId ?? (widget.departments.any((d) => d.id == myDept) ? myDept : widget.departments.firstOrNull?.id);
    title = TextEditingController(text: p?.title ?? '');
    counterparty = TextEditingController(text: p?.counterparty ?? '');
    docNo = TextEditingController(text: p?.docNo ?? '');
    amount = TextEditingController(text: p?.amount ?? '');
    leadDays = TextEditingController(text: p?.leadDays == null ? '' : '${p!.leadDays}');
    notes = TextEditingController(text: p?.notes ?? '');
  }

  @override
  void dispose() {
    for (final c in [title, counterparty, docNo, amount, leadDays, notes]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _submit() async {
    final a = num.tryParse(amount.text.trim().replaceAll(',', '.'));
    if (title.text.trim().isEmpty) return setState(() => error = 'Başlık yazın');
    if (a == null || a < 0) return setState(() => error = 'Geçerli bir tutar girin');
    if (dueDate.isEmpty) return setState(() => error = 'Vade seçin');
    if (departmentId == null) return setState(() => error = 'Sorumlu birim seçin');
    setState(() { busy = true; error = ''; });
    final body = {
      'type': type, 'title': title.text, 'counterparty': counterparty.text.isEmpty ? null : counterparty.text, 'docNo': docNo.text.isEmpty ? null : docNo.text,
      'amount': a, 'currency': currency, 'dueDate': dueDate, 'departmentId': departmentId,
      'leadDays': leadDays.text.trim().isEmpty ? null : int.tryParse(leadDays.text.trim()), 'recurrence': recurrence, 'notes': notes.text.isEmpty ? null : notes.text,
    };
    try {
      final p = widget.payment;
      final r = p != null ? await Api.i.patch('/payments/${p.id}', body) : await Api.i.post('/payments', body);
      if (mounted) Navigator.pop(context, Payment.fromJson(Map<String, dynamic>.from(r as Map)));
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Kaydedilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final dept = widget.departments.where((d) => d.id == departmentId).firstOrNull;
    final lead = leadDays.text.trim().isEmpty ? widget.defaultLeadDays : (int.tryParse(leadDays.text.trim()) ?? widget.defaultLeadDays);
    final due = DateTime.tryParse(dueDate);
    final taskDay = due?.subtract(Duration(days: lead));
    final bold = const TextStyle(fontWeight: FontWeight.w700);
    return SheetFrame(
      title: widget.payment != null ? 'Ödemeyi düzenle' : 'Yeni ödeme',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        DropF<String>(label: 'Tür', value: type, items: [for (final e in paymentTypeLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => type = v ?? type)),
        gap(),
        TextF('Başlık', title, maxLength: 200, hint: _placeholder[type]),
        gap(),
        TextF('Banka / firma', counterparty, maxLength: 200, hint: 'Ödemenin yapılacağı yer'),
        gap(),
        TextF(_docLabel[type] ?? 'Belge no', docNo, maxLength: 60),
        gap(),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 3, child: TextF('Tutar', amount, decimal: true)),
          const SizedBox(width: 10),
          Expanded(flex: 2, child: DropF<String>(label: 'Para birimi', value: currency, items: [for (final c in const ['TRY', 'USD', 'EUR']) (c, c)], onChanged: (v) => setState(() => currency = v ?? 'TRY'))),
        ]),
        gap(),
        DateF(label: 'Vade', value: dueDate, onChanged: (v) => setState(() => dueDate = v)),
        gap(),
        DropF<int>(label: 'Sorumlu birim', value: departmentId, items: [for (final d in widget.departments) (d.id, d.name)], onChanged: (v) => setState(() => departmentId = v)),
        gap(),
        Focus(onFocusChange: (_) => setState(() {}), child: TextF('Kaç gün önce görev açılsın', leadDays, number: true, hint: 'Varsayılan: ${widget.defaultLeadDays}')),
        gap(),
        DropF<String>(label: 'Tekrar', value: recurrence, items: [for (final e in recurrenceLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => recurrence = v ?? 'none')),
        gap(10),
        Text.rich(TextSpan(children: [
          if (taskDay != null) ...[const TextSpan(text: 'Görev '), TextSpan(text: DateFormat('d MMMM', 'tr_TR').format(taskDay), style: bold), const TextSpan(text: ' günü ')] else TextSpan(text: 'Görev vadeden $lead gün önce '),
          if (dept?.manager != null) ...[TextSpan(text: dept!.manager!.fullName, style: bold), TextSpan(text: ' (${dept.name} yöneticisi) ekranına düşer; o da istediği kişiye görevlendirir.')]
          else const TextSpan(text: 'açılır. Bu birimin yöneticisi tanımlı değil; görev ödeme yetkililerine bildirilir.'),
          if (recurrence != 'none') const TextSpan(text: ' Ödendiğinde bir sonraki vade kendiliğinden planlanır.'),
        ]), style: TextStyle(fontSize: 13, color: t.text2)),
        gap(),
        TextF('Notlar', notes, lines: 3, maxLength: 2000),
        if (error.isNotEmpty) errorNote(context, error),
        gap(16),
        Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          PillButton(label: busy ? 'Kaydediliyor…' : 'Kaydet', primary: true, onPressed: busy ? null : _submit),
        ]),
      ]),
    );
  }
}
