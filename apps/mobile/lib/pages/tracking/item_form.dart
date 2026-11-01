// Web components/tracking/TrackedItemForm.tsx: süre takibi kaydı ekleme / düzenleme.
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../models/expenses.dart';
import '../../models/tracking.dart';
import '../../widgets/glass.dart';
import '../expenses/files.dart';
import '../expenses/ui.dart';

const _vehicleCats = ['insurance', 'vehicle_inspection', 'vehicle_maintenance'];

Future<TrackedItemDetail?> showTrackedItemForm(BuildContext context, {TrackedItemDetail? item, required List<UserRef> users, required List<Vehicle> vehicles, int? initialVehicleId}) =>
    showGlassSheet<TrackedItemDetail>(context, full: true, builder: (c) => TrackedItemForm(item: item, users: users, vehicles: vehicles, initialVehicleId: initialVehicleId));

class TrackedItemForm extends StatefulWidget {
  const TrackedItemForm({super.key, this.item, required this.users, required this.vehicles, this.initialVehicleId});
  final TrackedItemDetail? item;
  final List<UserRef> users;
  final List<Vehicle> vehicles;
  final int? initialVehicleId;
  @override
  State<TrackedItemForm> createState() => _TrackedItemFormState();
}

class _TrackedItemFormState extends State<TrackedItemForm> {
  late String category, currency, renewalPeriod, startDate, endDate;
  late int? vehicleId;
  late int ownerId;
  late final TextEditingController title, counterparty, amount, reminderDays, notes;
  late Set<int> notify;
  final files = <FileRef>[];
  String error = '';
  bool busy = false, uploading = false;

  @override
  void initState() {
    super.initState();
    final it = widget.item;
    category = it?.category ?? (widget.initialVehicleId != null ? 'vehicle_inspection' : 'contract');
    currency = it?.currency ?? 'TRY';
    renewalPeriod = it?.renewalPeriod ?? 'yearly';
    startDate = it?.startDate != null ? dateKey(it!.startDate!) : '';
    endDate = it != null ? dateKey(it.endDate) : '';
    vehicleId = it?.vehicleId ?? widget.initialVehicleId;
    ownerId = it?.ownerId ?? context.read<AuthController>().me!.id;
    title = TextEditingController(text: it?.title ?? '');
    counterparty = TextEditingController(text: it?.counterparty ?? '');
    amount = TextEditingController(text: it?.amount ?? '');
    reminderDays = TextEditingController(text: it?.reminderDays ?? '60,30,7,1');
    notes = TextEditingController(text: it?.notes ?? '');
    notify = {...?it?.notifyUsers.map((u) => u.id)};
  }

