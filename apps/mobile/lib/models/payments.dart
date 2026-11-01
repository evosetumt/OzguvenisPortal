// Web lib/types-payments.ts karşılığı.
import 'expenses.dart';

int? _i(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

const paymentTypeLabel = <String, String>{
  'cheque': 'Çek', 'credit_card': 'Kredi kartı', 'loan': 'Kredi taksiti', 'tax': 'Vergi', 'sgk': 'SGK', 'rent': 'Kira', 'invoice': 'Fatura', 'other': 'Diğer',
};
const paymentStatusLabel = <String, String>{
  'planned': 'Planlandı', 'awaiting': 'Görevlendirme bekliyor', 'assigned': 'Görevlendirildi', 'paid': 'Ödendi', 'cancelled': 'İptal',
};
const recurrenceLabel = <String, String>{'none': 'Tek sefer', 'monthly': 'Her ay', 'quarterly': '3 ayda bir', 'yearly': 'Her yıl'};

class Department {
  final int id;
  final String name;
  final UserRef? manager;
  Department({required this.id, required this.name, this.manager});
  factory Department.fromJson(Map<String, dynamic> j) => Department(id: _i(j['id']) ?? 0, name: j['name'] ?? '', manager: UserRef.opt(j['manager']));
}

class Payment {
  final int id, departmentId, effectiveLeadDays, daysLeft;
  final int? leadDays;
  final String type, title, amount, currency, dueDate, taskDate, recurrence, status, createdAt;
  final String? counterparty, docNo, taskOpenedAt, paidAt, notes;
  final Department department;
  final int? taskId;
  final String? taskStatusName;
  final UserRef? assignee, paidBy;
  final UserRef createdBy;
  final bool canAssign, canEdit, canPay;
  Payment({
    required this.id, required this.departmentId, required this.effectiveLeadDays, required this.daysLeft, this.leadDays, required this.type,
    required this.title, required this.amount, required this.currency, required this.dueDate, required this.taskDate, required this.recurrence,
    required this.status, required this.createdAt, this.counterparty, this.docNo, this.taskOpenedAt, this.paidAt, this.notes,
    required this.department, this.taskId, this.taskStatusName, this.assignee, this.paidBy, required this.createdBy,
    required this.canAssign, required this.canEdit, required this.canPay,
  });
  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: _i(j['id']) ?? 0,
        departmentId: _i(j['departmentId']) ?? 0,
        effectiveLeadDays: _i(j['effectiveLeadDays']) ?? 0,
        daysLeft: _i(j['daysLeft']) ?? 0,
        leadDays: _i(j['leadDays']),
        type: j['type'] ?? 'other',
        title: j['title'] ?? '',
        amount: '${j['amount'] ?? '0'}',
        currency: j['currency'] ?? 'TRY',
        dueDate: j['dueDate'] ?? '',
        taskDate: j['taskDate'] ?? '',
        recurrence: j['recurrence'] ?? 'none',
        status: j['status'] ?? 'planned',
        createdAt: j['createdAt'] ?? '',
        counterparty: j['counterparty'],
        docNo: j['docNo'],
        taskOpenedAt: j['taskOpenedAt'],
        paidAt: j['paidAt'],
        notes: j['notes'],
        department: Department.fromJson(_m(j['department']) ?? {}),
        taskId: _i(_m(j['task'])?['id']),
        taskStatusName: _m(_m(j['task'])?['status'])?['name'],
        assignee: UserRef.opt(j['assignee']),
        paidBy: UserRef.opt(j['paidBy']),
        createdBy: UserRef.opt(j['createdBy']) ?? UserRef(id: 0, fullName: ''),
        canAssign: j['canAssign'] == true,
        canEdit: j['canEdit'] == true,
        canPay: j['canPay'] == true,
      );
  bool get isOpen => const ['planned', 'awaiting', 'assigned'].contains(status);
}

class PaymentSummary {
  final int awaiting, in7, in30, overdue;
  final List<({String currency, num amount})> totals30;
  PaymentSummary({required this.awaiting, required this.in7, required this.in30, required this.overdue, required this.totals30});
  factory PaymentSummary.fromJson(Map<String, dynamic> j) => PaymentSummary(
        awaiting: _i(j['awaiting']) ?? 0,
        in7: _i(j['in7']) ?? 0,
        in30: _i(j['in30']) ?? 0,
        overdue: _i(j['overdue']) ?? 0,
        totals30: ((j['totals30'] as List?) ?? const [])
            .map((e) => (currency: '${(e as Map)['currency']}', amount: (e['amount'] is num ? e['amount'] as num : num.tryParse('${e['amount']}') ?? 0)))
            .toList(),
      );
}
