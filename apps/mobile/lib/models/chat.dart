/// Web lib/types.ts (UserRef) ve lib/types-chat.ts karşılığı.
class UserRef {
  final int id;
  final String fullName;
  final String? avatarUrl;
  final int? departmentId;
  const UserRef({required this.id, required this.fullName, this.avatarUrl, this.departmentId});
  factory UserRef.fromJson(Map<String, dynamic> j) => UserRef(
        id: (j['id'] as num?)?.toInt() ?? 0,
        fullName: j['fullName'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        departmentId: (j['departmentId'] as num?)?.toInt(),
      );
}

UserRef? userOrNull(dynamic j) => j is Map<String, dynamic> ? UserRef.fromJson(j) : null;
List<UserRef> userList(dynamic j) => [for (final e in (j as List?) ?? const []) UserRef.fromJson(e as Map<String, dynamic>)];

class ChatAttachment {
  final int id, size;
  final String fileName, mime;
  const ChatAttachment({required this.id, required this.fileName, required this.mime, required this.size});
  factory ChatAttachment.fromJson(Map<String, dynamic> j) => ChatAttachment(
        id: (j['id'] as num?)?.toInt() ?? 0,
        fileName: j['fileName'] as String? ?? '',
        mime: j['mime'] as String? ?? '',
        size: (j['size'] as num?)?.toInt() ?? 0,
      );
}

class ChatMessage {
  final int id, conversationId, senderId;
  final String body, createdAt;
  final String? editedAt, deletedAt;
  final UserRef sender;
  final ChatAttachment? attachment;
  /// Arama özeti mesajıysa aramanın kimliği
  final int? callId;
  const ChatMessage({
    required this.id, required this.conversationId, required this.senderId, required this.body, required this.createdAt,
    this.editedAt, this.deletedAt, required this.sender, this.attachment, this.callId,
  });
  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: (j['id'] as num?)?.toInt() ?? 0,
        conversationId: (j['conversationId'] as num?)?.toInt() ?? 0,
        senderId: (j['senderId'] as num?)?.toInt() ?? 0,
        body: j['body'] as String? ?? '',
        createdAt: j['createdAt'] as String? ?? '',
        editedAt: j['editedAt'] as String?,
        deletedAt: j['deletedAt'] as String?,
        sender: userOrNull(j['sender']) ?? const UserRef(id: 0, fullName: ''),
        attachment: j['attachment'] is Map<String, dynamic> ? ChatAttachment.fromJson(j['attachment']) : null,
        callId: (j['callId'] as num?)?.toInt(),
      );
}

class ConversationMember extends UserRef {
  final int? lastReadMessageId;
  const ConversationMember({required super.id, required super.fullName, super.avatarUrl, super.departmentId, this.lastReadMessageId});
  factory ConversationMember.fromJson(Map<String, dynamic> j) => ConversationMember(
        id: (j['id'] as num?)?.toInt() ?? 0,
        fullName: j['fullName'] as String? ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        departmentId: (j['departmentId'] as num?)?.toInt(),
        lastReadMessageId: (j['lastReadMessageId'] as num?)?.toInt(),
      );
  ConversationMember withRead(int? id) => ConversationMember(id: this.id, fullName: fullName, avatarUrl: avatarUrl, departmentId: departmentId, lastReadMessageId: id);
}

class Conversation {
  final int id, createdById, unread;
  final String type; // direct | group
  final String? title, lastMessageAt;
  final String createdAt;
  final List<ConversationMember> members;
  final ChatMessage? lastMessage;
  const Conversation({
    required this.id, required this.type, this.title, required this.createdById, this.lastMessageAt, required this.createdAt,
    required this.members, this.lastMessage, this.unread = 0,
  });
  bool get isGroup => type == 'group';
  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
        id: (j['id'] as num?)?.toInt() ?? 0,
        type: j['type'] as String? ?? 'direct',
        title: j['title'] as String?,
        createdById: (j['createdById'] as num?)?.toInt() ?? 0,
        lastMessageAt: j['lastMessageAt'] as String?,
        createdAt: j['createdAt'] as String? ?? '',
        members: [for (final m in (j['members'] as List?) ?? const []) ConversationMember.fromJson(m as Map<String, dynamic>)],
        lastMessage: j['lastMessage'] is Map<String, dynamic> ? ChatMessage.fromJson(j['lastMessage']) : null,
        unread: (j['unread'] as num?)?.toInt() ?? 0,
      );
  Conversation copyWith({ChatMessage? lastMessage, String? lastMessageAt, int? unread, List<ConversationMember>? members, String? title}) => Conversation(
        id: id, type: type, title: title ?? this.title, createdById: createdById, createdAt: createdAt,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt, members: members ?? this.members,
        lastMessage: lastMessage ?? this.lastMessage, unread: unread ?? this.unread,
      );
}

class Meeting {
  final int id, organizerId;
  final int? conversationId;
  final String title, roomName, startsAt, endsAt;
  final UserRef organizer;
  final List<UserRef> participants;
  final bool canEdit, canAssignTasks, joinable;
  const Meeting({
    required this.id, required this.title, required this.roomName, required this.startsAt, required this.endsAt,
    required this.organizerId, this.conversationId, required this.organizer, required this.participants,
    required this.canEdit, required this.canAssignTasks, required this.joinable,
  });
  factory Meeting.fromJson(Map<String, dynamic> j) => Meeting(
        id: (j['id'] as num?)?.toInt() ?? 0,
        title: j['title'] as String? ?? '',
        roomName: j['roomName'] as String? ?? '',
        startsAt: j['startsAt'] as String? ?? '',
        endsAt: j['endsAt'] as String? ?? '',
        organizerId: (j['organizerId'] as num?)?.toInt() ?? 0,
        conversationId: (j['conversationId'] as num?)?.toInt(),
        organizer: userOrNull(j['organizer']) ?? const UserRef(id: 0, fullName: ''),
        participants: userList(j['participants']),
        canEdit: j['canEdit'] == true,
        canAssignTasks: j['canAssignTasks'] == true,
        joinable: j['joinable'] == true,
      );
}

/// Toplantı sırasında açılan görev.
class MeetingTask {
  final int id;
  final String title, priority, createdAt;
  final String? dueDate;
  final int statusId;
  final String statusName;
  final bool statusDone;
  final UserRef? assignee;
  const MeetingTask({
    required this.id, required this.title, this.dueDate, required this.priority, required this.createdAt,
    required this.statusId, required this.statusName, required this.statusDone, this.assignee,
  });
  factory MeetingTask.fromJson(Map<String, dynamic> j) {
    final s = (j['status'] as Map<String, dynamic>?) ?? const {};
    return MeetingTask(
      id: (j['id'] as num?)?.toInt() ?? 0,
      title: j['title'] as String? ?? '',
      dueDate: j['dueDate'] as String?,
      priority: j['priority'] as String? ?? 'normal',
      createdAt: j['createdAt'] as String? ?? '',
      statusId: (s['id'] as num?)?.toInt() ?? 0,
      statusName: s['name'] as String? ?? '',
      statusDone: s['isDone'] == true,
      assignee: userOrNull(j['assignee']),
    );
  }
}

/// Birebir sohbette karşı tarafın adı, grupta başlık.
String conversationTitle(Conversation c, int meId) {
  if (c.isGroup) return c.title ?? 'Grup';
  for (final m in c.members) {
    if (m.id != meId) return m.fullName;
  }
  return 'Sohbet';
}
