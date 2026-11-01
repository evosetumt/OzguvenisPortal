// Web components/tracking/VehicleDrawer.tsx → VehicleForm ve ServiceForm.
import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../models/expenses.dart';
import '../../models/tracking.dart';
import '../../widgets/glass.dart';
import '../expenses/ui.dart';

Future<VehicleDetail?> showVehicleForm(BuildContext context, {VehicleDetail? vehicle, required List<UserRef> users}) =>
    showGlassSheet<VehicleDetail>(context, builder: (c) => _VehicleForm(vehicle: vehicle, users: users));

Future<bool?> showServiceForm(BuildContext context, {required int vehicleId, int? km}) =>
    showGlassSheet<bool>(context, builder: (c) => _ServiceForm(vehicleId: vehicleId, km: km));

class _VehicleForm extends StatefulWidget {
  const _VehicleForm({this.vehicle, required this.users});
  final VehicleDetail? vehicle;
  final List<UserRef> users;
  @override
  State<_VehicleForm> createState() => _VehicleFormState();
}

class _VehicleFormState extends State<_VehicleForm> {
  late final TextEditingController plate, brandModel, year, km, notes;
  late int? assignedUserId;
  String error = '';
  bool busy = false;

  @override
  void initState() {
    super.initState();
    final v = widget.vehicle;
    plate = TextEditingController(text: v?.plate ?? '');
    brandModel = TextEditingController(text: v?.brandModel ?? '');
    year = TextEditingController(text: v?.year != null ? '${v!.year}' : '');
    km = TextEditingController(text: v?.km != null ? '${v!.km}' : '');
    notes = TextEditingController(text: v?.notes ?? '');
    assignedUserId = v?.assignedUserId;
  }

  @override
  void dispose() {
    for (final c in [plate, brandModel, year, km, notes]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _submit() async {
    if (plate.text.trim().length < 2) return setState(() => error = 'Plaka yazın');
    setState(() { busy = true; error = ''; });
    final body = {
      'plate': plate.text,
      'brandModel': brandModel.text.isEmpty ? null : brandModel.text,
      'year': year.text.isEmpty ? null : int.tryParse(year.text),
      'assignedUserId': assignedUserId,
      'km': km.text.isEmpty ? null : int.tryParse(km.text),
      'notes': notes.text.isEmpty ? null : notes.text,
    };
    try {
      final v = widget.vehicle;
      final r = v != null ? await Api.i.patch('/tracking/vehicles/${v.id}', body) : await Api.i.post('/tracking/vehicles', body);
      if (mounted) Navigator.pop(context, VehicleDetail.fromJson(Map<String, dynamic>.from(r as Map)));
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Kaydedilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) => SheetFrame(
        title: widget.vehicle != null ? 'Aracı düzenle' : 'Yeni araç',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextF('Plaka', plate, maxLength: 20, hint: '34 ABC 123'),
          gap(),
          TextF('Marka / model', brandModel, maxLength: 120),
          gap(),
          Row(children: [
            Expanded(child: TextF('Model yılı', year, number: true)),
            const SizedBox(width: 10),
            Expanded(child: TextF('Kilometre', km, number: true)),
          ]),
          gap(),
          DropF<int?>(label: 'Zimmetli kişi', value: assignedUserId, items: [(null, '—'), for (final u in widget.users) (u.id, u.fullName)], onChanged: (v) => setState(() => assignedUserId = v)),
          gap(),
          TextF('Notlar', notes, lines: 2, maxLength: 1000),
          if (error.isNotEmpty) errorNote(context, error),
          gap(16),
          Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
            PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
            PillButton(label: busy ? 'Kaydediliyor…' : 'Kaydet', primary: true, onPressed: busy ? null : _submit),
          ]),
        ]),
      );
}

class _ServiceForm extends StatefulWidget {
  const _ServiceForm({required this.vehicleId, this.km});
  final int vehicleId;
  final int? km;
  @override
  State<_ServiceForm> createState() => _ServiceFormState();
}

class _ServiceFormState extends State<_ServiceForm> {
  late final type = TextEditingController(text: 'Periyodik bakım');
  late final km = TextEditingController(text: widget.km != null ? '${widget.km}' : '');
  final cost = TextEditingController(), nextDueKm = TextEditingController(), notes = TextEditingController();
  String date = todayKey(), nextDueDate = '', error = '';
  bool busy = false;

  @override
  void dispose() {
    for (final c in [type, km, cost, nextDueKm, notes]) { c.dispose(); }
    super.dispose();
  }

  Future<void> _submit() async {
    if (type.text.trim().isEmpty) return setState(() => error = 'İşlem yazın');
    setState(() { busy = true; error = ''; });
    try {
      await Api.i.post('/tracking/vehicles/${widget.vehicleId}/services', {
        'type': type.text,
        'date': date,
        'km': km.text.isEmpty ? null : int.tryParse(km.text),
        'cost': cost.text.isEmpty ? null : num.tryParse(cost.text.replaceAll(',', '.')),
        'nextDueDate': nextDueDate.isEmpty ? null : nextDueDate,
        'nextDueKm': nextDueKm.text.isEmpty ? null : int.tryParse(nextDueKm.text),
        'notes': notes.text.isEmpty ? null : notes.text,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Kaydedilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) => SheetFrame(
        title: 'Servis kaydı',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Autocomplete<String>(
            initialValue: TextEditingValue(text: type.text),
            optionsBuilder: (v) => const ['Periyodik bakım', 'Lastik değişimi', 'Yağ değişimi', 'Onarım', 'Hasar', 'Egzoz emisyon'].where((o) => o.toLowerCase().contains(v.text.toLowerCase())),
            onSelected: (v) => type.text = v,
            fieldViewBuilder: (c, ctrl, focus, _) => TextField(
              controller: ctrl, focusNode: focus, maxLength: 60,
              onChanged: (v) => type.text = v,
              decoration: const InputDecoration(labelText: 'İşlem', counterText: ''),
            ),
          ),
          gap(),
          DateF(label: 'Tarih', value: date, onChanged: (v) => setState(() => date = v)),
          gap(),
          Row(children: [
            Expanded(child: TextF('Kilometre', km, number: true)),
            const SizedBox(width: 10),
            Expanded(child: TextF('Tutar (TL)', cost, decimal: true)),
          ]),
          gap(),
          DateF(label: 'Sonraki bakım tarihi', value: nextDueDate, clearable: true, onChanged: (v) => setState(() => nextDueDate = v)),
          gap(),
          TextF('Sonraki bakım km', nextDueKm, number: true),
          gap(),
          TextF('Not', notes, lines: 2, maxLength: 1000),
          if (error.isNotEmpty) errorNote(context, error),
          gap(16),
          Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
            PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
            PillButton(label: busy ? 'Kaydediliyor…' : 'Kaydet', primary: true, onPressed: busy ? null : _submit),
          ]),
        ]),
      );
}
