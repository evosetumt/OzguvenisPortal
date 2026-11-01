import 'package:flutter/material.dart';
import '../../core/api.dart';
import 'common.dart';

/// Ödeme takibi: vadeden kaç gün önce görev açılacağı. payment.manage: all.
class PaymentSettings extends StatelessWidget {
  const PaymentSettings({super.key});
  @override
  Widget build(BuildContext context) => Loader<int>(
        path: '/payments/settings',
        decode: (j) => (j['defaultLeadDays'] as num?)?.toInt() ?? 0,
        builder: (c, d) => d.data == null ? errLine(c, d.error) : _Form(initial: d.data, onSaved: d.setData),
      );
}

class _Form extends StatefulWidget {
  const _Form({ required this.initial, required this.onSaved});
  final int? initial;
  final ValueChanged<int> onSaved;
  @override
  State<_Form> createState() => _FormState();
}

class _FormState extends State<_Form> {
  late final days = TextEditingController(text: widget.initial?.toString() ?? '');
  Note? msg;
  @override
  void dispose() { days.dispose(); super.dispose(); }

  Future<void> submit() async {
    final n = int.tryParse(days.text);
    if (n == null || n < 0 || n > 90) { setState(() => msg = const Note(false, '0-90 arası bir gün sayısı girin')); return; }
    setState(() => msg = null);
    try {
      final r = await Api.i.put('/payments/settings', {'defaultLeadDays': n});
      widget.onSaved((r['defaultLeadDays'] as num?)?.toInt() ?? n);
      msg = const Note(true, 'Kaydedildi; ön süresi gelen ödemelerin görevleri açıldı');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Kaydedilemedi');
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Panel(title: 'Ödeme takibi', children: [
        Fld('Vadeden kaç gün önce görev açılsın', days, keyboard: TextInputType.number),
        const Hint('Çek, kredi kartı, vergi gibi ödemelerin görevi bu kadar gün önce sorumlu birimin yöneticisine düşer; yönetici görevi istediği kişiye verir. Kayıtta ayrı bir süre girilmişse o geçerlidir.'),
        Align(alignment: Alignment.centerRight, child: smBtn('Kaydet', submit, primary: true)),
        noteView(msg),
      ]);
}
