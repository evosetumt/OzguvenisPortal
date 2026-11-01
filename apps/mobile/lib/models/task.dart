import 'dart:ui';

/// Web lib/types.ts karşılığı: görev modelleri. JSON alan adları aynen korunur.
const priorityLabel = {'low': 'Düşük', 'normal': 'Normal', 'high': 'Yüksek', 'urgent': 'Acil'};
const taskTypeLabel = {'general': 'Genel', 'erp_order': 'Sipariş girişi', 'erp_quote': 'Teklif verme'};
const priorityRank = {'urgent': 0, 'high': 1, 'normal': 2, 'low': 3};

int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
int? _in(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
List<T> _list<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    [for (final e in (v as List?) ?? const []) f(Map<String, dynamic>.from(e as Map))];

/// "#3b82f6" → Color (geçersizse mavi).
Color hexColor(String? s, [Color fallback = const Color(0xFF3B82F6)]) {
  var h = (s ?? '').replaceFirst('#', '');
  if (h.length == 3) h = h.split('').map((c) => c + c).join();
  final v = h.length == 6 ? int.tryParse(h, radix: 16) : null;
  return v == null ? fallback : Color(0xFF000000 | v);
}

class UserRef {
  final int id;
  final String fullName;
  final String? avatarUrl;
  final int? departmentId;
  UserRef({required this.id, required this.fullName, this.avatarUrl, this.departmentId});
  factory UserRef.fromJson(Map<String, dynamic> j) =>
      UserRef(id: _i(j['id']), fullName: j['fullName'] ?? '', avatarUrl: j['avatarUrl'], departmentId: _in(j['departmentId']));
}

class Project {
  final int id;
  final String name, color;
  final bool pinned;
  final int? ownerId;
  final int openTasks;
  Project({required this.id, required this.name, required this.color, this.pinned = false, this.ownerId, this.openTasks = 0});
  factory Project.fromJson(Map<String, dynamic> j) => Project(
      id: _i(j['id']), name: j['name'] ?? '', color: j['color'] ?? '#3b82f6', pinned: j['pinned'] == true,
      ownerId: _in(j['ownerId']), openTasks: _i(j['openTasks']));
}

class TaskStatus {
  final int id;
  final String name;
  final int sortOrder;
  final bool isDone;
  TaskStatus({required this.id, required this.name, this.sortOrder = 0, this.isDone = false});
  factory TaskStatus.fromJson(Map<String, dynamic> j) =>
      TaskStatus(id: _i(j['id']), name: j['name'] ?? '', sortOrder: _i(j['sortOrder']), isDone: j['isDone'] == true);
}

class TaskProject {
  final int id;
  final String name, color;
  TaskProject(this.id, this.name, this.color);
}

class StatusRef {
  final int id;
  final String name;
  final bool isDone;
  StatusRef(this.id, this.name, this.isDone);
}

class Task {
  final int id;
  final String title;
  final String? description;
  final String priority;
  final int? projectId, assigneeId;
  final int statusId, createdById, sortOrder;
  final String? dueDate, customerRef, erpDocNo, completedAt;
  final String taskType;
  final TaskProject? project;
  final StatusRef status;
  final UserRef? assignee;
  final int subtaskTotal, subtaskDone, commentCount;

  Task({
    required this.id, required this.title, this.description, required this.priority, this.projectId, required this.statusId,
    this.assigneeId, this.createdById = 0, this.dueDate, this.sortOrder = 0, this.taskType = 'general', this.customerRef,
    this.erpDocNo, this.completedAt, this.project, required this.status, this.assignee,
    this.subtaskTotal = 0, this.subtaskDone = 0, this.commentCount = 0,
  });

  factory Task.fromJson(Map<String, dynamic> j) {
    final p = j['project'] as Map?;
    final s = (j['status'] as Map?) ?? const {};
    final a = j['assignee'] as Map?;
    return Task(
      id: _i(j['id']), title: j['title'] ?? '', description: j['description'], priority: j['priority'] ?? 'normal',
      projectId: _in(j['projectId']), statusId: _i(j['statusId']), assigneeId: _in(j['assigneeId']),
      createdById: _i(j['createdById']), dueDate: j['dueDate'], sortOrder: _i(j['sortOrder']),
      taskType: j['taskType'] ?? 'general', customerRef: j['customerRef'], erpDocNo: j['erpDocNo'], completedAt: j['completedAt'],
      project: p == null ? null : TaskProject(_i(p['id']), p['name'] ?? '', p['color'] ?? '#3b82f6'),
      status: StatusRef(_i(s['id']), s['name'] ?? '', s['isDone'] == true),
      assignee: a == null ? null : UserRef.fromJson(Map<String, dynamic>.from(a)),
      subtaskTotal: _i(j['subtaskTotal']), subtaskDone: _i(j['subtaskDone']), commentCount: _i(j['commentCount']),
    );
  }

  /// Yerelde durum/sıra değişimi (iyimser güncelleme).
  Task copyWith({int? statusId, StatusRef? status, int? sortOrder, String? completedAt, bool clearCompleted = false}) => Task(
        id: id, title: title, description: description, priority: priority, projectId: projectId, statusId: statusId ?? this.statusId,
        assigneeId: assigneeId, createdById: createdById, dueDate: dueDate, sortOrder: sortOrder ?? this.sortOrder, taskType: taskType,
        customerRef: customerRef, erpDocNo: erpDocNo, completedAt: clearCompleted ? null : (completedAt ?? this.completedAt),
        project: project, status: status ?? this.status, assignee: assignee,
        subtaskTotal: subtaskTotal, subtaskDone: subtaskDone, commentCount: commentCount,
      );
}

class Subtask {
  final int id;
  final String title;
  final bool done;
  Subtask(this.id, this.title, this.done);
  factory Subtask.fromJson(Map<String, dynamic> j) => Subtask(_i(j['id']), j['title'] ?? '', j['done'] == true);
}

class TaskComment {
  final int id;
  final String body, createdAt;
  final UserRef user;
  TaskComment({required this.id, required this.body, required this.createdAt, required this.user});
  factory TaskComment.fromJson(Map<String, dynamic> j) => TaskComment(
      id: _i(j['id']), body: j['body'] ?? '', createdAt: j['createdAt'] ?? '',
      user: UserRef.fromJson(Map<String, dynamic>.from((j['user'] as Map?) ?? const {})));
}

class TaskDetail {
  final int id;
  final String title;
  final String? description, dueDate, customerRef, erpDocNo;
  final String priority, taskType;
  final int? projectId, assigneeId;
  final int statusId;
  final TaskProject? project;
  final StatusRef status;
  final List<Subtask> subtasks;
  final List<TaskComment> comments;
  final UserRef createdBy;
  final bool canEdit;
  // Netsis otomatik kapanış alanları (API'de var, web'de de ayrı okunur)
  final bool completedViaErp;
  final String? relatedType, relatedId;

  TaskDetail({
    required this.id, required this.title, this.description, this.dueDate, this.customerRef, this.erpDocNo,
    required this.priority, required this.taskType, this.projectId, this.assigneeId, required this.statusId,
    this.project, required this.status, required this.subtasks, required this.comments, required this.createdBy,
    required this.canEdit, this.completedViaErp = false, this.relatedType, this.relatedId,
  });

  factory TaskDetail.fromJson(Map<String, dynamic> j) {
    final p = j['project'] as Map?;
    final s = (j['status'] as Map?) ?? const {};
    return TaskDetail(
      id: _i(j['id']), title: j['title'] ?? '', description: j['description'], dueDate: j['dueDate'],
      customerRef: j['customerRef'], erpDocNo: j['erpDocNo'], priority: j['priority'] ?? 'normal', taskType: j['taskType'] ?? 'general',
      projectId: _in(j['projectId']), assigneeId: _in(j['assigneeId']), statusId: _i(j['statusId']),
      project: p == null ? null : TaskProject(_i(p['id']), p['name'] ?? '', p['color'] ?? '#3b82f6'),
      status: StatusRef(_i(s['id']), s['name'] ?? '', s['isDone'] == true),
      subtasks: _list(j['subtasks'], Subtask.fromJson),
      comments: _list(j['comments'], TaskComment.fromJson),
      createdBy: UserRef.fromJson(Map<String, dynamic>.from((j['createdBy'] as Map?) ?? const {})),
      canEdit: j['canEdit'] == true,
      completedViaErp: j['completedViaErp'] == true,
      relatedType: j['relatedType'], relatedId: j['relatedId']?.toString(),
    );
  }
}

class TaskSummary {
  final int open, dueThisWeek, overdue, completedThisWeek;
  TaskSummary({this.open = 0, this.dueThisWeek = 0, this.overdue = 0, this.completedThisWeek = 0});
  factory TaskSummary.fromJson(Map<String, dynamic> j) => TaskSummary(
      open: _i(j['open']), dueThisWeek: _i(j['dueThisWeek']), overdue: _i(j['overdue']), completedThisWeek: _i(j['completedThisWeek']));
}

class NotificationItem {
  final int id;
  final String type, title, createdAt;
  final String? body, link, readAt;
  NotificationItem({required this.id, required this.type, required this.title, this.body, this.link, this.readAt, required this.createdAt});
  factory NotificationItem.fromJson(Map<String, dynamic> j) => NotificationItem(
      id: _i(j['id']), type: j['type'] ?? '', title: j['title'] ?? '', body: j['body'], link: j['link'],
      readAt: j['readAt'], createdAt: j['createdAt'] ?? '');
  NotificationItem read() => NotificationItem(id: id, type: type, title: title, body: body, link: link, readAt: DateTime.now().toUtc().toIso8601String(), createdAt: createdAt);
}

class CalendarItem {
  final String key, kind, title, start, end;
  final int id;
  final bool allDay;
  final String? color, location, link;
  final List<UserRef> attendees;
  CalendarItem({required this.key, required this.kind, required this.id, required this.title, required this.start, required this.end,
      this.allDay = false, this.color, this.location, this.link, this.attendees = const []});
  factory CalendarItem.fromJson(Map<String, dynamic> j) => CalendarItem(
      key: '${j['key']}', kind: j['kind'] ?? '', id: _i(j['id']), title: j['title'] ?? '', start: j['start'] ?? '', end: j['end'] ?? '',
      allDay: j['allDay'] == true, color: j['color'], location: j['location'], link: j['link'],
      attendees: _list(j['attendees'], UserRef.fromJson));
}

class CustomerLookup {
  final String code, name;
  final String? city;
  CustomerLookup(this.code, this.name, this.city);
  factory CustomerLookup.fromJson(Map<String, dynamic> j) => CustomerLookup(j['code'] ?? '', j['name'] ?? '', j['city']);
}
