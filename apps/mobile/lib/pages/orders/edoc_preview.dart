import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/erp.dart';
import '../../widgets/glass.dart';
import 'erp_ui.dart';
import 'edoc_web.dart';
import 'xml_mini.dart';

/// e-Fatura / e-Arşiv önizleme. Mobilde tarayıcı/XSLT yoktur: faturanın UBL XML'inden özet görünüm
/// (taraflar, satırlar, toplamlar) üretilir; asıl XML panoya kopyalanabilir.
Future<void> showEDocumentPreview(BuildContext context, {required String customerCode, required String docNo}) =>
    showGlassSheet(context, full: true, builder: (c) => EDocumentPreview(customerCode: customerCode, docNo: docNo));

final _n2 = NumberFormat('#,##0.00', 'tr_TR');

class EDocumentPreview extends StatefulWidget {
  const EDocumentPreview({super.key, required this.customerCode, required this.docNo});
  final String customerCode, docNo;
  @override
  State<EDocumentPreview> createState() => _EDocumentPreviewState();
}

class _EDocumentPreviewState extends State<EDocumentPreview> {
  EDocument? doc;
  XNode? xml;
  String error = '';
  bool official = true; // resmi şablon; başarısızsa özet görünüm

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final j = await Api.i.get('/erp/customers/${Uri.encodeComponent(widget.customerCode)}/edocs/${Uri.encodeComponent(widget.docNo)}');
      final d = EDocument.fromJson(Map<String, dynamic>.from(j as Map));
      if (!mounted) return;
      final x = parseXml(d.xml);
      setState(() {
        doc = d;
        xml = x;
        if (x == null) error = "Fatura XML'i okunamadı";
      });
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Belge açılamadı');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final d = doc;
    final title = d != null
        ? '${d.source == 'earsiv' ? 'e-Arşiv' : 'e-Fatura'} · ${d.direction == 'sales' ? 'Faturamız' : 'Faturanız'} · ${d.gibNo ?? d.docNo}'
        : 'e-Belge · ${widget.docNo}';
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
        child: Row(children: [
          Expanded(child: Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: t.text))),
          IconButton(tooltip: 'Kapat', icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
        ]),
      ),
      Expanded(
        child: error.isNotEmpty
            ? ErrorNote(error)
            : (xml == null
                ? const EmptyNote('Belge yükleniyor…')
                : (official
                    ? Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                        child: EDocWebView(xml: d!.xml, onFail: () { if (mounted) setState(() => official = false); }),
                      )
                    : _body(context, d!, xml!))),
      ),
    ]);
  }

  String _cur(XNode? el) => el == null ? '' : '${_n2.format(double.tryParse(el.text) ?? 0)} ${el.attrs['currencyID'] ?? ''}'.trim();

  String _party(XNode root, String role) {
    final p = root.first(role);
    if (p == null) return '';
    final name = p.at(['PartyName', 'Name']).isNotEmpty
        ? p.at(['PartyName', 'Name'])
        : '${p.at(['Person', 'FirstName'])} ${p.at(['Person', 'FamilyName'])}'.trim();
    final ids = p.descendants('PartyIdentification').map((i) {
      final id = i.first('ID');
      return id == null ? '' : '${id.attrs['schemeID'] ?? ''} ${id.text}'.trim();
    }).where((s) => s.isNotEmpty).join(' · ');
    final addr = [p.at(['PostalAddress', 'StreetName']), p.at(['PostalAddress', 'CitySubdivisionName']), p.at(['PostalAddress', 'CityName'])].where((s) => s.isNotEmpty).join(', ');
    final office = p.at(['PartyTaxScheme', 'TaxScheme', 'Name']);
    return [name, ids, if (office.isNotEmpty) 'VD: $office', addr].where((s) => s.isNotEmpty).join('\n');
  }

  Widget _body(BuildContext context, EDocument d, XNode x) {
    final t = context.tk;
    final lines = x.descendants('InvoiceLine').toList();
    final total = x.first('LegalMonetaryTotal');
    final taxTotal = x.children.where((c) => c.name == 'TaxTotal').firstOrNull;
    Widget row(String k, String v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [
            Expanded(child: Text(k, style: TextStyle(color: t.text2, fontWeight: bold ? FontWeight.w700 : FontWeight.w400))),
            Text(v, style: TextStyle(color: t.text, fontWeight: bold ? FontWeight.w700 : FontWeight.w500)),
          ]),
        );
    Widget box(String label, String body) => Container(
          width: double.infinity, margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 12, color: t.text2)),
            const SizedBox(height: 4),
            Text(body, style: TextStyle(color: t.text, height: 1.4)),
          ]),
        );
    return ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 24), children: [
      Text('${d.customerName} · özet görünüm (faturada resmi şablon yok)', style: TextStyle(fontSize: 12.5, color: t.text2)),
      const SizedBox(height: 10),
      Text('${x.at(['ProfileID'])} · ${x.at(['InvoiceTypeCode'])} Fatura'.trim(), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text)),
      Text('No: ${x.child('ID')?.text ?? ''} · Tarih: ${x.child('IssueDate')?.text ?? ''}\nETTN: ${x.child('UUID')?.text ?? ''}', style: TextStyle(fontSize: 13, color: t.text2, height: 1.4)),
      const SizedBox(height: 12),
      box('Satıcı', _party(x, 'AccountingSupplierParty')),
      box('Alıcı', _party(x, 'AccountingCustomerParty')),
      const SectionTitle('Kalemler'),
      for (final l in lines)
        Container(
          margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.at(['Item', 'Name']), style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
            const SizedBox(height: 6),
            Builder(builder: (_) {
              final q = l.child('InvoicedQuantity');
              return Text('${q?.text ?? ''} ${q?.attrs['unitCode'] ?? ''} × ${_cur(l.first('Price')?.first('PriceAmount'))}', style: TextStyle(fontSize: 13, color: t.text2));
            }),
            Text(_cur(l.child('LineExtensionAmount')), style: TextStyle(fontWeight: FontWeight.w700, color: t.text)),
          ]),
        ),
      const SizedBox(height: 8),
      row('Mal/hizmet toplamı', _cur(total?.first('LineExtensionAmount'))),
      row('Hesaplanan vergiler', _cur(taxTotal?.first('TaxAmount'))),
      row('Ödenecek tutar', _cur(total?.first('PayableAmount')), bold: true),
      const SizedBox(height: 12),
      Text("Bu görünüm faturanın özetidir; bu faturada resmi görüntüleme şablonu bulunamadı. Asıl belge için XML'i kopyalayın.", style: TextStyle(fontSize: 12, color: t.text3)),
      const SizedBox(height: 12),
      Align(
        alignment: Alignment.centerLeft,
        child: PillButton(
          label: 'XML kopyala', icon: Icons.copy,
          onPressed: () { Clipboard.setData(ClipboardData(text: d.xml)); showToast(context, 'XML panoya kopyalandı'); },
        ),
      ),
    ]);
  }
}
