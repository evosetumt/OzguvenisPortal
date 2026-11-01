// Web components/workflow/ExpenseForm.tsx: masraf girişi (fiş: image_picker / file_picker + Api.i.upload).
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/expenses.dart';
import '../../widgets/glass.dart';
import 'files.dart';
import 'ui.dart';

const _currencies = ['TRY', 'USD', 'EUR', 'GBP'];

/// Form sayfasını açar; kaydedilen masrafı döndürür (vazgeçildiyse null).
Future<ExpenseDetail?> showExpenseForm(BuildContext context, {ExpenseDetail? expense}) =>
    showGlassSheet<ExpenseDetail>(context, full: true, builder: (c) => ExpenseForm(expense: expense));

class ExpenseForm extends StatefulWidget {
  const ExpenseForm({super.key, this.expense});
  final ExpenseDetail? expense;
  @override
  State<ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends State<ExpenseForm> {
  List<ExpenseCategory>? cats;
  ExpenseSettingsData? settings;
  late final TextEditingController amount, amountTry, desc;
  int? categoryId;
  String currency = 'TRY', date = '';
  late List<FileRef> files;
  bool busy = false, uploading = false, suggesting = false;
  String err = '';
  CategorySuggestion? suggestion;

  bool get aiOn => settings != null && settings!.aiCategorySuggest && settings!.aiAvailable;

  @override
  void initState() {
    super.initState();
    final e = widget.expense;
    categoryId = e?.categoryId;
    amount = TextEditingController(text: e == null ? '' : '${e.amount}');
    currency = e?.currency ?? 'TRY';
    amountTry = TextEditingController(text: e != null && e.currency != 'TRY' ? '${e.amountTry}' : '');
    date = e != null ? dateKey(e.expenseDate) : todayKey();
    desc = TextEditingController(text: e?.description ?? '');
    files = [...?e?.receipts];
    _load();
  }

  @override
  void dispose() {
    amount.dispose(); amountTry.dispose(); desc.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final c = await Api.i.get('/expense-categories') as List;
      final s = await Api.i.get('/expense-settings');
      if (!mounted) return;
      setState(() {
        cats = c.map((e) => ExpenseCategory.fromJson(Map<String, dynamic>.from(e))).toList();
        settings = ExpenseSettingsData.fromJson(Map<String, dynamic>.from(s));
      });
    } catch (e) {
      if (mounted) setState(() => err = errMsg(e, 'Yüklenemedi'));
    }
  }

  Future<void> _suggest({bool auto = false}) async {
    if (!aiOn || desc.text.trim().length < 3 || (auto && categoryId != null)) return;
    setState(() => suggesting = true);
    try {
      final s = CategorySuggestion.fromJson(Map<String, dynamic>.from(await Api.i.post('/expenses/suggest-category', {'description': desc.text}) as Map));
      if (!mounted) return;
      setState(() {
        suggestion = s;
        if (auto && s.categoryId != null && categoryId == null) categoryId = s.categoryId;
      });
    } catch (_) {
      if (mounted) setState(() => suggestion = null);
    } finally {
      if (mounted) setState(() => suggesting = false);
    }
  }

  Future<void> _addFile() async {
    final path = await pickFilePath(context);
    if (path == null) return;
    setState(() { uploading = true; err = ''; });
    try {
      final up = await uploadPath(path);
      if (mounted) setState(() => files = [...files, up]);
    } catch (e) {
      if (mounted) setState(() => err = errMsg(e, 'Dosya yüklenemedi'));
    } finally {
      if (mounted) setState(() => uploading = false);
    }
  }

  num _num(String s) => num.tryParse(s.trim().replaceAll(',', '.')) ?? double.nan;

