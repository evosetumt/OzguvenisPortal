// Web lib/types-insights.ts karşılığı (API /reports/tasks).

double _d(dynamic v) => v is num ? v.toDouble() : 0;
double? _dn(dynamic v) => v is num ? v.toDouble() : null;
int _i(dynamic v) => v is num ? v.toInt() : 0;
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    v is List ? v.whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList() : <T>[];
Map<String, dynamic> _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

class PeriodStats {
  PeriodStats.fromJson(Map<String, dynamic> j)
      : completed = _i(j['completed']),
        onTime = _i(j['onTime']),
        late = _i(j['late']),
        onTimeRate = _dn(j['onTimeRate']),
        avgCycleDays = _dn(j['avgCycleDays']);
  final int completed, onTime, late;
  final double? onTimeRate, avgCycleDays;
}

class DailyPoint {
  DailyPoint.fromJson(Map<String, dynamic> j)
      : date = j['date']?.toString() ?? '',
        completed = _i(j['completed']),
        created = _i(j['created']),
        prevCompleted = _i(j['prevCompleted']);
  final String date;
  final int completed, created, prevCompleted;
}

class ProjectRef {
  ProjectRef.fromJson(Map<String, dynamic> j) : id = _i(j['id']), name = j['name']?.toString() ?? '', color = j['color']?.toString() ?? '';
  final int id;
  final String name, color;
}

class ByProject {
  ByProject.fromJson(Map<String, dynamic> j)
      : project = j['project'] is Map ? ProjectRef.fromJson(_m(j['project'])) : null,
        completed = _i(j['completed']),
        share = _dn(j['share']);
  final ProjectRef? project;
  final int completed;
  final double? share;
}

class WorkloadRow {
  WorkloadRow.fromJson(Map<String, dynamic> j)
      : userId = _i(_m(j['user'])['id']),
        fullName = _m(j['user'])['fullName']?.toString() ?? '',
        department = _m(j['user'])['department']?.toString(),
        open = _i(j['open']),
        overdue = _i(j['overdue']),
        completed = _i(j['completed']);
  final int userId, open, overdue, completed;
  final String fullName;
  final String? department;
}

class SlowTask {
  SlowTask.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        title = j['title']?.toString() ?? '',
        ageDays = _i(j['ageDays']),
        overdue = j['overdue'] == true,
        project = j['project'] is Map ? ProjectRef.fromJson(_m(j['project'])) : null,
        assignee = j['assignee']?.toString();
  final int id, ageDays;
  final String title;
  final bool overdue;
  final ProjectRef? project;
  final String? assignee;
}

class ErpTaskStats {
  ErpTaskStats.fromJson(Map<String, dynamic> j)
      : open = _i(j['open']),
        autoClosed = _i(j['autoClosed']),
        manualClosed = _i(j['manualClosed']),
        avgLeadDays = _dn(j['avgLeadDays']);
  final int open, autoClosed, manualClosed;
  final double? avgLeadDays;
}

class TaskReport {
  TaskReport.fromJson(Map<String, dynamic> j)
      : from = _m(j['period'])['from']?.toString() ?? '',
        to = _m(j['period'])['to']?.toString() ?? '',
        days = _i(_m(j['period'])['days']),
        scope = _m(j['period'])['scope']?.toString() ?? 'all',
        capacity = _d(j['capacity']),
        current = PeriodStats.fromJson(_m(j['current'])),
        previous = PeriodStats.fromJson(_m(j['previous'])),
        open = _i(j['open']),
        overdue = _i(j['overdue']),
        daily = _l(j['daily'], DailyPoint.fromJson),
        byProject = _l(j['byProject'], ByProject.fromJson),
        workload = _l(j['workload'], WorkloadRow.fromJson),
        slowest = _l(j['slowest'], SlowTask.fromJson),
        erp = ErpTaskStats.fromJson(_m(j['erp']));
  final String from, to, scope; // scope: all | department | own
  final int days, open, overdue;
  final double capacity;
  final PeriodStats current, previous;
  final List<DailyPoint> daily;
  final List<ByProject> byProject;
  final List<WorkloadRow> workload;
  final List<SlowTask> slowest;
  final ErpTaskStats erp;
}
