// Web lib/types-workflow.ts (masraf bölümü) + lib/types.ts UserRef + lib/files.ts UploadedFile karşılığı.

num _n(dynamic v) => v is num ? v : (num.tryParse('${v ?? ''}') ?? 0);
int? _i(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    ((v as List?) ?? const []).map((e) => f(Map<String, dynamic>.from(e as Map))).toList();
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

class UserRef {
  final int id;
  final String fullName;
  final String? avatarUrl;
  final int? departmentId;
  UserRef({required this.id, required this.fullName, this.avatarUrl, this.departmentId});
  factory UserRef.fromJson(Map<String, dynamic> j) => UserRef(
      id: _i(j['id']) ?? 0, fullName: j['fullName'] ?? '', avatarUrl: j['avatarUrl'], departmentId: _i(j['departmentId']));
  static UserRef? opt(dynamic v) => _m(v) == null ? null : UserRef.fromJson(_m(v)!);
}

/// Web FileRef / UploadedFile.
class FileRef {
  final int id;
  final String fileName, mime;
  final int size;
  final String? createdAt;
  FileRef({required this.id, required this.fileName, required this.mime, required this.size, this.createdAt});
  factory FileRef.fromJson(Map<String, dynamic> j) => FileRef(
      id: _i(j['id']) ?? 0, fileName: j['fileName'] ?? '', mime: j['mime'] ?? '', size: _i(j['size']) ?? 0, createdAt: j['createdAt']);
}

const expenseStatusLabel = <String, String>{
  'draft': 'Taslak',
  'submitted': 'Yönetici onayında',
  'manager_approved': 'Muhasebe onayında',
  'accounting_approved': 'Ödeme bekliyor',
  'rejected': 'Reddedildi',
  'paid': 'Ödendi',
};
const stepLabel = <String, String>{'auto': 'Otomatik onay', 'manager': 'Yönetici', 'accounting': 'Muhasebe', 'payment': 'Ödeme'};
const decisionLabel = <String, String>{'approved': 'Onayla', 'rejected': 'Reddet', 'paid': 'Ödendi olarak işaretle'};
const decisionDone = <String, String>{'approved': 'Onaylandı', 'rejected': 'Reddedildi', 'paid': 'Ödendi'};

class ExpenseCategory {
  final int id;
  final String name;
  ExpenseCategory({required this.id, required this.name});
  factory ExpenseCategory.fromJson(Map<String, dynamic> j) => ExpenseCategory(id: _i(j['id']) ?? 0, name: j['name'] ?? '');
}

class Expense {
  final int id, categoryId;
  final num amount, amountTry;
  final String currency, expenseDate, description, status, createdAt;
  final String? submittedAt;
  final int? processInstanceId;
  final UserRef user;
  final String categoryName;
  final int receiptCount;
  Expense({
    required this.id, required this.categoryId, required this.amount, required this.amountTry, required this.currency,
    required this.expenseDate, required this.description, required this.status, required this.createdAt, this.submittedAt,
    this.processInstanceId, required this.user, required this.categoryName, required this.receiptCount,
  });
  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: _i(j['id']) ?? 0,
        categoryId: _i(j['categoryId']) ?? 0,
        amount: _n(j['amount']),
        amountTry: _n(j['amountTry']),
        currency: j['currency'] ?? 'TRY',
        expenseDate: j['expenseDate'] ?? '',
        description: j['description'] ?? '',
        status: j['status'] ?? 'draft',
        createdAt: j['createdAt'] ?? '',
        submittedAt: j['submittedAt'],
        processInstanceId: _i(j['processInstanceId']),
        user: UserRef.opt(j['user']) ?? UserRef(id: 0, fullName: ''),
        categoryName: _m(j['category'])?['name'] ?? '',
        receiptCount: _i(_m(j['_count'])?['receipts']) ?? 0,
      );
}

class ExpenseApproval {
  final int id;
  final String step, decision, at;
  final String? comment;
  final UserRef? approver;
  ExpenseApproval({required this.id, required this.step, required this.decision, required this.at, this.comment, this.approver});
  factory ExpenseApproval.fromJson(Map<String, dynamic> j) => ExpenseApproval(
      id: _i(j['id']) ?? 0, step: j['step'] ?? '', decision: j['decision'] ?? '', at: j['at'] ?? '', comment: j['comment'], approver: UserRef.opt(j['approver']));
}

class OpenTask {
  final int id;
  final String name;
  final String? dueAt, candidateRole, candidateLabel;
  final UserRef? assignee;
  OpenTask({required this.id, required this.name, this.dueAt, this.candidateRole, this.candidateLabel, this.assignee});
  factory OpenTask.fromJson(Map<String, dynamic> j) => OpenTask(
      id: _i(j['id']) ?? 0, name: j['name'] ?? '', dueAt: j['dueAt'], candidateRole: j['candidateRole'], candidateLabel: j['candidateLabel'], assignee: UserRef.opt(j['assignee']));
}

class ExpenseDetail extends Expense {
  final List<FileRef> receipts;
  final List<ExpenseApproval> approvals;
  final List<OpenTask> openTasks;
  final bool canEdit;
  ExpenseDetail({
    required super.id, required super.categoryId, required super.amount, required super.amountTry, required super.currency,
    required super.expenseDate, required super.description, required super.status, required super.createdAt, super.submittedAt,
    super.processInstanceId, required super.user, required super.categoryName, required super.receiptCount,
    required this.receipts, required this.approvals, required this.openTasks, required this.canEdit,
  });
  factory ExpenseDetail.fromJson(Map<String, dynamic> j) {
    final e = Expense.fromJson(j);
    return ExpenseDetail(
      id: e.id, categoryId: e.categoryId, amount: e.amount, amountTry: e.amountTry, currency: e.currency, expenseDate: e.expenseDate,
      description: e.description, status: e.status, createdAt: e.createdAt, submittedAt: e.submittedAt, processInstanceId: e.processInstanceId,
      user: e.user, categoryName: e.categoryName, receiptCount: e.receiptCount,
      receipts: _l(j['receipts'], FileRef.fromJson),
      approvals: _l(j['approvals'], ExpenseApproval.fromJson),
      openTasks: _l(j['openTasks'], OpenTask.fromJson),
      canEdit: j['canEdit'] == true,
    );
  }
}

class ExpenseSettingsData {
  final num autoApproveLimit;
  final bool aiCategorySuggest, aiAvailable;
  ExpenseSettingsData({required this.autoApproveLimit, required this.aiCategorySuggest, required this.aiAvailable});
  factory ExpenseSettingsData.fromJson(Map<String, dynamic> j) => ExpenseSettingsData(
      autoApproveLimit: _n(j['autoApproveLimit']), aiCategorySuggest: j['aiCategorySuggest'] == true, aiAvailable: j['aiAvailable'] == true);
}

class CategorySuggestion {
  final bool enabled;
  final int? categoryId;
  final String? categoryName;
  CategorySuggestion({required this.enabled, this.categoryId, this.categoryName});
  factory CategorySuggestion.fromJson(Map<String, dynamic> j) =>
      CategorySuggestion(enabled: j['enabled'] == true, categoryId: _i(j['categoryId']), categoryName: j['categoryName']);
}
