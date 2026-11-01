// Web pages/TrackingPage.tsx: kasko, sigorta, muayene, bakım, taahhüt, sözleşme ve kira bitişleri (süre takibi).
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/expenses.dart';
import '../models/tracking.dart';
import '../widgets/glass.dart';
import 'package:provider/provider.dart';
import 'expenses/ui.dart';
import 'tracking/item_drawer.dart';
import 'tracking/item_form.dart';
import 'tracking/vehicle_drawer.dart';
import 'tracking/vehicle_forms.dart';

List<T> _list<T>(dynamic j, T Function(Map<String, dynamic>) f) => (j as List).map((e) => f(Map<String, dynamic>.from(e))).toList();

class TrackingPage extends StatefulWidget {
  const TrackingPage({super.key});
  @override
  State<TrackingPage> createState() => _TrackingPageState();
}

class _TrackingPageState extends State<TrackingPage> {
  String tab = 'items', category = '', status = 'active', q = '';
  Timer? _deb;
  late final ApiData<List<TrackedItem>> items;
  late final ApiData<TrackingSummary> summary;
  late final ApiData<List<Vehicle>> vehicles;
  late final ApiData<List<UserRef>> users;

  String get _path {
    final p = {if (category.isNotEmpty) 'category': category, if (status.isNotEmpty) 'status': status, if (q.isNotEmpty) 'q': q};
    return '/tracking/items?${Uri(queryParameters: p).query}';
  }

  @override
  void initState() {
    super.initState();
    items = ApiData(_path, decode: (j) => _list(j, TrackedItem.fromJson));
    summary = ApiData('/tracking/summary', decode: (j) => TrackingSummary.fromJson(Map<String, dynamic>.from(j)));
    vehicles = ApiData('/tracking/vehicles', decode: (j) => _list(j, Vehicle.fromJson));
    users = ApiData('/users/directory', decode: (j) => _list(j, UserRef.fromJson));
  }

  @override
  void dispose() {
    _deb?.cancel();
    for (final d in [items, summary, vehicles, users]) { d.dispose(); }
    super.dispose();
  }

  void _refresh() { items.reload(); summary.reload(); vehicles.reload(); }
  void _reQuery() => items.setPath(_path);
  List<UserRef> get _users => users.data ?? [];
  List<Vehicle> get _vehicles => vehicles.data ?? [];

  void _openItem(int id) => openTrackedItem(context, id, users: _users, vehicles: _vehicles, onChanged: _refresh);

  Future<void> _newItem() async {
    final r = await showTrackedItemForm(context, users: _users, vehicles: _vehicles);
    if (r != null) { _refresh(); _openItem(r.id); }
  }

