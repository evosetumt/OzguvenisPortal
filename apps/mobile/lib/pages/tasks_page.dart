import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/task.dart';
import '../widgets/avatar.dart';
import '../widgets/glass.dart';
import 'shared/ui.dart';
import 'tasks/task_board.dart';
import 'tasks/task_drawer.dart';
import 'tasks/task_form.dart';
import 'tasks/task_views.dart';

/// Web TasksPage: pano + liste görünümü, filtreler. Sorgu parametreleri: project, q, assignee, id, new.
class TasksPage extends StatefulWidget {
  const TasksPage({super.key});
  @override
  State<TasksPage> createState() => _TasksPageState();
}

List<Task> _sortRows(List<Task> list, String sort) {
  String due(Task t) => t.dueDate ?? '9999';
  int pr(Task t) => priorityRank[t.priority] ?? 9;
  final r = [...list];
  r.sort((a, b) => sort == 'due'
      ? (due(a).compareTo(due(b)) != 0 ? due(a).compareTo(due(b)) : pr(a) - pr(b))
      : (pr(a) != pr(b) ? pr(a) - pr(b) : due(a).compareTo(due(b))));
  return r;
}

class _TasksPageState extends State<TasksPage> {
  static const _viewKey = 'ozg-task-view';
  String view = 'board';
  bool mine = false;
  String prio = '';
  String sort = 'due';
  final collapsed = <int>{};
  final _q = TextEditingController();
  String _qDebounced = '', _lastParamQ = '';
  Timer? _qTimer;
  String dropErr = '';
  List<Task>? tasks;
  bool _formOpen = false;
  int? _drawerId;

