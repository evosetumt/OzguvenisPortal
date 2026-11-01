// Web components/tracking/TrackedItemDrawer.tsx: kayıt ayrıntısı, yenileme, dosyalar.
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../models/tracking.dart';
import '../../widgets/glass.dart';
import '../expenses/files.dart';
import '../expenses/ui.dart';
import 'item_form.dart';

/// Kayıt çekmecesini açar; yenileme sonrası açılacak yeni kayıt kimliği zincirleme açılır.
Future<void> openTrackedItem(BuildContext context, int id, {required List<UserRef> users, required List<Vehicle> vehicles, required VoidCallback onChanged}) async {
  int? next = id;
  while (next != null && context.mounted) {
    next = await showGlassSheet<int>(context, builder: (c) => _ItemDrawer(itemId: next!, users: users, vehicles: vehicles, onChanged: onChanged));
  }
}

class _ItemDrawer extends StatefulWidget {
  const _ItemDrawer({required this.itemId, required this.users, required this.vehicles, required this.onChanged});
  final int itemId;
  final List<UserRef> users;
  final List<Vehicle> vehicles;
  final VoidCallback onChanged;
  @override
  State<_ItemDrawer> createState() => _ItemDrawerState();
}

class _ItemDrawerState extends State<_ItemDrawer> {
  String err = '';
  bool busy = false;

  Future<void> _run(Future<dynamic> Function() fn, Future<void> Function() reload) async {
    setState(() { err = ''; busy = true; });
    try {
      await fn();
      await reload();
      widget.onChanged();
    } catch (e) {
      if (mounted) err = errMsg(e);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _addFile(Future<void> Function() reload) async {
    final path = await pickFilePath(context);
    if (path == null) return;
    await _run(() async {
      final a = await uploadPath(path);
      await Api.i.post('/tracking/items/${widget.itemId}/files', {'attachmentId': a.id});
    }, reload);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final id = widget.itemId;
    return ApiView<TrackedItemDetail>(
      path: '/tracking/items/$id',
      decode: (j) => TrackedItemDetail.fromJson(Map<String, dynamic>.from(j)),
      builder: (c, it, reload) => SheetFrame(
        title: it.title,
        leading: '#$id · ${trackCategoryLabel[it.category] ?? it.category}',
        actions: [
          if (it.canEdit)
            IconButton(
              tooltip: 'Düzenle', icon: const Icon(LucideIcons.pencil, size: 18),
              onPressed: () async {
                final r = await showTrackedItemForm(c, item: it, users: widget.users, vehicles: widget.vehicles);
                if (r != null) { await reload(); widget.onChanged(); }
              },
            ),
          if (it.canEdit)
            IconButton(
              tooltip: 'Sil', icon: const Icon(LucideIcons.trash2, size: 18),
              onPressed: () async {
                if (!await confirmDialog(c, 'Kayıt silinsin mi?')) return;
                try {
                  await Api.i.delete('/tracking/items/$id');
                  widget.onChanged();
                  if (c.mounted) Navigator.pop(c);
                } catch (e) {
                  if (mounted) setState(() => err = errMsg(e));
                }
              },
            ),
        ],
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(spacing: 8, children: [DaysLeft(days: it.daysLeft, status: it.status), Chip2(trackStatusLabel[it.status] ?? it.status)]),
          if (err.isNotEmpty) errorNote(c, err),
          gap(8),
          KV('Karşı taraf', it.counterparty),
          if (it.vehicle != null) KV('Araç', '${it.vehicle!.plate}${it.vehicle!.brandModel != null ? ' · ${it.vehicle!.brandModel}' : ''}'),
          KV('Dönem', '${fmtDay(it.startDate)} – ${fmtDay(it.endDate)}'),
          KV('Yenileme', renewalPeriodLabel[it.renewalPeriod ?? 'none']),
          KV('Tutar', fmtMoney(it.amount, it.currency)),
          KV('Sorumlu', it.owner.fullName),
          KV('Bildirilecek', it.notifyUsers.isEmpty ? '—' : it.notifyUsers.map((u) => u.fullName).join(', ')),
          KV('Hatırlatma', '${it.reminderDays.split(',').join(', ')} gün kala'),
          if ((it.notes ?? '').isNotEmpty) ...[h4(c, 'Notlar'), Text(it.notes!, style: TextStyle(color: t.text))],
          if (it.canEdit) ...[
            gap(14),
            Wrap(spacing: 10, runSpacing: 10, children: [
              if (it.status != 'renewed' && it.status != 'cancelled')
                PillButton(
                  label: 'Yenile', icon: LucideIcons.refreshCw, primary: true,
                  onPressed: () async {
                    final next = await showGlassSheet<int>(c, builder: (x) => _RenewForm(item: it));
                    if (next != null) { widget.onChanged(); if (c.mounted) Navigator.pop(c, next); }
                  },
                ),
              if (it.status == 'active' || it.status == 'expired')
                PillButton(
                  label: 'İptal et',
                  onPressed: busy ? null : () async {
                    if (await confirmDialog(c, 'Kayıt iptal edilsin mi? Hatırlatmalar durur.')) await _run(() => Api.i.patch('/tracking/items/$id', {'status': 'cancelled'}), reload);
                  },
                ),
              if (it.status == 'cancelled') PillButton(label: 'Yeniden etkinleştir', onPressed: busy ? null : () => _run(() => Api.i.patch('/tracking/items/$id', {'status': 'active'}), reload)),
            ]),
          ],
          h4(c, 'Dosyalar'),
          if (it.files.isEmpty) emptyNote(c, 'Dosya yok'),
          for (final f in it.files)
            ListTile(
              dense: true, contentPadding: EdgeInsets.zero,
              leading: const Icon(LucideIcons.paperclip, size: 16),
              title: Text(f.fileName, overflow: TextOverflow.ellipsis),
              subtitle: Text(formatSize(f.size)),
              onTap: () => openFile(c, f.id, f.fileName, mime: f.mime),
              trailing: it.canEdit
                  ? IconButton(
                      icon: const Icon(LucideIcons.x, size: 16),
                      onPressed: () async {
                        if (await confirmDialog(c, 'Dosya kayıttan kaldırılsın mı?')) await _run(() => Api.i.delete('/tracking/items/$id/files/${f.id}'), reload);
                      },
                    )
                  : null,
            ),
          if (it.canEdit) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: busy ? null : () => _addFile(reload), icon: const Icon(LucideIcons.paperclip, size: 14), label: const Text('Dosya ekle'))),
          if (it.reminders.isNotEmpty) ...[
            h4(c, 'Gönderilen hatırlatmalar'),
            for (final r in it.reminders) TimelineRow(title: '${r.daysBefore} gün kala', sub: timeAgo(r.sentAt)),
          ],
        ]),
      ),
    );
  }
}

