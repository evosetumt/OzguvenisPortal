// Web lib/types-workflow.ts (süreç / iş akışı bölümü) karşılığı.
import 'expenses.dart';

int? _i(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    ((v as List?) ?? const []).map((e) => f(Map<String, dynamic>.from(e as Map))).toList();
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

const defStatusLabel = <String, String>{'draft': 'Taslak', 'active': 'Etkin', 'archived': 'Arşiv'};
const instanceStatusLabel = <String, String>{'running': 'Sürüyor', 'completed': 'Tamamlandı', 'failed': 'Hata', 'cancelled': 'İptal'};
const eventLabel = <String, String>{
  'started': 'Başladı', 'entered': 'Adıma girildi', 'completed': 'Adım tamamlandı', 'task_created': 'Görev oluşturuldu',
  'task_completed': 'Görev tamamlandı', 'error': 'Hata', 'ended': 'Bitti', 'cancelled': 'İptal edildi',
};

class ProcessTaskItem {
  final int id;
  final String name, elementId, status, createdAt;
  final String? dueAt, completedAt, candidateRole, candidateLabel;
  final UserRef? assignee, completedBy;
  final String? decision, comment;
  final List<String> decisions;
  final bool overdue;
  // instance
  final int instanceId;
  final String? businessKey, entityType, entityId;
  final String startedAt;
  final UserRef? startedBy;
  final String definitionName;
  ProcessTaskItem({
    required this.id, required this.name, required this.elementId, required this.status, required this.createdAt, this.dueAt,
    this.completedAt, this.candidateRole, this.candidateLabel, this.assignee, this.completedBy, this.decision, this.comment,
    required this.decisions, required this.overdue, required this.instanceId, this.businessKey, this.entityType, this.entityId,
    required this.startedAt, this.startedBy, required this.definitionName,
  });
  factory ProcessTaskItem.fromJson(Map<String, dynamic> j) {
    final inst = _m(j['instance']) ?? {};
    final fd = _m(j['formData']);
    return ProcessTaskItem(
      id: _i(j['id']) ?? 0,
      name: j['name'] ?? '',
      elementId: j['elementId'] ?? '',
      status: j['status'] ?? 'open',
      createdAt: j['createdAt'] ?? '',
      dueAt: j['dueAt'],
      completedAt: j['completedAt'],
      candidateRole: j['candidateRole'],
      candidateLabel: j['candidateLabel'],
      assignee: UserRef.opt(j['assignee']),
      completedBy: UserRef.opt(j['completedBy']),
      decision: fd?['decision']?.toString(),
      comment: fd?['comment']?.toString(),
      decisions: ((j['decisions'] as List?) ?? const []).map((e) => '$e').toList(),
      overdue: j['overdue'] == true,
      instanceId: _i(inst['id']) ?? 0,
      businessKey: inst['businessKey'],
      entityType: inst['entityType'],
      entityId: inst['entityId']?.toString(),
      startedAt: inst['startedAt'] ?? '',
      startedBy: UserRef.opt(inst['startedBy']),
      definitionName: _m(inst['definition'])?['name'] ?? '',
    );
  }
}

class ProcessDefinition {
  final int id, version, instanceCount;
  final String key, name, status, createdAt, updatedAt;
  final UserRef? createdBy;
  final String? bpmnXml;
  ProcessDefinition({
    required this.id, required this.version, required this.instanceCount, required this.key, required this.name, required this.status,
    required this.createdAt, required this.updatedAt, this.createdBy, this.bpmnXml,
  });
  factory ProcessDefinition.fromJson(Map<String, dynamic> j) => ProcessDefinition(
        id: _i(j['id']) ?? 0,
        version: _i(j['version']) ?? 1,
        instanceCount: _i(_m(j['_count'])?['instances']) ?? 0,
        key: j['key'] ?? '',
        name: j['name'] ?? '',
        status: j['status'] ?? 'draft',
        createdAt: j['createdAt'] ?? '',
        updatedAt: j['updatedAt'] ?? '',
        createdBy: UserRef.opt(j['createdBy']),
        bpmnXml: j['bpmnXml'],
      );
}

class InstanceTaskBrief {
  final int id;
  final String name;
  final UserRef? assignee;
  final String? candidateRole;
  InstanceTaskBrief({required this.id, required this.name, this.assignee, this.candidateRole});
  factory InstanceTaskBrief.fromJson(Map<String, dynamic> j) =>
      InstanceTaskBrief(id: _i(j['id']) ?? 0, name: j['name'] ?? '', assignee: UserRef.opt(j['assignee']), candidateRole: j['candidateRole']);
}

class ProcessInstanceItem {
  final int id;
  final String? businessKey, entityType, entityId, endedAt, error;
  final String status, startedAt, definitionName;
  final int definitionVersion;
  final UserRef? startedBy;
  final List<InstanceTaskBrief> tasks;
  ProcessInstanceItem({
    required this.id, this.businessKey, this.entityType, this.entityId, this.endedAt, this.error, required this.status,
    required this.startedAt, required this.definitionName, required this.definitionVersion, this.startedBy, required this.tasks,
  });
  factory ProcessInstanceItem.fromJson(Map<String, dynamic> j) => ProcessInstanceItem(
        id: _i(j['id']) ?? 0,
        businessKey: j['businessKey'],
        entityType: j['entityType'],
        entityId: j['entityId']?.toString(),
        endedAt: j['endedAt'],
        error: j['error'],
        status: j['status'] ?? 'running',
        startedAt: j['startedAt'] ?? '',
        definitionName: _m(j['definition'])?['name'] ?? '',
        definitionVersion: _i(_m(j['definition'])?['version']) ?? 1,
        startedBy: UserRef.opt(j['startedBy']),
        tasks: _l(j['tasks'], InstanceTaskBrief.fromJson),
      );
}

class InstanceTask {
  final int id;
  final String name, status;
  final String? decision, comment, candidateRole;
  final UserRef? assignee, completedBy;
  InstanceTask({required this.id, required this.name, required this.status, this.decision, this.comment, this.candidateRole, this.assignee, this.completedBy});
  factory InstanceTask.fromJson(Map<String, dynamic> j) {
    final fd = _m(j['formData']);
    return InstanceTask(
      id: _i(j['id']) ?? 0, name: j['name'] ?? '', status: j['status'] ?? 'open', decision: fd?['decision']?.toString(), comment: fd?['comment']?.toString(),
      candidateRole: j['candidateRole'], assignee: UserRef.opt(j['assignee']), completedBy: UserRef.opt(j['completedBy']),
    );
  }
}

class InstanceEvent {
  final int id;
  final String? elementId;
  final String type, at;
  InstanceEvent({required this.id, this.elementId, required this.type, required this.at});
  factory InstanceEvent.fromJson(Map<String, dynamic> j) =>
      InstanceEvent(id: _i(j['id']) ?? 0, elementId: j['elementId'], type: j['type'] ?? '', at: j['at'] ?? '');
}

class InstanceHighlight {
  final List<String> completed, active;
  final String? failed;
  InstanceHighlight({required this.completed, required this.active, this.failed});
  factory InstanceHighlight.fromJson(Map<String, dynamic>? j) => InstanceHighlight(
      completed: ((j?['completed'] as List?) ?? const []).map((e) => '$e').toList(),
      active: ((j?['active'] as List?) ?? const []).map((e) => '$e').toList(),
      failed: j?['failed']?.toString());
}

class ProcessInstanceDetail {
  final ProcessInstanceItem head;
  final String bpmnXml;
  final Map<String, dynamic> variables;
  final List<InstanceTask> tasks;
  final List<InstanceEvent> events;
  final InstanceHighlight highlight;
  ProcessInstanceDetail({required this.head, required this.bpmnXml, required this.variables, required this.tasks, required this.events, required this.highlight});
  factory ProcessInstanceDetail.fromJson(Map<String, dynamic> j) => ProcessInstanceDetail(
        head: ProcessInstanceItem.fromJson(j),
        bpmnXml: _m(j['definition'])?['bpmnXml'] ?? '',
        variables: _m(j['variables']) ?? {},
        tasks: _l(j['tasks'], InstanceTask.fromJson),
        events: _l(j['events'], InstanceEvent.fromJson),
        highlight: InstanceHighlight.fromJson(_m(j['highlight'])),
      );
}
