import 'chat.dart';

/// Web lib/types-call.ts karşılığı.
class CallParticipant extends UserRef {
  final String state; // ringing | joined | left | declined | missed
  final String? joinedAt, leftAt;
  const CallParticipant({required super.id, required super.fullName, super.avatarUrl, required this.state, this.joinedAt, this.leftAt});
  factory CallParticipant.fromJson(Map<String, dynamic> j) => CallParticipant(
        id: (j['id'] as num?)?.toInt() ?? 0,
        fullName: j['fullName'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        state: j['state'] as String? ?? 'ringing',
        joinedAt: j['joinedAt'] as String?,
        leftAt: j['leftAt'] as String?,
      );
}

/// Sunucunun döndürdüğü arama özeti (call:incoming, call:updated, /calls/:id).
class CallView {
  final int id, startedById;
  final String kind, status, createdAt; // kind: audio | video
  final int? conversationId, meetingId;
  final String? answeredAt, endedAt;
  final String? conversationType, conversationTitle, meetingTitle;
  final UserRef startedBy;
  final List<CallParticipant> participants;
  const CallView({
    required this.id, required this.kind, required this.status, this.conversationId, this.meetingId, required this.startedById,
    required this.createdAt, this.answeredAt, this.endedAt, this.conversationType, this.conversationTitle, this.meetingTitle,
    required this.startedBy, required this.participants,
  });
  bool get video => kind == 'video';
  factory CallView.fromJson(Map<String, dynamic> j) {
    final conv = j['conversation'] as Map<String, dynamic>?;
    final meet = j['meeting'] as Map<String, dynamic>?;
    return CallView(
      id: (j['id'] as num?)?.toInt() ?? 0,
      kind: j['kind'] as String? ?? 'audio',
      status: j['status'] as String? ?? 'ringing',
      conversationId: (j['conversationId'] as num?)?.toInt(),
      meetingId: (j['meetingId'] as num?)?.toInt(),
      startedById: (j['startedById'] as num?)?.toInt() ?? 0,
      createdAt: j['createdAt'] as String? ?? '',
      answeredAt: j['answeredAt'] as String?,
      endedAt: j['endedAt'] as String?,
      conversationType: conv?['type'] as String?,
      conversationTitle: conv?['title'] as String?,
      meetingTitle: meet?['title'] as String?,
      startedBy: userOrNull(j['startedBy']) ?? const UserRef(id: 0, fullName: ''),
      participants: [for (final p in (j['participants'] as List?) ?? const []) CallParticipant.fromJson(p as Map<String, dynamic>)],
    );
  }
}

/// Katılınca dönen: içeridekiler (bunlara teklif gönderilir) ve ICE sunucuları.
class JoinResult {
  final CallView call;
  final List<int> peers;
  final List<Map<String, dynamic>> iceServers;
  const JoinResult(this.call, this.peers, this.iceServers);
  factory JoinResult.fromJson(Map<String, dynamic> j) => JoinResult(
        CallView.fromJson(j['call'] as Map<String, dynamic>),
        [for (final p in (j['peers'] as List?) ?? const []) (p as num).toInt()],
        [for (final s in (j['iceServers'] as List?) ?? const []) Map<String, dynamic>.from(s as Map)],
      );
}

/// Toplantı katılım geçmişi.
class AttendanceSession {
  final int id;
  final String startedAt, status;
  final String? endedAt;
  final List<CallParticipant> participants;
  const AttendanceSession({required this.id, required this.startedAt, this.endedAt, required this.status, required this.participants});
  factory AttendanceSession.fromJson(Map<String, dynamic> j) => AttendanceSession(
        id: (j['id'] as num?)?.toInt() ?? 0,
        startedAt: j['startedAt'] as String? ?? '',
        endedAt: j['endedAt'] as String?,
        status: j['status'] as String? ?? '',
        participants: [for (final p in (j['participants'] as List?) ?? const []) CallParticipant.fromJson(p as Map<String, dynamic>)],
      );
}

/// Aramanın başlığı: toplantı adı, grup adı veya birebirde karşı taraf.
String callTitle(CallView c, int meId) {
  if (c.meetingTitle != null) return c.meetingTitle!;
  if (c.conversationType == 'group') return c.conversationTitle ?? 'Grup araması';
  for (final p in c.participants) {
    if (p.id != meId) return p.fullName;
  }
  return c.startedBy.fullName;
}
