/// Web HomePage.tsx içindeki yerel tipler (GET /reports/home, /tracking/summary, /payments/summary).
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) => [for (final e in (v as List?) ?? const []) f(Map<String, dynamic>.from(e as Map))];

class WeekDay {
  final String date;
  final int completed;
  WeekDay(this.date, this.completed);
}

class HomeProject {
  final int id, total, done, open, progress, overdue, peopleCount;
  final String name, color;
  final String? nextDue;
  final List<String> people;
  HomeProject.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']), total = _i(j['total']), done = _i(j['done']), open = _i(j['open']), progress = _i(j['progress']),
        overdue = _i(j['overdue']), peopleCount = _i(j['peopleCount']), name = j['name'] ?? '', color = j['color'] ?? '#3b82f6',
        nextDue = j['nextDue'], people = [for (final p in (j['people'] as List?) ?? const []) '$p'];
}

class HomeTeam {
  final int id, open, overdue, dueToday;
  final String fullName;
  final String? department;
  HomeTeam.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']), open = _i(j['open']), overdue = _i(j['overdue']), dueToday = _i(j['dueToday']),
        fullName = j['fullName'] ?? '', department = j['department'];
}

class HomeActivity {
  final String kind, at, title;
  final String? who, text;
  final int taskId;
  HomeActivity.fromJson(Map<String, dynamic> j)
      : kind = j['kind'] ?? 'created', at = j['at'] ?? '', title = j['title'] ?? '', who = j['who'], text = j['text'], taskId = _i(j['taskId']);
}

class HomeData {
  final String? scope;
  final List<WeekDay> week;
  final int thisWeek, lastWeek;
  final List<HomeProject> projects;
  final List<HomeTeam> team;
  final List<HomeActivity> activity;
  HomeData.fromJson(Map<String, dynamic> j)
      : scope = j['scope'],
        week = _l(j['week'], (e) => WeekDay(e['date'] ?? '', _i(e['completed']))),
        thisWeek = _i(j['thisWeek']), lastWeek = _i(j['lastWeek']),
        projects = _l(j['projects'], HomeProject.fromJson),
        team = _l(j['team'], HomeTeam.fromJson),
        activity = _l(j['activity'], HomeActivity.fromJson);
}

class TrackingSummary {
  final int active, in30, in7, expired;
  TrackingSummary.fromJson(Map<String, dynamic> j) : active = _i(j['active']), in30 = _i(j['in30']), in7 = _i(j['in7']), expired = _i(j['expired']);
}

class PaymentSummary {
  final int awaiting, in7, overdue;
  PaymentSummary.fromJson(Map<String, dynamic> j) : awaiting = _i(j['awaiting']), in7 = _i(j['in7']), overdue = _i(j['overdue']);
}
