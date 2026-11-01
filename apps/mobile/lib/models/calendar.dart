import 'chat.dart';

/// Web lib/types.ts → CalendarItem.
class CalendarItem {
  final String key, kind; // event | task | meeting, tracking, shipment ...
  final int id;
  final String title, start, end;
  final bool allDay;
  final String? color;
  final bool done;
  final String? visibility; // private | department | company
  final String? location, description, link;
  final UserRef? owner;
  final List<UserRef> attendees;
  final bool canEdit;
  const CalendarItem({
    required this.key, required this.kind, required this.id, required this.title, required this.start, required this.end,
    required this.allDay, this.color, this.done = false, this.visibility, this.location, this.description, this.owner,
    this.attendees = const [], this.canEdit = false, this.link,
  });
  factory CalendarItem.fromJson(Map<String, dynamic> j) => CalendarItem(
        key: j['key'] as String? ?? '',
        kind: j['kind'] as String? ?? 'event',
        id: (j['id'] as num?)?.toInt() ?? 0,
        title: j['title'] as String? ?? '',
        start: j['start'] as String? ?? '',
        end: j['end'] as String? ?? '',
        allDay: j['allDay'] == true,
        color: j['color'] as String?,
        done: j['done'] == true,
        visibility: j['visibility'] as String?,
        location: j['location'] as String?,
        description: j['description'] as String?,
        owner: userOrNull(j['owner']),
        attendees: userList(j['attendees']),
        canEdit: j['canEdit'] == true,
        link: j['link'] as String?,
      );
}