/// Web RenewForm. Yeni kaydın kimliğini döndürür.
class _RenewForm extends StatefulWidget {
  const _RenewForm({required this.item});
  final TrackedItemDetail item;
  @override
  State<_RenewForm> createState() => _RenewFormState();
}

class _RenewFormState extends State<_RenewForm> {
  String endDate = '', error = '';
  late final amount = TextEditingController(text: widget.item.amount ?? '');
  bool busy = false;

  @override
  void dispose() { amount.dispose(); super.dispose(); }

  Future<void> _submit() async {
    final auto = widget.item.renewalPeriod != null && widget.item.renewalPeriod != 'none';
    if (!auto && endDate.isEmpty) return setState(() => error = 'Yeni bitiş tarihi seçin');
    final amt = amount.text.trim().isEmpty ? null : num.tryParse(amount.text.trim().replaceAll(',', '.'));
    setState(() { busy = true; error = ''; });
    try {
      final r = await Api.i.post('/tracking/items/${widget.item.id}/renew', {if (endDate.isNotEmpty) 'endDate': endDate, 'amount': amt});
      if (mounted) Navigator.pop(context, (r as Map)['id'] as int);
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e, 'Yenilenemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final it = widget.item;
    final auto = it.renewalPeriod != null && it.renewalPeriod != 'none';
    return SheetFrame(
      title: 'Kaydı yenile',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Yeni dönem ${fmtDay(it.endDate)} tarihinden başlar; mevcut kayıt “Yenilendi” olarak kapanır.', style: TextStyle(color: t.text2)),
        gap(),
        DateF(
          label: 'Yeni bitiş${auto ? ' (boş: ${renewalPeriodLabel[it.renewalPeriod!]!.toLowerCase()} hesaplanır)' : ''}',
          value: endDate, clearable: true, onChanged: (v) => setState(() => endDate = v),
        ),
        gap(),
        TextF('Yeni tutar (${it.currency})', amount, decimal: true),
        if (error.isNotEmpty) errorNote(context, error),
        gap(16),
        Wrap(alignment: WrapAlignment.end, spacing: 10, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          PillButton(label: busy ? 'Yenileniyor…' : 'Yenile', primary: true, onPressed: busy ? null : _submit),
        ]),
      ]),
    );
  }
}