  late final ApiData<List<TaskStatus>> _statuses = ApiData(
      '/task-statuses', decode: (j) => [for (final e in j as List) TaskStatus.fromJson(Map<String, dynamic>.from(e))]);
  late final ApiData<List<Project>> _projects = ApiData(
      '/projects', decode: (j) => [for (final e in j as List) Project.fromJson(Map<String, dynamic>.from(e))]);
  late final ApiData<List<UserRef>> _users = ApiData(
      '/users/directory', decode: (j) => [for (final e in j as List) UserRef.fromJson(Map<String, dynamic>.from(e))]);
  late final ApiData<TaskSummary> _summary = ApiData('/tasks/summary', decode: (j) => TaskSummary.fromJson(Map<String, dynamic>.from(j)));
  ApiData<List<Task>>? _tasks;
  String? _tasksPath;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (mounted) setState(() => view = p.getString(_viewKey) == 'list' ? 'list' : 'board');
    });
    for (final d in [_statuses, _projects, _users, _summary]) { d.addListener(_rebuild); }
  }

  void _rebuild() { if (mounted) setState(() {}); }

  void _onTasks() {
    if (!mounted) return;
    setState(() => tasks = _tasks!.data);
  }

  @override
  void dispose() {
    _qTimer?.cancel();
    _q.dispose();
    for (final d in [_statuses, _projects, _users, _summary]) { d..removeListener(_rebuild)..dispose(); }
    _tasks?..removeListener(_onTasks)..dispose();
    super.dispose();
  }

  Map<String, String> get _params => GoRouterState.of(context).uri.queryParameters;

  void _setParam(String k, String? v) {
    final p = Map<String, String>.from(_params);
    v == null ? p.remove(k) : p[k] = v;
    context.go(Uri(path: '/tasks', queryParameters: p.isEmpty ? null : p).toString());
  }

  void _refresh() {
    _tasks?.reload(silent: true);
    _summary.reload(silent: true);
    _projects.reload(silent: true);
  }

  void _switchView(String v) {
    setState(() => view = v);
    SharedPreferences.getInstance().then((p) => p.setString(_viewKey, v));
  }

  /// Sürükle-bırak: önce arayüzde güncellenir, sunucu reddederse geri alınır.
  Future<void> _onMove(Task moved, TaskStatus to, int index) async {
    final list = tasks;
    if (list == null) return;
    final col = list.where((t) => t.statusId == to.id && t.id != moved.id).toList()..sort((a, b) => a.sortOrder != b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id);
    final ref = StatusRef(to.id, to.name, to.isDone);
    col.insert(index.clamp(0, col.length), moved.copyWith(statusId: to.id, status: ref));
    final order = {for (var i = 0; i < col.length; i++) col[i].id: i};
    final prev = list;
    setState(() {
      tasks = [
        for (final t in list)
          t.id == moved.id ? t.copyWith(statusId: to.id, status: ref, sortOrder: order[t.id]) : (order.containsKey(t.id) ? t.copyWith(sortOrder: order[t.id]) : t)
      ];
      dropErr = '';
    });
    try {
      await Api.i.post('/tasks/${moved.id}/move', {'statusId': to.id, 'index': index.clamp(0, col.length - 1)});
      _summary.reload(silent: true);
    } catch (e) {
      if (mounted) setState(() { tasks = prev; dropErr = e is ApiError ? e.message : 'Taşınamadı'; });
    }
  }

  /// Listede yuvarlak işaret: görevi tamamlandı kolonuna taşır veya geri alır.
  Future<void> _toggleDone(Task t) async {
    final st = _statuses.data;
    final done = st?.where((s) => s.isDone).firstOrNull;
    if (st == null || done == null) return;
    final target = t.status.isDone ? st.firstWhere((s) => !s.isDone) : done;
    final prev = tasks;
    setState(() => tasks = [for (final x in tasks ?? <Task>[]) x.id == t.id ? x.copyWith(statusId: target.id, status: StatusRef(target.id, target.name, target.isDone)) : x]);
    try {
      await Api.i.post('/tasks/${t.id}/move', {'statusId': target.id, 'index': 0});
      _summary.reload(silent: true);
    } catch (e) {
      if (mounted) setState(() { tasks = prev; dropErr = e is ApiError ? e.message : 'Güncellenemedi'; });
    }
  }

  Future<void> _openForm(int? statusId) async {
    if (_formOpen || _statuses.data == null) return;
    _formOpen = true;
    final id = await showTaskForm(context, projects: _projects.data ?? [], statuses: _statuses.data!, users: _users.data ?? [], initialStatusId: statusId);
    _formOpen = false;
    if (!mounted) return;
    final p = Map<String, String>.from(_params)..remove('new');
    if (id != null) { _refresh(); p['id'] = '$id'; }
    context.go(Uri(path: '/tasks', queryParameters: p.isEmpty ? null : p).toString());
  }

  Future<void> _openDrawer(int id) async {
    if (_drawerId == id || _statuses.data == null) return;
    _drawerId = id;
    await showTaskDrawer(context, taskId: id, projects: _projects.data ?? [], statuses: _statuses.data!, users: _users.data ?? [], onChanged: _refresh);
    _drawerId = null;
    if (mounted && _params['id'] == '$id') _setParam('id', null);
  }

  Future<T?> _pick<T>(String title, List<(T, String)> items, T current) => showGlassSheet<T>(context, builder: (c) {
        final t = c.tk;
        return SafeArea(child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(8, 16, 8, 12), children: [
          Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 8), child: Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: t.text))),
          for (final it in items)
            ListTile(
              title: Text(it.$2, style: TextStyle(color: t.text, fontWeight: it.$1 == current ? FontWeight.w700 : FontWeight.w500)),
              trailing: it.$1 == current ? Icon(LucideIcons.check, size: 18, color: t.accentInk) : null,
              onTap: () => Navigator.pop(c, it.$1),
            ),
        ]));
      });

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.watch<AuthController>();
    final me = auth.me!;
    final canWrite = auth.can('task.write');
    final params = GoRouterState.of(context).uri.queryParameters;
    final projectId = params['project'] ?? '';
    final assigneeId = params['assignee'];

    final pq = params['q'];
    if (pq != null && pq != _lastParamQ) { _lastParamQ = pq; _q.text = pq; _qDebounced = pq.trim(); }

    final q = <String, String>{if (projectId.isNotEmpty) 'projectId': projectId, if (mine) 'mine': '1', 'assigneeId': ?assigneeId, if (_qDebounced.isNotEmpty) 'q': _qDebounced};
    final path = '/tasks?${Uri(queryParameters: q.isEmpty ? null : q).query}';
    if (_tasksPath != path) {
      _tasksPath = path;
      if (_tasks == null) {
        _tasks = ApiData<List<Task>>(path, decode: (j) => [for (final e in j as List) Task.fromJson(Map<String, dynamic>.from(e))])..addListener(_onTasks);
      } else {
        _tasks!.setPath(path);
      }
    }

    // ?new=1 ve ?id=N: yeni görev formu / ayrıntı çekmecesi
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_params['new'] == '1') _openForm(null);
      final id = int.tryParse(_params['id'] ?? '');
      if (id != null && id != 0) _openDrawer(id);
    });

    final statuses = _statuses.data ?? [];
    final all = tasks ?? [];
    final columns = [
      for (final s in statuses)
        (s, all.where((x) => x.statusId == s.id).toList()..sort((a, b) => a.sortOrder != b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id))
    ];
    List<Task> shown(List<Task> l) => prio.isEmpty ? l : l.where((x) => x.priority == prio).toList();
    final projects = _projects.data ?? [];
    final project = projects.where((p) => '${p.id}' == projectId).firstOrNull;
    final openTotal = all.where((x) => !x.status.isDone).length;
    final projectCount = all.where((x) => !x.status.isDone).map((x) => x.projectId ?? 0).toSet().length;
    final sum = _summary.data;
    final err = _tasks?.error.isNotEmpty == true ? _tasks!.error : dropErr;
    final h = MediaQuery.of(context).size.height;

    return RefreshIndicator(
      onRefresh: () async => _refresh(),
      child: ListView(padding: const EdgeInsets.only(bottom: 110), children: [
        PageHead(title: 'Görevler', sub: '$openTotal açık iş · $projectCount proje', actions: [
          if (canWrite) PillButton(label: 'Yeni görev', icon: LucideIcons.plus, primary: true, onPressed: () => _openForm(statuses.firstOrNull?.id)),
        ]),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: GridView.count(
            crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 2.3,
            children: [
              StatTile('Açık', '${sum?.open ?? '–'}'),
              StatTile('Bu hafta bitecek', '${sum?.dueThisWeek ?? '–'}'),
              StatTile('Geciken', '${sum?.overdue ?? '–'}', alert: (sum?.overdue ?? 0) > 0),
              StatTile('Bu hafta biten', '${sum?.completedThisWeek ?? '–'}'),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
          child: Align(alignment: Alignment.centerLeft, child: Seg<String>(value: view, onChanged: _switchView, items: const [('board', 'Pano', LucideIcons.columns3), ('list', 'Liste', LucideIcons.list)])),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
          child: Glass(
            radius: 22, padding: const EdgeInsets.all(10),
            child: Column(children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                FilterChip2(
                  on: projectId.isNotEmpty, label: project?.name ?? 'Tüm projeler', trailing: const Icon(LucideIcons.chevronDown, size: 15),
                  leading: project != null ? Container(width: 10, height: 10, decoration: BoxDecoration(color: hexColor(project.color), shape: BoxShape.circle)) : const Icon(LucideIcons.folder, size: 17),
                  onTap: () async {
                    final v = await _pick<String>('Proje', [('', 'Tüm projeler'), for (final p in projects) ('${p.id}', p.name)], projectId);
                    if (v != null) _setParam('project', v.isEmpty ? null : v);
                  },
                ),
                FilterChip2(on: mine, label: 'Yalnızca benim', leading: Avatar(name: me.fullName, src: me.avatarUrl, size: 20), onTap: () => setState(() => mine = !mine)),
                FilterChip2(
                  on: prio.isNotEmpty, label: prio.isEmpty ? 'Her öncelik' : priorityLabel[prio]!, leading: const Icon(LucideIcons.flag, size: 17), trailing: const Icon(LucideIcons.chevronDown, size: 15),
                  onTap: () async {
                    final v = await _pick<String>('Öncelik', [('', 'Her öncelik'), for (final e in priorityLabel.entries) (e.key, e.value)], prio);
                    if (v != null) setState(() => prio = v);
                  },
                ),
                if (assigneeId != null)
                  FilterChip2(
                    on: true, label: (_users.data ?? []).where((u) => '${u.id}' == assigneeId).firstOrNull?.fullName ?? 'Kişi',
                    leading: const Icon(LucideIcons.user, size: 17), trailing: const Icon(LucideIcons.x, size: 15), onTap: () => _setParam('assignee', null),
                  ),
              ]),
              const SizedBox(height: 10),
              TextField(
                controller: _q, textInputAction: TextInputAction.search,
                decoration: const InputDecoration(hintText: 'Başlık, proje, cari kodu veya belge no ile süz', prefixIcon: Icon(LucideIcons.search, size: 17)),
                onChanged: (v) {
                  _qTimer?.cancel();
                  _qTimer = Timer(const Duration(milliseconds: 300), () { if (mounted) setState(() => _qDebounced = v.trim()); });
                },
              ),
            ]),
          ),
        ),
        if (err.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(20, 10, 20, 0), child: Text(err, style: TextStyle(color: t.danger, fontSize: 14))),
        const SizedBox(height: 12),
        if (tasks == null && _statuses.data == null)
          const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
        else if (view == 'board')
          TaskBoard(
            columns: [for (final c in columns) (c.$1, shown(c.$2))], canWrite: canWrite, height: (h * .62).clamp(400, 700),
            onOpen: (id) => _setParam('id', '$id'), onAdd: _openForm, onMove: _onMove,
          )
        else
          _listCard(columns, shown, canWrite),
      ]),
    );
  }

  Widget _listCard(List<(TaskStatus, List<Task>)> columns, List<Task> Function(List<Task>) shown, bool canWrite) {
    final t = context.tk;
    final total = shown(tasks ?? []).length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Glass(
        radius: 22, padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 12, 8),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Tüm görevler', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text)),
                Text('$total görev', style: TextStyle(fontSize: 13, color: t.text2)),
              ])),
              Seg<String>(value: sort, onChanged: (v) => setState(() => sort = v), items: const [('due', 'Bitiş', null), ('prio', 'Öncelik', null)]),
            ]),
          ),
          for (var ci = 0; ci < columns.length; ci++) _group(columns[ci].$1, ci, _sortRows(shown(columns[ci].$2), sort), canWrite),
        ]),
      ),
    );
  }

  Widget _group(TaskStatus s, int ci, List<Task> rows, bool canWrite) {
    final t = context.tk;
    final closed = collapsed.contains(s.id);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      InkWell(
        onTap: () => setState(() => closed ? collapsed.remove(s.id) : collapsed.add(s.id)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 16, 10),
          child: Row(children: [
            AnimatedRotation(turns: closed ? -.25 : 0, duration: const Duration(milliseconds: 150), child: Icon(LucideIcons.chevronDown, size: 18, color: t.text2)),
            const SizedBox(width: 8),
            StatusDot(status: s, index: ci),
            const SizedBox(width: 8),
            Text(s.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
            const SizedBox(width: 8),
            Text('${rows.length}', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text2)),
          ]),
        ),
      ),
      if (!closed) ...[
        if (rows.isEmpty) Padding(padding: const EdgeInsets.fromLTRB(20, 2, 16, 10), child: Text('Görev yok', style: TextStyle(color: t.text3, fontSize: 14))),
        for (final r in rows) TaskRow(t: r, canWrite: canWrite, onToggle: () => _toggleDone(r), onOpen: () => _setParam('id', '${r.id}')),
      ],
    ]);
  }
}
