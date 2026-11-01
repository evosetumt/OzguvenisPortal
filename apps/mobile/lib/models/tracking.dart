// Web lib/types-tracking.ts karşılığı (WhatsApp tipleri bu kapsamda değil).
import 'expenses.dart';

int? _i(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    ((v as List?) ?? const []).map((e) => f(Map<String, dynamic>.from(e as Map))).toList();
Map<String, dynamic>? _m(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : null;

const trackCategoryLabel = <String, String>{
  'insurance': 'Kasko / Sigorta',
  'vehicle_inspection': 'Araç muayene / vize',
  'vehicle_maintenance': 'Araç bakım',
  'commitment': 'Taahhütname',
  'contract': 'Sözleşme',
  'rent': 'Kira',
  'other': 'Diğer',
};
const trackStatusLabel = <String, String>{'active': 'Aktif', 'renewed': 'Yenilendi', 'cancelled': 'İptal', 'expired': 'Süresi doldu'};
const renewalPeriodLabel = <String, String>{
  'none': 'Yok', 'monthly': 'Aylık', 'quarterly': '3 aylık', 'semiannual': '6 aylık', 'yearly': 'Yıllık', 'biennial': '2 yıllık',
};

class VehicleRef {
  final int id;
  final String plate;
  final String? brandModel;
  VehicleRef({required this.id, required this.plate, this.brandModel});
  factory VehicleRef.fromJson(Map<String, dynamic> j) => VehicleRef(id: _i(j['id']) ?? 0, plate: j['plate'] ?? '', brandModel: j['brandModel']);
}

class TrackedItem {
  final int id, ownerId, daysLeft, fileCount;
  final int? vehicleId;
  final String category, title, endDate, currency, status, reminderDays;
  final String? counterparty, startDate, amount, renewalPeriod, notifyUserIds, notes;
  final UserRef owner;
  final VehicleRef? vehicle;
  TrackedItem({
    required this.id, required this.ownerId, required this.daysLeft, required this.fileCount, this.vehicleId, required this.category,
    required this.title, required this.endDate, required this.currency, required this.status, required this.reminderDays, this.counterparty,
    this.startDate, this.amount, this.renewalPeriod, this.notifyUserIds, this.notes, required this.owner, this.vehicle,
  });
  factory TrackedItem.fromJson(Map<String, dynamic> j) => TrackedItem(
        id: _i(j['id']) ?? 0,
        ownerId: _i(j['ownerId']) ?? 0,
        daysLeft: _i(j['daysLeft']) ?? 0,
        fileCount: _i(j['fileCount']) ?? 0,
        vehicleId: _i(j['vehicleId']),
        category: j['category'] ?? 'other',
        title: j['title'] ?? '',
        endDate: j['endDate'] ?? '',
        currency: j['currency'] ?? 'TRY',
        status: j['status'] ?? 'active',
        reminderDays: j['reminderDays'] ?? '',
        counterparty: j['counterparty'],
        startDate: j['startDate'],
        amount: j['amount']?.toString(),
        renewalPeriod: j['renewalPeriod'],
        notifyUserIds: j['notifyUserIds']?.toString(),
        notes: j['notes'],
        owner: UserRef.opt(j['owner']) ?? UserRef(id: 0, fullName: ''),
        vehicle: _m(j['vehicle']) == null ? null : VehicleRef.fromJson(_m(j['vehicle'])!),
      );
}

class Reminder {
  final int id, daysBefore;
  final String sentAt;
  Reminder({required this.id, required this.daysBefore, required this.sentAt});
  factory Reminder.fromJson(Map<String, dynamic> j) => Reminder(id: _i(j['id']) ?? 0, daysBefore: _i(j['daysBefore']) ?? 0, sentAt: j['sentAt'] ?? '');
}

class TrackedItemDetail extends TrackedItem {
  final List<FileRef> files;
  final List<UserRef> notifyUsers;
  final List<Reminder> reminders;
  final bool canEdit;
  TrackedItemDetail({
    required super.id, required super.ownerId, required super.daysLeft, required super.fileCount, super.vehicleId, required super.category,
    required super.title, required super.endDate, required super.currency, required super.status, required super.reminderDays,
    super.counterparty, super.startDate, super.amount, super.renewalPeriod, super.notifyUserIds, super.notes, required super.owner, super.vehicle,
    required this.files, required this.notifyUsers, required this.reminders, required this.canEdit,
  });
  factory TrackedItemDetail.fromJson(Map<String, dynamic> j) {
    final t = TrackedItem.fromJson(j);
    return TrackedItemDetail(
      id: t.id, ownerId: t.ownerId, daysLeft: t.daysLeft, fileCount: t.fileCount, vehicleId: t.vehicleId, category: t.category, title: t.title,
      endDate: t.endDate, currency: t.currency, status: t.status, reminderDays: t.reminderDays, counterparty: t.counterparty, startDate: t.startDate,
      amount: t.amount, renewalPeriod: t.renewalPeriod, notifyUserIds: t.notifyUserIds, notes: t.notes, owner: t.owner, vehicle: t.vehicle,
      files: _l(j['files'], FileRef.fromJson),
      notifyUsers: _l(j['notifyUsers'], UserRef.fromJson),
      reminders: _l(j['reminders'], Reminder.fromJson),
      canEdit: j['canEdit'] == true,
    );
  }
}

class TrackingSummary {
  final int active, in30, in7, expired;
  TrackingSummary({required this.active, required this.in30, required this.in7, required this.expired});
  factory TrackingSummary.fromJson(Map<String, dynamic> j) =>
      TrackingSummary(active: _i(j['active']) ?? 0, in30: _i(j['in30']) ?? 0, in7: _i(j['in7']) ?? 0, expired: _i(j['expired']) ?? 0);
}

class VehicleServiceRec {
  final int id;
  final String type, date;
  final int? km, nextDueKm;
  final String? cost, nextDueDate, notes;
  VehicleServiceRec({required this.id, required this.type, required this.date, this.km, this.cost, this.nextDueDate, this.nextDueKm, this.notes});
  factory VehicleServiceRec.fromJson(Map<String, dynamic> j) => VehicleServiceRec(
      id: _i(j['id']) ?? 0, type: j['type'] ?? '', date: j['date'] ?? '', km: _i(j['km']), cost: j['cost']?.toString(),
      nextDueDate: j['nextDueDate'], nextDueKm: _i(j['nextDueKm']), notes: j['notes']);
}

class Vehicle {
  final int id, itemCount;
  final String plate;
  final String? brandModel, notes;
  final int? year, km, assignedUserId;
  final UserRef? assignedUser;
  final VehicleServiceRec? lastService;
  final String? nextDueCategory, nextDueEndDate;
  final int? nextDueDaysLeft;
  Vehicle({
    required this.id, required this.itemCount, required this.plate, this.brandModel, this.notes, this.year, this.km, this.assignedUserId,
    this.assignedUser, this.lastService, this.nextDueCategory, this.nextDueEndDate, this.nextDueDaysLeft,
  });
  factory Vehicle.fromJson(Map<String, dynamic> j) {
    final nd = _m(j['nextDue']);
    return Vehicle(
      id: _i(j['id']) ?? 0,
      itemCount: _i(j['itemCount']) ?? 0,
      plate: j['plate'] ?? '',
      brandModel: j['brandModel'],
      notes: j['notes'],
      year: _i(j['year']),
      km: _i(j['km']),
      assignedUserId: _i(j['assignedUserId']),
      assignedUser: UserRef.opt(j['assignedUser']),
      lastService: _m(j['lastService']) == null ? null : VehicleServiceRec.fromJson(_m(j['lastService'])!),
      nextDueCategory: nd?['category'],
      nextDueEndDate: nd?['endDate'],
      nextDueDaysLeft: _i(nd?['daysLeft']),
    );
  }
}

class VehicleItemBrief {
  final int id, daysLeft;
  final String category, title, endDate, status;
  VehicleItemBrief({required this.id, required this.daysLeft, required this.category, required this.title, required this.endDate, required this.status});
  factory VehicleItemBrief.fromJson(Map<String, dynamic> j) => VehicleItemBrief(
      id: _i(j['id']) ?? 0, daysLeft: _i(j['daysLeft']) ?? 0, category: j['category'] ?? 'other', title: j['title'] ?? '', endDate: j['endDate'] ?? '', status: j['status'] ?? 'active');
}

class VehicleDetail {
  final int id;
  final String plate;
  final String? brandModel, notes;
  final int? year, km, assignedUserId;
  final UserRef? assignedUser;
  final List<VehicleServiceRec> services;
  final List<VehicleItemBrief> items;
  final bool canEdit;
  VehicleDetail({
    required this.id, required this.plate, this.brandModel, this.notes, this.year, this.km, this.assignedUserId, this.assignedUser,
    required this.services, required this.items, required this.canEdit,
  });
  factory VehicleDetail.fromJson(Map<String, dynamic> j) => VehicleDetail(
        id: _i(j['id']) ?? 0,
        plate: j['plate'] ?? '',
        brandModel: j['brandModel'],
        notes: j['notes'],
        year: _i(j['year']),
        km: _i(j['km']),
        assignedUserId: _i(j['assignedUserId']),
        assignedUser: UserRef.opt(j['assignedUser']),
        services: _l(j['services'], VehicleServiceRec.fromJson),
        items: _l(j['items'], VehicleItemBrief.fromJson),
        canEdit: j['canEdit'] == true,
      );
}
