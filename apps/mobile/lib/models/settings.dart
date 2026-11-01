// Ayarlar modülü veri sınıfları (web SettingsPage / components/settings tipleri).
// JSON alan adları aynen korunur; hepsi null güvenli.

int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String _s(dynamic v) => v?.toString() ?? '';
String? _sn(dynamic v) => v?.toString();
List<T> _list<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    ((v as List?) ?? const []).whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();

class Role {
  final int id;
  final String name;
  Role.fromJson(Map<String, dynamic> j) : id = _i(j['id']), name = _s(j['name']);
}

class Department {
  final int id;
  final String name;
  final int? parentId;
  final int? managerId;
  final String? managerName;
  Department.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        name = _s(j['name']),
        parentId = j['parentId'] == null ? null : _i(j['parentId']),
        managerId = j['manager'] is Map ? _i(j['manager']['id']) : null,
        managerName = j['manager'] is Map ? _sn(j['manager']['fullName']) : null;
}

class AdminUser {
  final int id;
  final String email, fullName, status;
  final String? phone, title, lastLoginAt, erpRepCode;
  final int? departmentId;
  final String? departmentName;
  final List<Role> roles;
  AdminUser.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        email = _s(j['email']),
        fullName = _s(j['fullName']),
        status = _s(j['status']),
        phone = _sn(j['phone']),
        title = _sn(j['title']),
        lastLoginAt = _sn(j['lastLoginAt']),
        erpRepCode = _sn(j['erpRepCode']),
        departmentId = j['department'] is Map ? _i(j['department']['id']) : null,
        departmentName = j['department'] is Map ? _sn(j['department']['name']) : null,
        roles = _list(j['roles'], Role.fromJson);
}

/// Kullanıcı özeti (web UserRef): /users/directory ve arşiv üyeleri.
class UserRef {
  final int id;
  final String fullName;
  final String? avatarUrl;
  UserRef.fromJson(Map<String, dynamic> j) : id = _i(j['id']), fullName = _s(j['fullName']), avatarUrl = _sn(j['avatarUrl']);
}

// ---------- Roller ve yetkiler ----------

const scopeLabel = {
  'own': 'Yalnızca kendi kayıtları',
  'department': 'Departmanı (Netsis: plasiyeri)',
  'all': 'Tümü',
};

class PermissionDef {
  final String code, label;
  final List<String> scopes;
  PermissionDef.fromJson(Map<String, dynamic> j)
      : code = _s(j['code']),
        label = _s(j['label']),
        scopes = ((j['scopes'] as List?) ?? const []).map((e) => '$e').toList();
}

class ModuleDef {
  final String key, label;
  final bool financial;
  final List<PermissionDef> permissions;
  ModuleDef.fromJson(Map<String, dynamic> j)
      : key = _s(j['key']),
        label = _s(j['label']),
        financial = j['financial'] == true,
        permissions = _list(j['permissions'], PermissionDef.fromJson);
}