  Future<void> _save(bool submit) async {
    final a = _num(amount.text);
    if (desc.text.trim().length < 2) return setState(() => err = 'Açıklama yazın');
    if (categoryId == null) return setState(() => err = 'Kategori seçin');
    if (a.isNaN || a <= 0) return setState(() => err = 'Geçerli bir tutar girin');
    if (currency != 'TRY' && _num(amountTry.text).isNaN) return setState(() => err = 'TL karşılığını girin');
    setState(() { busy = true; err = ''; });
    final body = {
      'categoryId': categoryId,
      'amount': a,
      'currency': currency,
      if (currency != 'TRY') 'amountTry': _num(amountTry.text),
      'expenseDate': date,
      'description': desc.text,
      'receiptIds': files.map((x) => x.id).toList(),
    };
    try {
      final ex = widget.expense;
      var saved = Map<String, dynamic>.from((ex != null ? await Api.i.patch('/expenses/${ex.id}', body) : await Api.i.post('/expenses', body)) as Map);
      if (submit) saved = Map<String, dynamic>.from(await Api.i.post('/expenses/${saved['id']}/submit') as Map);
      if (mounted) Navigator.pop(context, ExpenseDetail.fromJson(saved));
    } catch (e) {
      if (mounted) setState(() { err = errMsg(e, 'Kaydedilemedi'); busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final suggestedName = suggestion?.categoryId == null ? null : cats?.where((c) => c.id == suggestion!.categoryId).firstOrNull?.name;
    return SheetFrame(
      title: widget.expense != null ? 'Masraf #${widget.expense!.id}' : 'Yeni masraf',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextF('Açıklama', desc, lines: 2, maxLength: 500, hint: 'Örn. Ankara müşteri ziyareti, otel 1 gece', onBlur: () => _suggest(auto: true)),
        gap(),
        DropF<int>(label: 'Kategori', value: categoryId, items: [for (final c in cats ?? <ExpenseCategory>[]) (c.id, c.name)], onChanged: (v) => setState(() => categoryId = v)),
        gap(),
        DateF(label: 'Tarih', value: date, max: DateTime.now(), onChanged: (v) => setState(() => date = v)),
        if (aiOn) ...[
          gap(8),
          Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 10, children: [
            TextButton.icon(
              onPressed: suggesting || desc.text.trim().length < 3 ? null : () => _suggest(),
              icon: const Icon(LucideIcons.sparkles, size: 14),
              label: Text(suggesting ? 'Öneriliyor…' : 'Kategori öner'),
            ),
            if (suggestion != null)
              if (suggestedName != null) ...[
                Text.rich(TextSpan(children: [const TextSpan(text: 'Öneri: '), TextSpan(text: suggestedName, style: const TextStyle(fontWeight: FontWeight.w700))]), style: TextStyle(color: t.text2)),
                if (suggestion!.categoryId != categoryId) TextButton(onPressed: () => setState(() => categoryId = suggestion!.categoryId), child: const Text('Uygula')),
              ] else Text('Açıklamadan kategori çıkarılamadı', style: TextStyle(color: t.text2)),
          ]),
        ],
        gap(),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(flex: 3, child: TextF('Tutar', amount, decimal: true, hint: '0,00')),
          const SizedBox(width: 10),
          Expanded(flex: 2, child: DropF<String>(label: 'Para birimi', value: currency, items: [for (final c in _currencies) (c, c)], onChanged: (v) => setState(() => currency = v ?? 'TRY'))),
        ]),
        if (currency != 'TRY') ...[gap(), TextF('TL karşılığı', amountTry, decimal: true)],
        h4(context, 'Fiş / belge'),
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final f in files) ReceiptThumb(file: f, onRemove: () => setState(() => files = files.where((x) => x.id != f.id).toList())),
          if (files.length < 10)
            GestureDetector(
              onTap: uploading ? null : _addFile,
              child: Container(
                width: 84, height: 84,
                decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14), border: Border.all(color: t.sep)),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  uploading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(LucideIcons.paperclip, size: 20, color: t.text2),
                  const SizedBox(height: 4),
                  Text(uploading ? 'Yükleniyor…' : 'Ekle', style: TextStyle(fontSize: 12, color: t.text2)),
                ]),
              ),
            ),
        ]),
        if (settings != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text('${fmtInt(settings!.autoApproveLimit)} TL ve altındaki masraflar otomatik onaylanıp muhasebeye gider.', style: TextStyle(fontSize: 13, color: t.text2)),
          ),
        if (err.isNotEmpty) errorNote(context, err),
        gap(16),
        Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 10, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          PillButton(label: 'Taslak kaydet', onPressed: busy || uploading ? null : () => _save(false)),
          PillButton(label: 'Onaya gönder', primary: true, busy: busy, onPressed: busy || uploading || files.isEmpty ? null : () => _save(true)),
        ]),
        if (files.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Onaya göndermek için önce fiş ekleyin', textAlign: TextAlign.end, style: TextStyle(fontSize: 12.5, color: t.text3))),
      ]),
    );
  }
}
