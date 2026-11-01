import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/api.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/realtime.dart';
import '../core/theme.dart';
import '../models/task.dart';
import '../widgets/avatar.dart';
import '../widgets/glass.dart';
import 'home/home_cards.dart';
import 'home/home_models.dart';
import 'shared/format.dart';
import 'shared/ui.dart';

String _greeting() {
  final h = DateTime.now().hour;
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

/// Etkinlik zamanı yerel saate göre: bugünse saat, değilse "Yarın 09:00" / "Cum 10:00".
String _eventWhen(String iso) {
  final d = tryParseIso(iso);
  if (d == null) return '';
  final t = DateTime.now();
  final days = DateTime(d.year, d.month, d.day).difference(DateTime(t.year, t.month, t.day)).inDays;
  return (days == 0 ? '' : days == 1 ? 'Yarın ' : '${DateFormat('E', 'tr_TR').format(d)} ') + formatTime(iso);
}

int _minutesUntil(String iso) => ((tryParseIso(iso)?.millisecondsSinceEpoch ?? 0) - DateTime.now().millisecondsSinceEpoch) ~/ 60000;

String _untilLabel(String iso) {
  final m = _minutesUntil(iso);
  if (m <= 0) return 'şimdi';
  if (m < 60) return '$m dk sonra';
  if (m < 24 * 60) return '${m ~/ 60} sa ${m % 60 > 0 ? '${m % 60} dk ' : ''}sonra';
  return DateFormat('d MMMM EEEE', 'tr_TR').format(tryParseIso(iso)!);
}

bool _ended(CalendarItem e) => (tryParseIso(e.end)?.millisecondsSinceEpoch ?? 0) < DateTime.now().millisecondsSinceEpoch;

/// Web HomePage: selamlama, halkalar, sıradaki etkinlik, dikkat, görevlerim, hafta, projeler, şu an.
class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with SocketEvents<HomePage> {
  final _ds = <ChangeNotifier>[];
  ApiData<T> _api<T>(String? path, T Function(dynamic) decode) {
    final d = ApiData<T>(path, decode: decode)..addListener(_rebuild);
    _ds.add(d);
    return d;
  }

  void _rebuild() { if (mounted) setState(() {}); }

  late final ApiData<HomeData> _home = _api('/reports/home', (j) => HomeData.fromJson(Map<String, dynamic>.from(j)));
  ApiData<TaskSummary>? _summary;
  ApiData<List<Task>>? _tasksD;
  ApiData<List<TaskStatus>>? _statuses;
  ApiData<List<CalendarItem>>? _cal;
  late final ApiData<List<dynamic>> _approvals = _api('/process-tasks/mine', (j) => j as List);
  ApiData<TrackingSummary>? _tracking;
  ApiData<PaymentSummary>? _payments;
  List<Task>? _tasks;
  int unread = 0;
  Timer? _tick;
  bool _init = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_init) return;
    _init = true;
    final auth = context.read<AuthController>();
    final canTasks = auth.can('task.read');
    final start = DateTime.now();
    final from = DateTime(start.year, start.month, start.day);
    final to = from.add(const Duration(days: 7));
    if (canTasks) {
      _summary = _api('/tasks/summary?mine=1', (j) => TaskSummary.fromJson(Map<String, dynamic>.from(j)));
      _tasksD = _api('/tasks?mine=1', (j) => [for (final e in j as List) Task.fromJson(Map<String, dynamic>.from(e))]);
      _tasksD!.addListener(() => _tasks = _tasksD!.data);
      _statuses = _api('/task-statuses', (j) => [for (final e in j as List) TaskStatus.fromJson(Map<String, dynamic>.from(e))]);
    }
    if (auth.can('calendar.read')) {
      _cal = _api('/calendar?from=${Uri.encodeQueryComponent(from.toUtc().toIso8601String())}&to=${Uri.encodeQueryComponent(to.toUtc().toIso8601String())}',
          (j) => [for (final e in j as List) CalendarItem.fromJson(Map<String, dynamic>.from(e))]);
    }
    if (auth.can('tracking.read')) _tracking = _api('/tracking/summary', (j) => TrackingSummary.fromJson(Map<String, dynamic>.from(j)));
    if (auth.can('payment.read') || auth.can('payment.manage')) _payments = _api('/payments/summary', (j) => PaymentSummary.fromJson(Map<String, dynamic>.from(j)));
    _loadUnread();
    final me = auth.me!.id;
    onSocket('message:new', (m) { if (m is Map && m['senderId'] != me) _loadUnread(); });
    onSocket('read', (r) { if (r is Map && r['userId'] == me) _loadUnread(); });
    onSocket('conversation:updated', (_) => _loadUnread());
    _tick = Timer.periodic(const Duration(seconds: 60), (_) { if (mounted) setState(() {}); }); // "x dk sonra" tazelensin
  }

  Future<void> _loadUnread() async {
    try {
      final r = await Api.i.get('/chat/unread');
      if (mounted) setState(() => unread = (r['unread'] as num?)?.toInt() ?? 0);
    } catch (_) {}
  }

  @override
  void dispose() {
    _tick?.cancel();
    for (final d in _ds) { d.dispose(); }
    super.dispose();
  }

  Future<void> _toggle(Task t) async {
    final statuses = _statuses?.data;
    final tasks = _tasks;
    if (statuses == null || tasks == null) return;
    final target = t.status.isDone ? statuses.where((s) => !s.isDone).firstOrNull : statuses.where((s) => s.isDone).firstOrNull;
    if (target == null) return;
    final prev = tasks;
    setState(() => _tasks = [
          for (final x in tasks)
            x.id == t.id
                ? x.copyWith(statusId: target.id, status: StatusRef(target.id, target.name, target.isDone),
                    completedAt: target.isDone ? DateTime.now().toUtc().toIso8601String() : null, clearCompleted: !target.isDone)
                : x
        ]);
    try {
      await Api.i.post('/tasks/${t.id}/move', {'statusId': target.id, 'index': 0});
      _summary?.reload(silent: true);
    } catch (_) {
      if (mounted) setState(() => _tasks = prev);
    }
  }

  void _openEvent(CalendarItem e) => context.go(e.link ?? '/calendar');

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.watch<AuthController>();
    final me = auth.me!;
    final canTasks = auth.can('task.read');
    final today = todayKey();
    final home = _home.data;
    final summary = _summary?.data;

    final mine = (_tasks ?? []).where((x) => x.assigneeId == me.id).toList();
    final dueToday = mine.where((x) => x.dueDate != null && dateKey(x.dueDate!) == today).toList();
    final doneToday = mine.where((x) => x.status.isDone && x.completedAt != null && localKey(DateTime.parse(x.completedAt!).toLocal()) == today).toList();
    final todayTotal = {...dueToday.map((x) => x.id), ...doneToday.map((x) => x.id)}.length;
    final todayDone = {...dueToday.where((x) => x.status.isDone).map((x) => x.id), ...doneToday.map((x) => x.id)}.length;
    final focus = mine.where((x) => !x.status.isDone && x.dueDate != null && dateKey(x.dueDate!).compareTo(today) <= 0).toList()
      ..sort((a, b) => (a.dueDate ?? '').compareTo(b.dueDate ?? ''));
    final upcoming = mine.where((x) => !x.status.isDone && (x.dueDate == null || dateKey(x.dueDate!).compareTo(today) > 0)).toList()
      ..sort((a, b) => (a.dueDate ?? '9999').compareTo(b.dueDate ?? '9999'));
    final myList = [...focus, ...doneToday, ...upcoming].take(7).toList();

    final events = (_cal?.data ?? []).where((e) => e.kind == 'event' || e.kind == 'meeting').toList();
    final todayEvents = events.where((e) => !e.allDay && localKey(tryParseIso(e.start) ?? DateTime(1970)) == today).toList();
    final pastToday = todayEvents.where(_ended).length;
    final nextUp = events.where((e) => !_ended(e)).toList()..sort((a, b) => a.start.compareTo(b.start));
    final next = nextUp.firstOrNull;
    final laterToday = todayEvents.where((e) => !_ended(e)).length;
    final openLeft = focus.length;

    final weekDone = summary?.completedThisWeek ?? 0;
    final weekPlan = weekDone + (summary?.dueThisWeek ?? 0);
    final rc = ringColors(t.dark);
    final meetColor = rc[2];

    Future<void> refresh() async {
      for (final d in _ds) { if (d is ApiData) d.reload(silent: true); }
      await _loadUnread();
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(padding: const EdgeInsets.only(bottom: 110), children: [
        // Başlık
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_greeting()}, ${me.fullName.split(' ').first}', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -1, height: 1.1, color: t.text)),
            const SizedBox(height: 6),
            Text(
              '${DateFormat('d MMMM EEEE', 'tr_TR').format(DateTime.now())} · ${laterToday > 0 ? '$laterToday toplantı' : 'toplantı yok'} ve ${openLeft > 0 ? '$openLeft görev' : 'bekleyen görev yok'} bugün',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: t.text2),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(children: [
            Expanded(child: StatTile('Bugün biten', '$todayDone', small: '/ $todayTotal')),
            const SizedBox(width: 8),
            Expanded(child: StatTile('Açık görevim', '${summary?.open ?? '–'}')),
            const SizedBox(width: 8),
            Expanded(child: StatTile('Geciken', '${summary?.overdue ?? '–'}', alert: (summary?.overdue ?? 0) > 0)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Wrap(spacing: 10, runSpacing: 10, children: [
            if (auth.can('task.write')) PillButton(label: 'Yeni görev', icon: LucideIcons.plus, onPressed: () => context.go('/tasks?new=1')),
            if (next != null) PillButton(label: 'Sıradaki: ${_eventWhen(next.start)}', icon: LucideIcons.video, primary: true, onPressed: () => _openEvent(next)),
          ]),
        ),

        // Bugün
        HmCard(
          title: 'Bugün', sub: 'Halkaları kapat',
          child: Row(children: [
            Rings(rings: [RingSpec(todayDone.toDouble(), todayTotal.toDouble(), rc[0]), RingSpec(weekDone.toDouble(), weekPlan.toDouble(), rc[1]), RingSpec(pastToday.toDouble(), todayEvents.length.toDouble(), rc[2])]),
            const SizedBox(width: 18),
            Expanded(child: Column(children: [
              _legend(t, rc[0], 'Bugünkü görevler', todayDone, todayTotal),
              _legend(t, rc[1], 'Bu hafta', weekDone, weekPlan),
              _legend(t, rc[2], 'Toplantılar', pastToday, todayEvents.length),
            ])),
          ]),
        ),

        // Sıradaki
        HmCard(
          title: 'Sıradaki', link: 'Takvim', linkTo: '/calendar',
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (next != null)
              InkWell(
                borderRadius: BorderRadius.circular(18), onTap: () => _openEvent(next),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: t.accentSoft, borderRadius: BorderRadius.circular(18)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_untilLabel(next.start), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: t.accentInk)),
                    Text(next.title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: t.text)),
                    Text('${formatTime(next.start)} – ${formatTime(next.end)}${next.location != null && next.location!.isNotEmpty ? ' · ${next.location}' : next.kind == 'meeting' ? ' · Görüntülü toplantı' : ''}',
                        style: TextStyle(fontSize: 14, color: t.text2)),
                    const SizedBox(height: 10),
                    Row(children: [
                      for (final a in next.attendees.take(4)) Padding(padding: const EdgeInsets.only(right: 4), child: Avatar(name: a.fullName, src: a.avatarUrl, size: 26)),
                      const Spacer(),
                      if (next.kind == 'meeting') PillButton(label: 'Katıl', icon: LucideIcons.video, primary: true, onPressed: () => _openEvent(next)),
                    ]),
                  ]),
                ),
              )
            else
              emptyText(context, 'Önümüzdeki 7 günde toplantı veya etkinlik yok.'),
            for (final e in nextUp.skip(1).take(3))
              InkWell(
                onTap: () => _openEvent(e),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
                  child: Row(children: [
                    Container(width: 4, height: 28, decoration: BoxDecoration(color: e.color != null ? hexColor(e.color) : (e.kind == 'meeting' ? meetColor : t.purple), borderRadius: BorderRadius.circular(4))),
                    const SizedBox(width: 12),
                    Expanded(child: Text(e.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text))),
                    Text(_eventWhen(e.start), style: TextStyle(fontSize: 13, color: t.text2)),
                  ]),
                ),
              ),
          ]),
        ),

        // Dikkat
        HmCard(
          title: 'Dikkat', sub: 'Senden bir şey bekleyenler',
          child: Column(children: [
            AttnRow(to: '/approvals', icon: LucideIcons.clipboardCheck, hue: t.purple, label: 'Onay bekleyen', value: _approvals.data?.length ?? 0, empty: 'Bekleyen onay yok'),
            AttnRow(to: '/tasks?mine=1', icon: LucideIcons.triangleAlert, hue: t.danger, label: 'Geciken görev', value: summary?.overdue ?? 0, empty: 'Geciken görev yok'),
            AttnRow(to: '/messages', icon: LucideIcons.messageSquareText, hue: t.blue, label: 'Okunmamış mesaj', value: unread, empty: 'Tüm mesajlar okundu'),
            if (_payments?.data != null) ...[
              AttnRow(to: '/payments?view=awaiting', icon: LucideIcons.banknote, hue: t.orange, label: 'Görevlendirme bekleyen ödeme', value: _payments!.data!.awaiting, empty: 'Görevlendirilecek ödeme yok'),
              AttnRow(to: '/payments', icon: LucideIcons.banknote, hue: t.danger, label: '7 gün içinde ödeme', value: _payments!.data!.in7 + _payments!.data!.overdue, empty: 'Yaklaşan ödeme yok'),
            ],
            if (_tracking?.data != null)
              AttnRow(to: '/tracking', icon: LucideIcons.timer, hue: t.orange, label: '30 gün içinde biten sözleşme / poliçe', value: _tracking!.data!.in30, empty: 'Yakında biten kayıt yok'),
          ]),
        ),

        if (canTasks)
          HmCard(
            title: 'Görevlerim', sub: 'Bugün bitecek ve gecikenler', link: 'Tüm görevler', linkTo: '/tasks',
            child: Column(children: [
              if (myList.isEmpty) emptyText(context, 'Size atanmış açık görev yok. 🎉'),
              for (final x in myList) _taskRow(context, x, today, auth.can('task.write')),
            ]),
          ),

        if (canTasks && home != null)
          HmCard(
            title: 'Bu hafta', sub: home.scope == 'own' ? 'Bitirdiğin işler' : 'Ekibin bitirdiği işler',
            trailing: auth.can('report.read') ? IconButton(tooltip: 'Analiz', visualDensity: VisualDensity.compact, icon: const Icon(LucideIcons.arrowUpRight, size: 17), onPressed: () => context.go('/insights')) : null,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(TextSpan(children: [
                TextSpan(text: '${home.thisWeek}', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: t.text)),
                TextSpan(text: ' tamamlandı  ', style: TextStyle(fontSize: 15, color: t.text2)),
              ])),
              WeekDelta(cur: home.thisWeek, prev: home.lastWeek),
              const SizedBox(height: 14),
              WeekBars(week: home.week),
            ]),
          ),

        if (canTasks && home != null && home.projects.isNotEmpty)
          HmCard(
            title: 'Projeler', link: 'Tümü', linkTo: '/tasks',
            child: Column(children: [for (final p in home.projects) _projectRow(context, p)]),
          ),

        if (canTasks && home != null) RightNow(home: home),
      ]),
    );
  }

  Widget _legend(Tokens t, Color c, String label, int v, int max) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          Container(width: 4, height: 34, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4))),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 12.5, color: t.text2)),
            Text.rich(TextSpan(children: [
              TextSpan(text: '$v', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: t.text)),
              TextSpan(text: ' / $max', style: TextStyle(fontSize: 13, color: t.text2)),
            ])),
          ])),
        ]),
      );

  Widget _taskRow(BuildContext context, Task x, String today, bool canWrite) {
    final t = context.tk;
    final late = isOverdue(x.dueDate, x.status.isDone);
    final isToday2 = x.dueDate != null && dateKey(x.dueDate!) == today;
    return InkWell(
      borderRadius: BorderRadius.circular(14), onTap: () => context.go('/tasks?id=${x.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Checkbox(value: x.status.isDone, shape: const CircleBorder(), onChanged: canWrite ? (_) => _toggle(x) : null),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(x.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: x.status.isDone ? t.text2 : t.text, decoration: x.status.isDone ? TextDecoration.lineThrough : null)),
            Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (x.project != null) ProjChip(name: x.project!.name, color: x.project!.color),
              if (x.dueDate != null) Text(formatDue(x.dueDate!), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: late ? t.danger : (isToday2 ? t.orange : t.text2))),
            ]),
          ])),
          if ((x.priority == 'high' || x.priority == 'urgent') && !x.status.isDone) PrioChip(x.priority),
          const SizedBox(width: 6),
        ]),
      ),
    );
  }

  Widget _projectRow(BuildContext context, HomeProject p) {
    final t = context.tk;
    final hue = hexColor(p.color);
    return InkWell(
      borderRadius: BorderRadius.circular(14), onTap: () => context.go('/tasks?project=${p.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(children: [
          Container(width: 36, height: 36, alignment: Alignment.center, decoration: BoxDecoration(color: hue.withValues(alpha: .2), borderRadius: BorderRadius.circular(11)),
              child: Text(p.name.isEmpty ? '' : p.name.substring(0, 1), style: TextStyle(fontWeight: FontWeight.w700, color: hue))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(p.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
            Text('${p.open} açık${p.overdue > 0 ? ' · ${p.overdue} geciken' : ''}${p.nextDue != null ? ' · sıradaki ${formatDue(p.nextDue!)}' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
            const SizedBox(height: 6),
            ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: p.progress / 100, minHeight: 5, backgroundColor: t.fill2, color: hue)),
          ])),
          const SizedBox(width: 10),
          Text('%${p.progress}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.text)),
        ]),
      ),
    );
  }
}
