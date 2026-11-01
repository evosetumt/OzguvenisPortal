// Web components/tracking/VehicleDrawer.tsx: araç çekmecesi (ayrıntı, süre takibi kayıtları, servis geçmişi).
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../models/tracking.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';
import 'item_drawer.dart';
import 'item_form.dart';
import 'vehicle_forms.dart';

Future<void> showVehicleDrawer(BuildContext context, int id, {required List<UserRef> users, required List<Vehicle> vehicles, required VoidCallback onChanged}) =>
    showGlassSheet<void>(context, builder: (c) => _VehicleDrawer(vehicleId: id, users: users, vehicles: vehicles, onChanged: onChanged));

class _VehicleDrawer extends StatefulWidget {
  const _VehicleDrawer({required this.vehicleId, required this.users, required this.vehicles, required this.onChanged});
  final int vehicleId;
  final List<UserRef> users;
  final List<Vehicle> vehicles;
  final VoidCallback onChanged;
  @override
  State<_VehicleDrawer> createState() => _VehicleDrawerState();
}

class _VehicleDrawerState extends State<_VehicleDrawer> {
  String err = '';

  Future<void> _run(Future<dynamic> Function() fn, Future<void> Function() reload) async {
    setState(() => err = '');
    try {
      await fn();
      await reload();
      widget.onChanged();
    } catch (e) {
      if (mounted) setState(() => err = errMsg(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final id = widget.vehicleId;
    return ApiView<VehicleDetail>(
      path: '/tracking/vehicles/$id',
      decode: (j) => VehicleDetail.fromJson(Map<String, dynamic>.from(j)),
      builder: (c, v, reload) => SheetFrame(
        title: v.plate,
        leading: 'Araç',
        actions: [
          if (v.canEdit)
            IconButton(
              tooltip: 'Düzenle', icon: const Icon(LucideIcons.pencil, size: 18),
              onPressed: () async {
                if (await showVehicleForm(c, vehicle: v, users: widget.users) != null) { await reload(); widget.onChanged(); }
              },
            ),
          if (v.canEdit)
            IconButton(
              tooltip: 'Sil', icon: const Icon(LucideIcons.trash2, size: 18),
              onPressed: () async {
                if (!await confirmDialog(c, 'Araç silinsin mi?')) return;
                try {
                  await Api.i.delete('/tracking/vehicles/$id');
                  widget.onChanged();
                  if (c.mounted) Navigator.pop(c);
                } catch (e) {
                  if (mounted) setState(() => err = errMsg(e));
                }
              },
            ),
        ],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (err.isNotEmpty) errorNote(c, err),
          KV('Marka / model', '${v.brandModel ?? '—'}${v.year != null ? ' (${v.year})' : ''}'),
          KV('Zimmetli', v.assignedUser?.fullName),
          KV('Kilometre', v.km != null ? '${fmtInt(v.km!)} km' : '—'),
          if ((v.notes ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(v.notes!, style: TextStyle(color: t.text))),
          h4(c, 'Süre takibi kayıtları',
              trailing: v.canEdit
                  ? TextButton.icon(
                      icon: const Icon(LucideIcons.plus, size: 14),
                      label: const Text('Ekle'),
                      onPressed: () async {
                        final r = await showTrackedItemForm(c, users: widget.users, vehicles: widget.vehicles, initialVehicleId: v.id);
                        if (r != null) {
                          await reload();
                          widget.onChanged();
                          if (c.mounted) await openTrackedItem(c, r.id, users: widget.users, vehicles: widget.vehicles, onChanged: () { reload(); widget.onChanged(); });
                        }
                      },
                    )
                  : null),
          if (v.items.isEmpty) emptyNote(c, 'Kayıt yok (kasko, muayene…)'),
          for (final i in v.items)
            InkWell(
              onTap: () => openTrackedItem(c, i.id, users: widget.users, vehicles: widget.vehicles, onChanged: () { reload(); widget.onChanged(); }),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${trackCategoryLabel[i.category]} · ${i.title}', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: t.accentInk)),
                      Text(fmtDay(i.endDate), style: TextStyle(fontSize: 12.5, color: t.text2)),
                    ]),
                  ),
                  DaysLeft(days: i.daysLeft, status: i.status),
                ]),
              ),
            ),
          h4(c, 'Servis geçmişi',
              trailing: v.canEdit
                  ? TextButton.icon(
                      icon: const Icon(LucideIcons.plus, size: 14),
                      label: const Text('Servis ekle'),
                      onPressed: () async {
                        if (await showServiceForm(c, vehicleId: v.id, km: v.km) == true) { await reload(); widget.onChanged(); }
                      },
                    )
                  : null),
          if (v.services.isEmpty) emptyNote(c, 'Servis kaydı yok'),
          for (final s in v.services)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.type, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: t.text)),
                    Text('${fmtDay(s.date)}${s.km != null ? ' · ${fmtInt(s.km!)} km' : ''}${s.cost != null && s.cost!.isNotEmpty ? ' · ${fmtMoney(s.cost)}' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                    if (s.nextDueDate != null || s.nextDueKm != null)
                      Text('Sonraki: ${s.nextDueDate != null ? fmtDay(s.nextDueDate) : ''}${s.nextDueKm != null ? ' / ${fmtInt(s.nextDueKm!)} km' : ''}', style: TextStyle(fontSize: 12.5, color: t.text2)),
                    if ((s.notes ?? '').isNotEmpty) Text(s.notes!, style: TextStyle(fontSize: 12.5, color: t.text2)),
                  ]),
                ),
                if (v.canEdit)
                  IconButton(
                    tooltip: 'Sil', visualDensity: VisualDensity.compact, icon: const Icon(LucideIcons.trash2, size: 14),
                    onPressed: () async {
                      if (await confirmDialog(c, 'Servis kaydı silinsin mi?')) await _run(() => Api.i.delete('/tracking/services/${s.id}'), reload);
                    },
                  ),
              ]),
            ),
        ]),
      ),
    );
  }
}
