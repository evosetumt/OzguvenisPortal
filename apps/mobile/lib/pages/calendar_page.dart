import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/calendar.dart';
import '../models/chat.dart';
import '../widgets/glass.dart';
import 'calendar/event_form.dart';
import 'chat/format.dart';

const _weekdays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

DateTime _d(DateTime x) => DateTime(x.year, x.month, x.day);

/// Ayın görünen ızgarası: pazartesiden başlayan 6 hafta.
List<DateTime> gridDays(DateTime month) {
  final first = DateTime(month.year, month.month, 1);
  final start = DateTime(first.year, first.month, 1 - ((first.weekday - 1) % 7));
  return List.generate(42, (i) => DateTime(start.year, start.month, start.day + i));
}

/// Öğenin görüneceği gün anahtarları (çok günlü etkinlikler her güne yayılır).
List<String> itemDays(CalendarItem it) {
  // Görev ve modül tarihleri (UTC gece yarısı saklanan tam gün) tek güne düşer.
  if (it.kind != 'event' && it.allDay) return [dateKey(it.start)];
  final s = parseDt(it.start), e = parseDt(it.end);
  final out = <String>[];
  for (var d = _d(s); !d.isAfter(e) && out.length < 42; d = DateTime(d.year, d.month, d.day + 1)) { out.add(localKey(d)); }
  return out.isEmpty ? [localKey(s)] : out;
}

Color? _hex(String? h) {
  if (h == null) return null;
  final s = h.replaceFirst('#', '');
  final v = int.tryParse(s.length == 6 ? 'FF$s' : s, radix: 16);
  return v == null ? null : Color(v);
}

enum _View { month, week, day }

