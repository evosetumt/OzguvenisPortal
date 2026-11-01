/// Web ProfileDrawer / TeamPage tipleri (GET /team, GET /team/:id) ve lib/people.ts → PRESENCE.
const presenceOrder = ['online', 'focus', 'meeting', 'away'];
const presenceLabel = {'online': 'Çevrimiçi', 'focus': 'Odakta', 'meeting': 'Toplantıda', 'away': 'Uzakta'};

int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
int? _in(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

class Dept {
  final int id;
  final String name;
  final int? managerId;
  Dept(this.id, this.name, this.managerId);
  static Dept? from(dynamic v) {
    final j = _m(v);
    return j == null ? null : Dept(_i(j['id']), j['name'] ?? '', _in(j['managerId']));
  }
}

class Workload {
  final int open, doneWeek, overdue, dueWeek, load;
  Workload({this.open = 0, this.doneWeek = 0, this.overdue = 0, this.dueWeek = 0, this.load = 0});
  static Workload? from(dynamic v) {
    final j = _m(v);
    return j == null ? null : Workload(open: _i(j['open']), doneWeek: _i(j['doneWeek']), overdue: _i(j['overdue']), dueWeek: _i(j['dueWeek']), load: _i(j['load']));
  }
}

class Member {
  final int id;
  final String fullName, email, presence;
  final String? title, avatarUrl;
  final Dept? department;
  final bool isManager;
  final Workload? workload;
  Member.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        fullName = j['fullName'] ?? '',
        email = j['email'] ?? '',
        presence = j['presence'] ?? 'away',
        title = j['title'],
        avatarUrl = j['avatarUrl'],
        department = Dept.from(j['department']),
        isManager = j['isManager'] == true,
        workload = Workload.from(j['workload']);
}

class TeamData {
  final int capacity;
  final List<Member> members;
  TeamData.fromJson(Map<String, dynamic> j)
      : capacity = j['capacity'] == null ? 8 : _i(j['capacity']),
        members = [for (final e in (j['members'] as List?) ?? const []) Member.fromJson(Map<String, dynamic>.from(e))];
}

class ProfileTask {
  final int id;
  final String title, priority;
  final String? dueDate, projectName, projectColor;
  ProfileTask.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        title = j['title'] ?? '',
        priority = j['priority'] ?? 'normal',
        dueDate = j['dueDate'],
        projectName = _m(j['project'])?['name'],
        projectColor = _m(j['project'])?['color'];
}

class ProfileEvent {
  final int id;
  final String title, startsAt;
  final bool allDay;
  ProfileEvent.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']), title = j['title'] ?? '', startsAt = j['startsAt'] ?? '', allDay = j['allDay'] == true;
}

class ProfileProject {
  final int id, open;
  final String name, color, role;
  ProfileProject.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']), open = _i(j['open']), name = j['name'] ?? '', color = j['color'] ?? '#3b82f6', role = j['role'] ?? '';
}

class Profile {
  final int id, capacity;
  final String fullName, email;
  String presence;
  String? phone, title, avatarUrl;
  final Dept? department;
  final bool self, isManager;
  final Workload? workload;
  final List<ProfileTask>? openTasks;
  final List<ProfileEvent> events;
  final List<ProfileProject> projects;

  Profile.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        capacity = j['capacity'] == null ? 8 : _i(j['capacity']),
        fullName = j['fullName'] ?? '',
        email = j['email'] ?? '',
        presence = j['presence'] ?? 'away',
        phone = j['phone'],
        title = j['title'],
        avatarUrl = j['avatarUrl'],
        department = Dept.from(j['department']),
        self = j['self'] == true,
        isManager = j['isManager'] == true,
        workload = Workload.from(j['workload']),
        openTasks = j['openTasks'] == null ? null : [for (final e in j['openTasks']) ProfileTask.fromJson(Map<String, dynamic>.from(e))],
        events = [for (final e in (j['events'] as List?) ?? const []) ProfileEvent.fromJson(Map<String, dynamic>.from(e))],
        projects = [for (final e in (j['projects'] as List?) ?? const []) ProfileProject.fromJson(Map<String, dynamic>.from(e))];
}
