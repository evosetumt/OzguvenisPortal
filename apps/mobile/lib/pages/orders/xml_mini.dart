/// Bağımlılıksız küçük XML ayrıştırıcı (yalnızca okuma): e-Fatura UBL özeti için yeterli.
/// Ad alanı öneki yok sayılır (localName ile eşleşir).
class XNode {
  XNode(this.name, this.attrs);
  final String name;
  final Map<String, String> attrs;
  final List<XNode> children = [];
  final StringBuffer _text = StringBuffer();
  XNode? parent;
  String get text => _text.toString().trim();

  Iterable<XNode> descendants(String n) sync* {
    for (final c in children) {
      if (c.name == n) yield c;
      yield* c.descendants(n);
    }
  }

  XNode? first(String n) => descendants(n).firstOrNull;
  XNode? child(String n) => children.where((c) => c.name == n).firstOrNull;

  /// Ada göre iç içe yol: ['PartyName','Name']
  String at(List<String> path) {
    XNode? cur = this;
    for (final s in path) {
      cur = cur?.first(s);
    }
    return cur?.text ?? '';
  }
}

String _unesc(String s) => s
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'")
    .replaceAllMapped(RegExp(r'&#(x?)([0-9a-fA-F]+);'), (m) {
      final v = int.tryParse(m[2]!, radix: m[1] == 'x' ? 16 : 10);
      return v == null ? m[0]! : String.fromCharCode(v);
    })
    .replaceAll('&amp;', '&');

String _local(String n) => n.contains(':') ? n.substring(n.indexOf(':') + 1) : n;

final _tag = RegExp(r'<!--.*?-->|<!\[CDATA\[(.*?)\]\]>|<\?.*?\?>|<!DOCTYPE[^>]*>|<(/?)([\w:.-]+)((?:[^>"]|"[^"]*"|' "'[^']*'" r')*?)(/?)>', dotAll: true);
final _attr = RegExp(r'([\w:.-]+)\s*=\s*(?:"([^"]*)"|' "'([^']*)'" r')');

/// Geçersiz XML'de null döner.
XNode? parseXml(String src) {
  final root = XNode('#root', {});
  var cur = root;
  var pos = 0;
  for (final m in _tag.allMatches(src)) {
    if (m.start > pos) cur._text.write(_unesc(src.substring(pos, m.start)));
    pos = m.end;
    if (m[1] != null) { cur._text.write(m[1]); continue; }
    final name = m[3];
    if (name == null) continue; // yorum, işlem yönergesi
    final local = _local(name);
    if (m[2] == '/') {
      if (cur.name != local || cur.parent == null) return null;
      cur = cur.parent!;
      continue;
    }
    final attrs = <String, String>{
      for (final a in _attr.allMatches(m[4] ?? '')) _local(a[1]!): _unesc(a[2] ?? a[3] ?? ''),
    };
    final n = XNode(local, attrs)..parent = cur;
    cur.children.add(n);
    if (m[5] != '/') cur = n;
  }
  if (cur != root || root.children.length != 1) return null;
  return root.children.first;
}