  @override
  void dispose() {
    for (final c in [title, counterparty, amount, reminderDays, notes]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _pick() async {
    final path = await pickFilePath(context);
    if (path == null) return;
    setState(() { uploading = true; error = ''; });
    try {
      final f = await uploadPath(path);
      if (mounted) setState(() => files.add(f));
    } catch (e) {
      if (mounted) setState(() => error = errMsg(e, 'Dosya yüklenemedi'));
    } finally {
      if (mounted) setState(() => uploading = false);
    }
  }

  Future<void> _submit() async {
    if (title.text.trim().isEmpty) return setState(() => error = 'Başlık yazın');
    if (endDate.isEmpty) return setState(() => error = 'Bitiş tarihi seçin');
    if (!RegExp(r'^\s*\d{1,3}(\s*,\s*\d{1,3}){0,9}\s*$').hasMatch(reminderDays.text)) return setState(() => error = 'Hatırlatma günlerini 60,30,7,1 biçiminde yazın');
    final amt = amount.text.trim().isEmpty ? null : num.tryParse(amount.text.trim().replaceAll(',', '.'));
    if (amount.text.trim().isNotEmpty && amt == null) return setState(() => error = 'Geçerli bir tutar girin');
    setState(() { busy = true; error = ''; });
    final body = {
      'category': category,
      'title': title.text,
      'counterparty': counterparty.text.isEmpty ? null : counterparty.text,
      'vehicleId': vehicleId,
      'startDate': startDate.isEmpty ? null : startDate,
      'endDate': endDate,
      'amount': amt,
      'currency': currency,
      'renewalPeriod': renewalPeriod,
      'ownerId': ownerId,
      'reminderDays': reminderDays.text,
      'notifyUserIds': notify.toList(),
      'notes': notes.text.isEmpty ? null : notes.text,
    };
    try {
      final it = widget.item;
      final r = it != null ? await Api.i.patch('/tracking/items/${it.id}', body) : await Api.i.post('/tracking/items', {...body, 'attachmentIds': files.map((x) => x.id).toList()});
      if (mounted) Navigator.pop(context, TrackedItemDetail.fromJson(Map<String, dynamic>.from(r as Map)));
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Kaydedilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final showVehicle = _vehicleCats.contains(category) || vehicleId != null;
    return SheetFrame(
      title: widget.item != null ? 'Kaydı düzenle' : 'Yeni süre takibi kaydı',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        DropF<String>(label: 'Tür', value: category, items: [for (final e in trackCategoryLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => category = v ?? category)),
        gap(),
        TextF('Başlık', title, maxLength: 200, hint: 'örn. Depo kira sözleşmesi'),
        gap(),
        TextF('Karşı taraf', counterparty, maxLength: 200, hint: 'Sigorta şirketi, kiraya veren…'),
        if (showVehicle) ...[
          gap(),
          DropF<int>(label: 'Araç', value: vehicleId, items: [for (final v in widget.vehicles) (v.id, '${v.plate}${v.brandModel != null ? ' · ${v.brandModel}' : ''}')], onChanged: (v) => setState(() => vehicleId = v)),
        ],
        gap(),
        Row(children: [
          Expanded(child: DateF(label: 'Başlangıç', value: startDate, clearable: true, onChanged: (v) => setState(() => startDate = v))),
          const SizedBox(width: 10),
          Expanded(child: DateF(label: 'Bitiş', value: endDate, onChanged: (v) => setState(() => endDate = v))),
        ]),
        gap(),
        DropF<String>(label: 'Yenileme', value: renewalPeriod, items: [for (final e in renewalPeriodLabel.entries) (e.key, e.value)], onChanged: (v) => setState(() => renewalPeriod = v ?? renewalPeriod)),
        gap(),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 3, child: TextF('Tutar', amount, decimal: true)),
          const SizedBox(width: 10),
          Expanded(flex: 2, child: DropF<String>(label: 'Para birimi', value: currency, items: [for (final c in const ['TRY', 'USD', 'EUR']) (c, c)], onChanged: (v) => setState(() => currency = v ?? 'TRY'))),
        ]),
        gap(),
        DropF<int>(label: 'Sorumlu', value: ownerId, items: [for (final u in widget.users) (u.id, u.fullName)], onChanged: (v) => setState(() => ownerId = v ?? ownerId)),
        gap(),
        TextF('Kaç gün kala hatırlatılsın', reminderDays, hint: '60,30,7,1'),
        h4(context, 'Ayrıca bildirilecekler'),
        Wrap(spacing: 8, runSpacing: 4, children: [
          for (final u in widget.users.where((u) => u.id != ownerId))
            FilterChip(label: Text(u.fullName), selected: notify.contains(u.id), onSelected: (s) => setState(() => s ? notify.add(u.id) : notify.remove(u.id))),
        ]),
        gap(),
        TextF('Notlar', notes, lines: 3, maxLength: 2000),
        if (widget.item == null) ...[
          h4(context, 'Dosyalar (poliçe, sözleşme…)'),
          for (final f in files)
            ListTile(
              dense: true, contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.paperclip, size: 16),
              title: Text(f.fileName, overflow: TextOverflow.ellipsis),
              trailing: IconButton(icon: const Icon(LucideIcons.x, size: 16), onPressed: () => setState(() => files.remove(f))),
            ),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: uploading ? null : _pick, icon: const Icon(LucideIcons.paperclip, size: 14), label: Text(uploading ? 'Yükleniyor…' : 'Dosya ekle'))),
        ],
        if (error.isNotEmpty) errorNote(context, error),
        gap(16),
        Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          PillButton(label: busy ? 'Kaydediliyor…' : 'Kaydet', primary: true, onPressed: busy || uploading ? null : _submit),
        ]),
      ]),
    );
  }
}
