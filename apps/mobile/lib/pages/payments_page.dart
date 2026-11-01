// Web pages/PaymentsPage.tsx: çek, kredi kartı, kredi taksiti, vergi ve SGK ödemeleri.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/expenses.dart';
import '../models/payments.dart';
import '../widgets/glass.dart';
import 'expenses/ui.dart';
import 'payments/assign_form.dart';
import 'payments/payment_drawer.dart';
import 'payments/payment_form.dart';

const _views = [('open', 'Takipte'), ('awaiting', 'Görevlendirme bekleyen'), ('paid', 'Ödenen'), ('cancelled', 'İptal'), ('all', 'Tümü')];

List<T> _list<T>(dynamic j, T Function(Map<String, dynamic>) f) => (j as List).map((e) => f(Map<String, dynamic>.from(e))).toList();

class PaymentsPage extends StatefulWidget {
  const PaymentsPage({super.key});
  @override
  State<PaymentsPage> createState() => _PaymentsPageState();
}

class _PaymentsPageState extends State<PaymentsPage> {
  String view = 'open', type = '', dept = '', q = '';
  Timer? _deb;
  late final ApiData<List<Payment>> rows;
  late final ApiData<PaymentSummary> summary;
  late final ApiData<int> lead;
  late final ApiData<List<UserRef>> users;
  late final ApiData<List<Department>> depts;

  String get _path {
    final p = {'status': view, if (type.isNotEmpty) 'type': type, if (dept.isNotEmpty) 'departmentId': dept, if (q.isNotEmpty) 'q': q};
    return '/payments?${Uri(queryParameters: p).query}';
  }

  @override
  void initState() {
    super.initState();
    rows = ApiData(_path, decode: (j) => _list(j, Payment.fromJson));
    summary = ApiData('/payments/summary', decode: (j) => PaymentSummary.fromJson(Map<String, dynamic>.from(j)));
    lead = ApiData('/payments/settings', decode: (j) => (j['defaultLeadDays'] as num?)?.toInt() ?? 7);
    users = ApiData('/users/directory', decode: (j) => _list(j, UserRef.fromJson));
    depts = ApiData('/departments', decode: (j) => _list(j, Department.fromJson));
  }

  @override
  void dispose() {
    _deb?.cancel();
    for (final d in [rows, summary, lead, users, depts]) { d.dispose(); }
    super.dispose();
  }

  void _refresh() { rows.reload(); summary.reload(); }
  void _reQuery() => rows.setPath(_path);

  List<Department> _formDepts() {
    final me = context.read<AuthController>().me!;
    final all = me.permissions['payment.manage'] == 'all';
    return (depts.data ?? []).where((d) => all || d.id == me.department?['id'] || d.manager?.id == me.id).toList();
  }

  Future<void> _create() async {
    final p = await showPaymentForm(context, departments: _formDepts(), defaultLeadDays: lead.data ?? 7);
    if (p != null) { _refresh(); _open(p.id); }
  }

  void _open(int id) {
    final fd = _formDepts();
    showPaymentDrawer(context, id: id, users: users.data ?? [], departments: fd.isNotEmpty ? fd : depts.data ?? [], defaultLeadDays: lead.data ?? 7, onChanged: _refresh);
  }

