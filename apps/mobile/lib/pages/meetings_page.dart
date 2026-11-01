import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/api.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/chat.dart';
import '../widgets/glass.dart';
import 'calls/call_controller.dart';
import 'calls/meeting_form.dart';
import 'calls/meeting_side_panel.dart';
import 'chat/format.dart';
import 'chat/user_picker.dart';

String _dayLabel(String iso) => DateFormat('EEE, d MMMM', 'tr_TR').format(parseDt(iso));

/// Web MeetingsPage: yaklaşan/geçmiş toplantılar, katıl, notlar/görevler, iptal, toplantı planla.
/// `?id=` toplantıyı öne çıkarır, `&join=1` doğrudan katılır.
class MeetingsPage extends StatefulWidget {
  const MeetingsPage({super.key});
  @override
  State<MeetingsPage> createState() => _MeetingsPageState();
}

class _MeetingsPageState extends State<MeetingsPage> {
  bool upcoming = true;
  late final ApiData<List<Meeting>> d = ApiData('/meetings?when=upcoming', decode: _dec);
  ApiData<Meeting>? focusD;
  int? focusId;
  bool autoJoin = false, joinedOnce = false;
  String joinError = '';

  static List<Meeting> _dec(dynamic j) => [for (final e in j as List) Meeting.fromJson(e as Map<String, dynamic>)];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final qp = GoRouterState.of(context).uri.queryParameters;
    final id = int.tryParse(qp['id'] ?? '');
    autoJoin = qp['join'] == '1';
    if (id != focusId) {
      focusId = id;
      focusD?.removeListener(_onFocus);
      focusD?.dispose();
      focusD = id == null ? null : (ApiData<Meeting>('/meetings/$id', decode: (j) => Meeting.fromJson(j as Map<String, dynamic>))..addListener(_onFocus));
    }
  }

  // ?join=1 ile gelindiyse (sohbet bağlantıları, takvim) doğrudan katıl.
  void _onFocus() {
    final m = focusD?.data;
    if (autoJoin && m != null && !joinedOnce) {
      joinedOnce = true;
      join(m);
      if (mounted) context.go('/meetings?id=${m.id}');
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() { d.dispose(); focusD?.dispose(); super.dispose(); }

  Future<void> join(Meeting m) async {
    setState(() => joinError = '');
    final calls = callsOf(context, listen: false);
    if (calls == null) { setState(() => joinError = '${m.title}: Arama özelliği kullanılamıyor'); return; }
    try { await calls.joinMeeting(m.id); } catch (e) {
      if (mounted) setState(() => joinError = '${m.title}: ${e is ApiError ? e.message : '$e'.replaceFirst('Exception: ', '')}');
    }
  }

  Future<void> cancel(Meeting m) async {
    final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(
      content: Text('"${m.title}" iptal edilsin mi? Katılımcılara bildirim gider.'),
      actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('İptal et'))],
    ));
    if (ok != true) return;
    try { await Api.i.delete('/meetings/${m.id}'); d.reload(); } catch (e) { if (mounted) showToast(context, e is ApiError ? e.message : 'İptal edilemedi'); }
  }

  void setWhen(bool up) {
    setState(() => upcoming = up);
    d.setPath('/meetings?when=${up ? 'upcoming' : 'past'}');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return ListenableBuilder(listenable: d, builder: (c, _) {
      final list = d.data ?? const <Meeting>[];
      final f = focusD?.data;
      // Odaklanan toplantı listede yoksa (ör. geçmiş) en üstte gösterilir.
      final shown = f != null && !list.any((m) => m.id == f.id) ? [f, ...list] : list;
      Widget seg(String label, bool on, VoidCallback tap) => Expanded(child: Material(
            color: on ? t.accent : t.fill, shape: const StadiumBorder(),
            child: InkWell(customBorder: const StadiumBorder(), onTap: tap, child: Padding(padding: const EdgeInsets.symmetric(vertical: 9),
                child: Center(child: Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: on ? Colors.white : t.text)))))));
      return RefreshIndicator(
        onRefresh: () => d.reload(),
        child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          PageHead(title: 'Toplantılar', sub: 'Görüntülü toplantılar takvime de yansır', actions: [
            PillButton(label: 'Planla', primary: true, icon: LucideIcons.plus, onPressed: () async {
              if (await showMeetingForm(context) == true) { setWhen(true); d.reload(); }
            }),
          ]),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 14), child: Glass(radius: 99, padding: const EdgeInsets.all(5), child: Row(children: [
            seg('Yaklaşan', upcoming, () => setWhen(true)), const SizedBox(width: 6), seg('Geçmiş', !upcoming, () => setWhen(false)),
          ]))),
          if (d.error.isNotEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(d.error, style: TextStyle(color: t.danger))),
          if (joinError.isNotEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(joinError, style: TextStyle(color: t.danger))),
          if (d.data == null && d.error.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
          if (d.data != null && shown.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(upcoming ? 'Yaklaşan toplantı yok.' : 'Geçmiş toplantı yok.', style: TextStyle(color: t.text2)))),
          for (final m in shown) Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 0), child: Glass(
            radius: 22, padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(LucideIcons.calendarClock, size: 18, color: m.id == focusId ? t.accent : t.text),
                const SizedBox(width: 10),
                Text(_dayLabel(m.startsAt), style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
                const SizedBox(width: 8),
                Text('${formatTime(m.startsAt)} – ${formatTime(m.endsAt)}', style: TextStyle(color: t.text2, fontSize: 13)),
              ]),
              const SizedBox(height: 8),
              Text(m.title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: t.text)),
              const SizedBox(height: 2),
              Text('Düzenleyen: ${m.organizer.fullName}${m.participants.isNotEmpty ? ' · ${m.participants.map((p) => p.fullName).join(', ')}' : ''}', style: TextStyle(fontSize: 13, color: t.text2)),
              const SizedBox(height: 10),
              Row(children: [
                if (m.joinable) PillButton(label: 'Katıl', primary: true, icon: LucideIcons.video, onPressed: () => join(m)),
                const Spacer(),
                IconButton(tooltip: m.canAssignTasks ? 'Notlarım ve görevler' : 'Notlarım ve toplantı görevleri', icon: Icon(LucideIcons.notebookPen, size: 18, color: t.text),
                    onPressed: () => showGlassSheet<void>(context, builder: (_) => SheetFrame(title: m.title, child: MeetingSidePanel(meetingId: m.id, canAssignTasks: m.canAssignTasks)))),
                if (m.canEdit && parseDt(m.endsAt).isAfter(DateTime.now()))
                  IconButton(tooltip: 'İptal et', icon: Icon(LucideIcons.trash2, size: 18, color: t.text), onPressed: () => cancel(m)),
              ]),
            ]),
          )),
        ]),
      );
    });
  }
}
