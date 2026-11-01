import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../models/settings.dart';
import 'common.dart';

List<ExpenseCategory> _cats(dynamic j) =>
    ((j as List?) ?? const []).whereType<Map>().map((e) => ExpenseCategory.fromJson(Map<String, dynamic>.from(e))).toList();

/// Masraf eşiği, onay hatırlatma süresi, kategoriler ve Jev kategori önerisi (muhasebe veya kullanıcı yöneticisi).
class ExpenseSettings extends StatefulWidget {
  const ExpenseSettings({super.key});
  @override
  State<ExpenseSettings> createState() => _ExpenseSettingsState();
}

class _ExpenseSettingsState extends State<ExpenseSettings> {
  late final s = ApiData<ExpenseSettingsData>('/expense-settings', decode: (j) => ExpenseSettingsData.fromJson(Map<String, dynamic>.from(j as Map)));
  late final cats = ApiData<List<ExpenseCategory>>('/expense-categories?all=1', decode: _cats);
  final limit = TextEditingController(), hours = TextEditingController(), newCat = TextEditingController();
  Note? msg;

  @override
  void initState() {
    super.initState();
    s.addListener(_fill);
  }

  bool _filled = false;
  void _fill() {
    final d = s.data;
    if (d == null) return;
    // Web: veri her değiştiğinde alanlar yeniden doldurulur.
    limit.text = '${d.autoApproveLimit}';
    hours.text = '${d.approvalReminderHours}';
    _filled = true;
  }

  @override
  void dispose() {
    s.removeListener(_fill);
    s.dispose(); cats.dispose(); limit.dispose(); hours.dispose(); newCat.dispose();
    super.dispose();
  }

  Future<void> save(Map<String, dynamic> body) async {
    setState(() => msg = null);
    try {
      s.setData(ExpenseSettingsData.fromJson(Map<String, dynamic>.from(await Api.i.put('/expense-settings', body) as Map)));
      msg = const Note(true, 'Kaydedildi');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Kaydedilemedi');
    }
    if (mounted) setState(() {});
  }

  void submit() {
    final l = num.tryParse(limit.text.replaceAll(',', '.'));
    final h = int.tryParse(hours.text);
    if (l == null || l < 0 || h == null || h < 1 || h > 720) {
      setState(() => msg = const Note(false, 'Geçerli bir eşik ve 1-720 arası saat girin'));
      return;
    }
    save({'autoApproveLimit': l, 'approvalReminderHours': h});
  }

  Future<void> toggleAi(bool on) async {
    if (on && !await confirmDialog(context, 'Açılırsa masraf açıklamaları kategori önerisi için TypeSafe (şirket dışı bir yapay zekâ servisi) sunucularına gönderilir. Onaylıyor musunuz?')) return;
    save({'aiCategorySuggest': on});
  }

  Future<void> addCat() async {
    if (newCat.text.trim().isEmpty) return;
    try {
      await Api.i.post('/expense-categories', {'name': newCat.text, 'sortOrder': cats.data?.length ?? 0});
      newCat.clear();
      cats.reload();
    } catch (e) {
      if (mounted) setState(() => msg = Note(false, e is ApiError ? e.message : 'Eklenemedi'));
    }
  }

  Future<void> toggleCat(ExpenseCategory c) async {
    try { await Api.i.patch('/expense-categories/${c.id}', {'isActive': !c.isActive}); } catch (_) {}
    cats.reload();
  }

  @override
  Widget build(BuildContext context) {
    if (!_filled) _fill();
    return ListenableBuilder(
      listenable: Listenable.merge([s, cats]),
      builder: (c, _) => Panel(title: 'Masraf onayı', children: [
        Fld('Otomatik onay eşiği (TL)', limit, keyboard: const TextInputType.numberWithOptions(decimal: true)),
        Fld('Onay hatırlatma süresi (saat)', hours, keyboard: TextInputType.number),
        const Hint('Eşik ve altındaki masraflar yönetici onayı olmadan muhasebeye düşer. Süreç akışı Akış Tasarımcısı\'ndan değiştirilebilir.'),
        Align(alignment: Alignment.centerRight, child: smBtn('Kaydet', submit, primary: true)),
        const H4('Kategoriler'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final x in cats.data ?? const <ExpenseCategory>[]) ChipBtn(x.name, x.isActive, () => toggleCat(x)),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: TextField(controller: newCat, maxLength: 80, onChanged: (_) => setState(() {}), onSubmitted: (_) => addCat(),
              decoration: const InputDecoration(hintText: 'Yeni kategori', counterText: ''))),
          const SizedBox(width: 8),
          smBtn('Ekle', newCat.text.trim().isEmpty ? null : addCat, primary: true),
        ]),
        const H4('Yapay zekâ ile kategori önerisi'),
        CheckRow('Masraf açıklamasından kategori öner (TypeSafe Jev)', s.data?.aiCategorySuggest == true, s.data?.aiAvailable == true ? toggleAi : null),
        Hint(s.data?.aiAvailable == true
            ? 'Açıkken masraf açıklaması (ve tutar) şirket dışındaki TypeSafe servisine gönderilir; fiş görseli gönderilmez. Varsayılan kapalıdır.'
            : 'Sunucuda TYPESAFE_API_KEY tanımlı değil; özellik kullanılamaz.'),
        noteView(msg),
      ]),
    );
  }
}