  Future<void> _assign(Payment p) async {
    if (await showAssignForm(context, p, users.data ?? []) == true) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.read<AuthController>();
    return ListenableBuilder(
      listenable: Listenable.merge([rows, summary, lead, users, depts]),
      builder: (c, _) {
        final s = summary.data;
        final canCreate = auth.can('payment.manage') && _formDepts().isNotEmpty && lead.data != null;
        final totals = s?.totals30 ?? [];
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          PageHead(
            title: 'Ödemeler',
            sub: 'Çek, kredi kartı, kredi taksiti, vergi ve SGK ödemeleri · vadeden ${lead.data ?? 7} gün önce birim yöneticisine görev düşer',
            actions: [if (canCreate) PillButton(label: 'Ödeme', icon: LucideIcons.plus, primary: true, onPressed: _create)],
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async { await Future.wait([rows.reload(), summary.reload()]); },
              child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                statGrid([
                  StatTile(label: 'Görevlendirme bekleyen', onTap: () { setState(() => view = 'awaiting'); _reQuery(); }, child: statNumber(c, s?.awaiting, color: (s?.awaiting ?? 0) > 0 ? t.orange : null)),
                  StatTile(label: '7 gün içinde', child: statNumber(c, s?.in7, color: (s?.in7 ?? 0) > 0 ? t.danger : null)),
                  StatTile(
                    label: '30 gün içinde · ${s?.in30 ?? 0} ödeme',
                    child: totals.isEmpty ? statNumber(c, null) : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final x in totals) Text(fmtMoneyNum(x.amount, x.currency), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text))]),
                  ),
                  StatTile(label: 'Vadesi geçen', child: statNumber(c, s?.overdue, color: (s?.overdue ?? 0) > 0 ? t.danger : null)),
                ]),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Seg<String>(
                    items: [for (final (id, l) in _views) (id, id == 'awaiting' && (s?.awaiting ?? 0) > 0 ? '$l (${s!.awaiting})' : l)],
                    value: view,
                    onChanged: (v) { setState(() => view = v); _reQuery(); },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(children: [
                    SearchF(hint: 'Başlık, banka/firma veya belge no ara…', onChanged: (v) {
                      _deb?.cancel();
                      _deb = Timer(const Duration(milliseconds: 300), () { q = v.trim(); _reQuery(); });
                    }),
                    gap(10),
                    Row(children: [
                      Expanded(child: DropF<String>(label: 'Tür', value: type, items: [('', 'Tüm türler'), for (final e in paymentTypeLabel.entries) (e.key, e.value)], onChanged: (v) { setState(() => type = v ?? ''); _reQuery(); })),
                      const SizedBox(width: 10),
                      Expanded(child: DropF<String>(label: 'Birim', value: dept, items: [('', 'Tüm birimler'), for (final d in depts.data ?? <Department>[]) ('${d.id}', d.name)], onChanged: (v) { setState(() => dept = v ?? ''); _reQuery(); })),
                    ]),
                  ]),
                ),
                gap(10),
                if (rows.error.isNotEmpty && rows.data == null) Padding(padding: const EdgeInsets.all(16), child: errorNote(c, rows.error)),
                if (rows.data == null && rows.error.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
                if (rows.data != null && rows.data!.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text(view == 'awaiting' ? 'Görevlendirme bekleyen ödeme yok' : 'Kayıt yok', style: TextStyle(color: t.text3)))),
                for (final p in rows.data ?? <Payment>[]) _card(c, p),
              ]),
            ),
          ),
        ]);
      },
    );
  }

  Widget _card(BuildContext c, Payment p) {
    final t = c.tk;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Glass(
        radius: 18,
        onTap: () => _open(p.id),
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(p.title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text))),
            const SizedBox(width: 10),
            Text(fmtMoney(p.amount, p.currency), style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text)),
          ]),
          const SizedBox(height: 6),
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
            Chip2(paymentTypeLabel[p.type] ?? p.type),
            if (p.counterparty != null || p.docNo != null) Text('${p.counterparty ?? ''}${p.docNo != null ? ' · ${p.docNo}' : ''}', style: TextStyle(fontSize: 13, color: t.text2)),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            if (p.isOpen) DaysLeft(days: p.daysLeft) else Chip2(p.status == 'paid' ? 'Ödendi' : 'İptal'),
            const SizedBox(width: 8),
            Expanded(child: Text('Vade ${fmtDay(p.dueDate)} · ${p.department.name}', style: TextStyle(fontSize: 13, color: t.text2))),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            statusChip(c, p.status, paymentStatusLabel[p.status] ?? p.status),
            if (p.status == 'planned') Padding(padding: const EdgeInsets.only(left: 8), child: Text('Görev ${fmtDay(p.taskDate)}', style: TextStyle(fontSize: 12.5, color: t.text3))),
            const Spacer(),
            if (p.canAssign && p.status == 'awaiting')
              PillButton(label: 'Görevlendir', icon: LucideIcons.userPlus, primary: true, onPressed: () => _assign(p))
            else if (p.assignee != null)
              Flexible(child: Text(p.assignee!.fullName, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: t.text2))),
          ]),
        ]),
      ),
    );
  }
}
