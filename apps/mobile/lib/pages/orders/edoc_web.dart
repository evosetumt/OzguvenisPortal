import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Resmi GİB görüntüleme şablonu: faturaya gömülü XSLT'yi WebView'in kendi XSLTProcessor'ü ile uygular
/// (web EDocumentPreview.tsx ile aynı mantık). Şablon yok/hatalıysa [onFail] çağrılır (özet görünüme düşülür).
class EDocWebView extends StatefulWidget {
  const EDocWebView({super.key, required this.xml, required this.onFail});
  final String xml;
  final VoidCallback onFail;
  @override
  State<EDocWebView> createState() => _EDocWebViewState();
}

class _EDocWebViewState extends State<EDocWebView> {
  late final WebViewController c;

  @override
  void initState() {
    super.initState();
    c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..addJavaScriptChannel('EDoc', onMessageReceived: (m) { if (m.message == 'fail') widget.onFail(); })
      ..loadHtmlString(_page(widget.xml));
  }

  static String _page(String xml) {
    // </script> dizisi sayfayı bozmasın
    final data = jsonEncode(xml).replaceAll('</', r'<\/');
    return '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=0.5,minimum-scale=0.2,maximum-scale=4,user-scalable=yes"></head><body>
<script>
(function(){
  var CBC='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  function fail(){ try{ EDoc.postMessage('fail'); }catch(e){} }
  try{
    var xmlDoc=new DOMParser().parseFromString($data,'application/xml');
    if(xmlDoc.getElementsByTagName('parsererror').length||typeof XSLTProcessor==='undefined') return fail();
    var objs=Array.prototype.slice.call(xmlDoc.getElementsByTagNameNS(CBC,'EmbeddedDocumentBinaryObject'));
    var pick=objs.find(function(o){return /\\.xslt?\$/i.test(o.getAttribute('filename')||'')})
      ||objs.find(function(o){return /xml|xsl/i.test(o.getAttribute('mimeCode')||'')&&!/pdf/i.test(o.getAttribute('filename')||'')});
    if(!pick||!pick.textContent) return fail();
    var bin=atob(pick.textContent.replace(/\\s+/g,''));
    var xslt=new TextDecoder('utf-8').decode(Uint8Array.from(bin,function(ch){return ch.charCodeAt(0)}));
    var style=new DOMParser().parseFromString(xslt,'application/xml');
    if(style.getElementsByTagName('parsererror').length) return fail();
    var p=new XSLTProcessor(); p.importStylesheet(style);
    var out=p.transformToDocument(xmlDoc);
    if(!out||!out.documentElement) return fail();
    document.open(); document.write('<!doctype html>'+new XMLSerializer().serializeToString(out)); document.close();
  }catch(e){ fail(); }
})();
</script></body></html>''';
  }

  @override
  Widget build(BuildContext context) => ClipRRect(borderRadius: BorderRadius.circular(14), child: WebViewWidget(controller: c));
}