class RoleRow {
  final int id;
  final String name;
  final String? description;
  final int userCount;
  final bool locked;
  final Map<String, String> permissions;
  RoleRow.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        name = _s(j['name']),
        description = _sn(j['description']),
        userCount = _i(j['userCount']),
        locked = j['locked'] == true,
        permissions = {for (final e in ((j['permissions'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}'};
}

// ---------- Bildirimler ----------

const channelLabel = {'inapp': 'Uygulama içi', 'push': 'Anlık (push)', 'email': 'E-posta', 'whatsapp': 'WhatsApp'};
const allChannels = ['inapp', 'push', 'email', 'whatsapp'];

List<String> _strs(dynamic v) => ((v as List?) ?? const []).map((e) => '$e').toList();

class NotifPref {
  final String eventCode, label;
  final List<String> available;
  List<String> channels;
  NotifPref.fromJson(Map<String, dynamic> j)
      : eventCode = _s(j['eventCode']),
        label = _s(j['label']),
        available = _strs(j['available']),
        channels = _strs(j['channels']);
  NotifPref copy({List<String>? channels}) => NotifPref.fromJson({'eventCode': eventCode, 'label': label, 'available': available, 'channels': channels ?? this.channels});
}

class NotifRule {
  final String eventCode, label;
  final List<String> channels;
  final bool isActive;
  NotifRule.fromJson(Map<String, dynamic> j)
      : eventCode = _s(j['eventCode']),
        label = _s(j['label']),
        channels = _strs(j['channels']),
        isActive = j['isActive'] != false;
  NotifRule copy({List<String>? channels, bool? isActive}) =>
      NotifRule.fromJson({'eventCode': eventCode, 'label': label, 'channels': channels ?? this.channels, 'isActive': isActive ?? this.isActive});
}

class RulesResp {
  final List<NotifRule> rules;
  final List<({String channel, bool configured})> channels;
  RulesResp(this.rules, this.channels);
  RulesResp.fromJson(Map<String, dynamic> j)
      : rules = _list(j['rules'], NotifRule.fromJson),
        channels = _list(j['channels'], (e) => (channel: _s(e['channel']), configured: e['configured'] == true));
}

class MailConfig {
  final String host, user, from, portalUrl, source;
  final int port;
  final bool secure, passwordSet;
  MailConfig.fromJson(Map<String, dynamic> j)
      : host = _s(j['host']),
        port = _i(j['port']) == 0 ? 587 : _i(j['port']),
        secure = j['secure'] == true,
        user = _s(j['user']),
        from = _s(j['from']),
        portalUrl = _s(j['portalUrl']),
        passwordSet = j['passwordSet'] == true,
        source = _s(j['source']);
}

// ---------- Masraf / Ödeme ----------

class ExpenseCategory {
  final int id;
  final String name;
  final bool isActive;
  ExpenseCategory.fromJson(Map<String, dynamic> j) : id = _i(j['id']), name = _s(j['name']), isActive = j['isActive'] != false;
}

class ExpenseSettingsData {
  final num autoApproveLimit;
  final int approvalReminderHours;
  final bool aiCategorySuggest, aiAvailable;
  ExpenseSettingsData.fromJson(Map<String, dynamic> j)
      : autoApproveLimit = j['autoApproveLimit'] is num ? j['autoApproveLimit'] : num.tryParse('${j['autoApproveLimit']}') ?? 0,
        approvalReminderHours = _i(j['approvalReminderHours']),
        aiCategorySuggest = j['aiCategorySuggest'] == true,
        aiAvailable = j['aiAvailable'] == true;
}

// ---------- WhatsApp ----------

const waStatusLabel = {
  'queued': 'Kuyrukta', 'sent': 'Gönderildi', 'delivered': 'İletildi', 'read': 'Okundu', 'failed': 'Başarısız', 'received': 'Gelen',
};

class WaEventTemplate {
  final String event, label, name, language;
  WaEventTemplate.fromJson(Map<String, dynamic> j) : event = _s(j['event']), label = _s(j['label']), name = _s(j['name']), language = _s(j['language']);
}

class WaStatus {
  final bool configured;
  final List<WaEventTemplate> eventTemplates;
  WaStatus.fromJson(Map<String, dynamic> j) : configured = j['configured'] == true, eventTemplates = _list(j['eventTemplates'], WaEventTemplate.fromJson);
}

class WaTemplate {
  final String name, language;
  WaTemplate.fromJson(Map<String, dynamic> j) : name = _s(j['name']), language = _s(j['language']);
}

class WaRecipient {
  final int id;
  final String fullName, state;
  final String? phone, normalized;
  final String? lastStatus, lastError, lastCreatedAt;
  final bool hasLast;
  WaRecipient.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        fullName = _s(j['fullName']),
        phone = _sn(j['phone']),
        normalized = _sn(j['normalized']),
        state = _s(j['state']),
        hasLast = j['last'] is Map,
        lastStatus = j['last'] is Map ? _sn(j['last']['status']) : null,
        lastError = j['last'] is Map ? _sn(j['last']['error']) : null,
        lastCreatedAt = j['last'] is Map ? _sn(j['last']['createdAt']) : null;
}

// ---------- Netsis ----------

const erpEntityLabel = {'customers': 'Cariler', 'account_tx': 'Cari hareketler', 'orders': 'Siparişler', 'quotes': 'Teklifler', 'shipments': 'Sevkiyatlar'};

class SyncRun {
  final int id, rows;
  final String entity, trigger, startedAt, status;
  final String? error;
  SyncRun.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        rows = _i(j['rows']),
        entity = _s(j['entity']),
        trigger = _s(j['trigger']),
        startedAt = _s(j['startedAt']),
        status = _s(j['status']),
        error = _sn(j['error']);
}

class ErpStatus {
  final bool configured, running;
  final String server, database, dbUser;
  final int port, intervalMinutes, windowDays;
  final Map<String, int> counts;
  final List<SyncRun> runs;
  ErpStatus.fromJson(Map<String, dynamic> j)
      : configured = j['configured'] == true,
        running = j['running'] == true,
        server = _s(j['connection'] is Map ? j['connection']['server'] : ''),
        database = _s(j['connection'] is Map ? j['connection']['database'] : ''),
        dbUser = _s(j['connection'] is Map ? j['connection']['user'] : ''),
        port = j['connection'] is Map ? _i(j['connection']['port']) : 0,
        intervalMinutes = _i(j['intervalMinutes']),
        windowDays = _i(j['windowDays']),
        counts = {for (final e in ((j['counts'] as Map?) ?? const {}).entries) '${e.key}': _i(e.value)},
        runs = _list(j['runs'], SyncRun.fromJson);
}

// ---------- Sohbet arşivi ----------

class ArchiveConversation {
  final int id, messageCount, deletedCount;
  final String type;
  final String? title, lastMessageAt;
  final List<UserRef> members;
  ArchiveConversation.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        type = _s(j['type']),
        title = _sn(j['title']),
        lastMessageAt = _sn(j['lastMessageAt']),
        members = _list(j['members'], UserRef.fromJson),
        messageCount = _i(j['messageCount']),
        deletedCount = _i(j['deletedCount']);

  String get displayTitle => type == 'group' ? (title ?? 'Grup') : members.map((m) => m.fullName).join(' ↔ ');
}

class ArchiveAttachment {
  final int id, size;
  final String fileName, mime;
  ArchiveAttachment.fromJson(Map<String, dynamic> j) : id = _i(j['id']), fileName = _s(j['fileName']), mime = _s(j['mime']), size = _i(j['size']);
}

class ArchiveRevision {
  final int id;
  final String body, createdAt;
  ArchiveRevision.fromJson(Map<String, dynamic> j) : id = _i(j['id']), body = _s(j['body']), createdAt = _s(j['createdAt']);
}

class ArchiveMessage {
  final int id;
  final String body, createdAt, senderName;
  final String? editedAt;
  String? deletedAt;
  final ArchiveAttachment? attachment;
  final List<ArchiveRevision> revisions;
  ArchiveMessage.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        body = _s(j['body']),
        createdAt = _s(j['createdAt']),
        editedAt = _sn(j['editedAt']),
        deletedAt = _sn(j['deletedAt']),
        senderName = _s(j['sender'] is Map ? j['sender']['fullName'] : ''),
        attachment = j['attachment'] is Map ? ArchiveAttachment.fromJson(Map<String, dynamic>.from(j['attachment'])) : null,
        revisions = _list(j['revisions'], ArchiveRevision.fromJson);
}