  Future<void> _newVehicle() async {
    final v = await showVehicleForm(context, users: _users);
    if (v != null && mounted) { _refresh(); showVehicleDrawer(context, v.id, users: _users, vehicles: _vehicles, onChanged: _refresh); }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final canWrite = context.read<AuthController>().can('tracking.write');
    return ListenableBuilder(
      listenable: Listenable.merge([items, summary, vehicles, users]),
      builder: (c, _) {
        final s = summary.data;
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          PageHead(
            title: 'Süre Takibi',
            sub: 'Kasko, sigorta, muayene, bakım, taahhüt, sözleşme ve kira bitişleri',
            actions: [
              if (canWrite && users.data != null)
                tab == 'items'
                    ? PillButton(label: 'Kayıt', icon: LucideIcons.plus, primary: true, onPressed: _newItem)
                    : PillButton(label: 'Araç', icon: LucideIcons.plus, primary: true, onPressed: _newVehicle),
            ],
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async { await Future.wait([items.reload(), summary.reload(), vehicles.reload()]); },
              child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                statGrid([
                  StatTile(label: 'Aktif', child: statNumber(c, s?.active)),
                  StatTile(label: '30 gün içinde', child: statNumber(c, s?.in30)),
                  StatTile(label: '7 gün içinde', child: statNumber(c, s?.in7, color: (s?.in7 ?? 0) > 0 ? t.danger : null)),
                  StatTile(label: 'Süresi dolan', child: statNumber(c, s?.expired, color: (s?.expired ?? 0) > 0 ? t.danger : null)),
                ]),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Seg<String>(items: const [('items', 'Kayıtlar'), ('vehicles', 'Araçlar')], value: tab, onChanged: (v) => setState(() => tab = v)),
                ),
                if (tab == 'items') ..._itemsView(c) else ..._vehiclesView(c),
              ]),
            ),
          ),
        ]);
      },
    );
  }

  List<Widget> _itemsView(BuildContext c) {
    final t = c.tk;
    final rows = items.data;
    return [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: [
          SearchF(hint: 'Başlık, karşı taraf veya plaka ara…', onChanged: (v) {
            _deb?.cancel();
            _deb = Timer(const Duration(milliseconds: 300), () { q = v.trim(); _reQuery(); });
          }),
          gap(10),
          Row(children: [
            Expanded(child: DropF<String>(label: 'Tür', value: category, items: [('', 'Tüm türler'), for (final e in trackCategoryLabel.entries) (e.key, e.value)], onChanged: (v) { setState(() => category = v ?? ''); _reQuery(); })),
            const SizedBox(width: 10),
            Expanded(child: DropF<String>(label: 'Durum', value: status, items: [('', 'Tüm durumlar'), for (final e in trackStatusLabel.entries) (e.key, e.value)], onChanged: (v) { setState(() => status = v ?? ''); _reQuery(); })),
          ]),
        ]),
      ),
      gap(10),
      if (items.error.isNotEmpty && rows == null) Padding(padding: const EdgeInsets.all(16), child: errorNote(c, items.error)),
      if (rows == null && items.error.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      if (rows != null && rows.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Kayıt yok', style: TextStyle(color: t.text3)))),
      for (final i in rows ?? <TrackedItem>[])
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Glass(
            radius: 18,
            onTap: () => _openItem(i.id),
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: i.title),
                    if (i.fileCount > 0) WidgetSpan(alignment: PlaceholderAlignment.middle, child: Padding(padding: const EdgeInsets.only(left: 6), child: Icon(LucideIcons.paperclip, size: 13, color: t.text2))),
                  ]), style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text)),
                ),
                const SizedBox(width: 8),
                DaysLeft(days: i.daysLeft, status: i.status),
              ]),
              const SizedBox(height: 6),
              Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
                Chip2(trackCategoryLabel[i.category] ?? i.category),
                if (i.vehicle != null) Chip2(i.vehicle!.plate),
                Text('Bitiş ${fmtDay(i.endDate)}', style: TextStyle(fontSize: 13, color: t.text2)),
              ]),
              const SizedBox(height: 6),
              Text('${i.counterparty ?? '—'} · ${fmtMoney(i.amount, i.currency)} · ${i.owner.fullName}', style: TextStyle(fontSize: 13, color: t.text2)),
            ]),
          ),
        ),
    ];
  }

  List<Widget> _vehiclesView(BuildContext c) {
    final t = c.tk;
    final rows = vehicles.data;
    return [
      if (rows == null) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      if (rows != null && rows.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Araç yok', style: TextStyle(color: t.text3)))),
      for (final v in rows ?? <Vehicle>[])
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Glass(
            radius: 18,
            onTap: () => showVehicleDrawer(context, v.id, users: _users, vehicles: _vehicles, onChanged: _refresh),
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(LucideIcons.car, size: 18, color: t.text2),
                const SizedBox(width: 8),
                Expanded(child: Text(v.plate, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text))),
                if (v.nextDueDaysLeft != null) DaysLeft(days: v.nextDueDaysLeft!),
              ]),
              const SizedBox(height: 6),
              Text('${v.brandModel ?? '—'}${v.year != null ? ' (${v.year})' : ''} · ${v.assignedUser?.fullName ?? '—'}', style: TextStyle(fontSize: 13, color: t.text2)),
              Text('Kilometre: ${v.km != null ? fmtInt(v.km!) : '—'}', style: TextStyle(fontSize: 13, color: t.text2)),
              Text('Son servis: ${v.lastService != null ? '${v.lastService!.type} · ${fmtDay(v.lastService!.date)}' : '—'}', style: TextStyle(fontSize: 13, color: t.text2)),
              if (v.nextDueCategory != null) Text('Yaklaşan: ${trackCategoryLabel[v.nextDueCategory] ?? v.nextDueCategory}', style: TextStyle(fontSize: 13, color: t.text2)),
            ]),
          ),
        ),
    ];
  }
}