/// Web CalendarPage: ay ızgarası + (telefon) seçili günün listesi; ayrıca hafta ve gün görünümleri.
/// Etkinliğe dokununca düzenleme formu, görev/modül kayıtlarına dokununca ilgili sayfa açılır.
class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});
  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  _View view = _View.month;
  late DateTime focus = _d(DateTime.now()); // seçili gün; ay/hafta buna göre
  late final ApiData<List<CalendarItem>> items = ApiData(_path(), decode: (j) => [for (final e in j as List) CalendarItem.fromJson(e as Map<String, dynamic>)]);
  late final ApiData<List<UserRef>> users = ApiData('/users/directory', decode: (j) => userList(j));

  DateTime get month => DateTime(focus.year, focus.month, 1);
  DateTime get weekStart => DateTime(focus.year, focus.month, focus.day - (focus.weekday - 1));

  (DateTime, DateTime) _range() {
    switch (view) {
      case _View.month:
        final days = gridDays(month);
        final l = days.last;
        return (days.first, DateTime(l.year, l.month, l.day + 1));
      case _View.week:
        final w = weekStart;
        return (w, DateTime(w.year, w.month, w.day + 7));
      case _View.day:
        return (focus, DateTime(focus.year, focus.month, focus.day + 1));
    }
  }

  String _path() {
    final (f, t) = _range();
    return '/calendar?from=${Uri.encodeQueryComponent(f.toUtc().toIso8601String())}&to=${Uri.encodeQueryComponent(t.toUtc().toIso8601String())}';
  }

  @override
  void dispose() { items.dispose(); users.dispose(); super.dispose(); }

  void _go({_View? v, DateTime? day}) {
    setState(() { if (v != null) view = v; if (day != null) focus = _d(day); });
    items.setPath(_path());
  }

  void shift(int n) {
    switch (view) {
      case _View.month: _go(day: DateTime(focus.year, focus.month + n, 1)); // ayın 1'i (taşma olmasın)
      case _View.week: _go(day: DateTime(focus.year, focus.month, focus.day + 7 * n));
      case _View.day: _go(day: DateTime(focus.year, focus.month, focus.day + n));
    }
  }

  Future<void> edit({CalendarItem? item, String? date}) async {
    if (await showEventForm(context, item: item, date: date, users: users.data ?? const []) == true) items.reload();
  }

  void open(CalendarItem it) => it.kind == 'event' ? edit(item: it) : context.go(it.link ?? '/tasks?id=${it.id}');

  Map<String, List<CalendarItem>> byDay(List<CalendarItem> list) {
    final m = <String, List<CalendarItem>>{};
    for (final it in list) { for (final k in itemDays(it)) { (m[k] ??= []).add(it); } }
    return m;
  }

  String get _title {
    switch (view) {
      case _View.month: return DateFormat('LLLL yyyy', 'tr_TR').format(month);
      case _View.week:
        final w = weekStart, e = DateTime(w.year, w.month, w.day + 6);
        return '${DateFormat('d MMM', 'tr_TR').format(w)} – ${DateFormat('d MMM yyyy', 'tr_TR').format(e)}';
      case _View.day: return DateFormat('d MMMM yyyy, EEEE', 'tr_TR').format(focus);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    Widget seg(String label, _View v) => Expanded(child: Material(
          color: view == v ? t.accent : t.fill, shape: const StadiumBorder(),
          child: InkWell(customBorder: const StadiumBorder(), onTap: () => _go(v: v), child: Padding(padding: const EdgeInsets.symmetric(vertical: 8),
              child: Center(child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: view == v ? Colors.white : t.text)))))));
    return ListenableBuilder(listenable: items, builder: (c, _) {
      final map = byDay(items.data ?? const []);
      return RefreshIndicator(onRefresh: () => items.reload(), child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        PageHead(title: 'Takvim', sub: 'Etkinlikler ve görev bitiş tarihleri', actions: [
          PillButton(label: 'Etkinlik', primary: true, icon: LucideIcons.plus, onPressed: () => edit(date: localKey(view == _View.month || view == _View.day ? focus : _d(DateTime.now())))),
        ]),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 14), child: Glass(radius: 99, padding: const EdgeInsets.fromLTRB(6, 4, 6, 4), child: Row(children: [
          IconButton(tooltip: 'Önceki', onPressed: () => shift(-1), icon: Icon(LucideIcons.chevronLeft, size: 18, color: t.text)),
          Expanded(child: Center(child: Text(_title, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w700, color: t.text)))),
          IconButton(tooltip: 'Sonraki', onPressed: () => shift(1), icon: Icon(LucideIcons.chevronRight, size: 18, color: t.text)),
          PillButton(label: 'Bugün', onPressed: () => _go(day: DateTime.now())),
        ]))),
        Padding(padding: const EdgeInsets.fromLTRB(14, 8, 14, 0), child: Row(children: [
          seg('Ay', _View.month), const SizedBox(width: 6), seg('Hafta', _View.week), const SizedBox(width: 6), seg('Gün', _View.day),
        ])),
        if (items.error.isNotEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(items.error, style: TextStyle(color: t.danger))),
        if (items.data == null && items.error.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
        if (view == _View.month) ..._month(t, map)
        else if (view == _View.week) ..._week(t, map)
        else _agendaDay(t, focus, map[localKey(focus)] ?? const [], padTop: 10),
      ]));
    });
  }

  List<Widget> _month(Tokens t, Map<String, List<CalendarItem>> map) {
    final days = gridDays(month);
    final today = todayKey(), sel = localKey(focus);
    return [
      Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 0), child: Glass(radius: 22, padding: const EdgeInsets.all(6), child: Column(children: [
        Row(children: [for (final w in _weekdays) Expanded(child: Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(w, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.text2)))))]),
        for (var r = 0; r < 6; r++) Row(children: [
          for (var i = 0; i < 7; i++) Expanded(child: _cell(t, days[r * 7 + i], map, today, sel)),
        ]),
      ]))),
      _agendaDay(t, focus, map[sel] ?? const [], padTop: 12),
    ];
  }

  Widget _cell(Tokens t, DateTime d, Map<String, List<CalendarItem>> map, String today, String sel) {
    final k = localKey(d);
    final list = map[k] ?? const <CalendarItem>[];
    final out = d.month != month.month, isToday = k == today, isSel = k == sel;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _go(day: d),
      onLongPress: () => edit(date: k),
      child: Container(
        height: 54, margin: const EdgeInsets.all(1.5),
        decoration: BoxDecoration(color: isSel ? t.accentSoft : null, borderRadius: BorderRadius.circular(12), border: isSel ? Border.all(color: t.accent, width: 1.2) : null),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 26, height: 26, alignment: Alignment.center,
            decoration: BoxDecoration(color: isToday ? t.accent : null, shape: BoxShape.circle),
            child: Text('${d.day}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: isToday ? Colors.white : (out ? t.text3 : t.text))),
          ),
          const SizedBox(height: 3),
          SizedBox(height: 6, child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (final it in list.take(3)) Container(width: 6, height: 6, margin: const EdgeInsets.symmetric(horizontal: 1.5), decoration: BoxDecoration(color: _hex(it.color) ?? (it.kind == 'event' ? t.accent : t.text2), shape: BoxShape.circle)),
            if (list.length > 3) Text('+', style: TextStyle(fontSize: 8, color: t.text2, height: 1)),
          ])),
        ]),
      ),
    );
  }

  List<Widget> _week(Tokens t, Map<String, List<CalendarItem>> map) => [
        for (var i = 0; i < 7; i++) _agendaDay(t, DateTime(weekStart.year, weekStart.month, weekStart.day + i), map[localKey(DateTime(weekStart.year, weekStart.month, weekStart.day + i))] ?? const [], padTop: 10, header: true),
      ];

  /// Bir günün öğeleri (gün görünümü, hafta bölümü ve ay altındaki liste).
  Widget _agendaDay(Tokens t, DateTime day, List<CalendarItem> list, {double padTop = 0, bool header = true}) {
    final isToday = localKey(day) == todayKey();
    return Padding(padding: EdgeInsets.fromLTRB(14, padTop, 14, 0), child: Glass(radius: 22, padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(DateFormat('d MMMM, EEEE', 'tr_TR').format(day), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: isToday ? t.accent : t.text))),
        IconButton(visualDensity: VisualDensity.compact, tooltip: 'Etkinlik ekle', onPressed: () => edit(date: localKey(day)), icon: Icon(LucideIcons.plus, size: 18, color: t.text2)),
      ]),
      if (list.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text('Bu günde kayıt yok.', style: TextStyle(color: t.text2, fontSize: 13.5))),
      for (final it in list) Padding(padding: const EdgeInsets.only(top: 6), child: InkWell(
        borderRadius: BorderRadius.circular(10), onTap: () => open(it),
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(10), border: Border(left: BorderSide(color: _hex(it.color) ?? (it.kind == 'event' ? t.accent : t.text2), width: 3))),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(it.title, style: TextStyle(fontWeight: FontWeight.w600, color: t.text, decoration: it.done ? TextDecoration.lineThrough : null)),
              if (it.kind == 'event' && !it.allDay) Text('${formatTime(it.start)} – ${formatTime(it.end)}${it.location?.isNotEmpty == true ? ' · ${it.location}' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2))
              else if (it.kind == 'event' && it.location?.isNotEmpty == true) Text(it.location!, style: TextStyle(fontSize: 12.5, color: t.text2)),
            ])),
          ]),
        ),
      )),
    ])));
  }
}
