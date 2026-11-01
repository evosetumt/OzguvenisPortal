import 'package:intl/intl.dart';

/// Web lib/format.ts + lib/files.ts yardımcıları (tr_TR). Tarihler yerel saate çevrilir.
DateTime parseDt(String iso) => DateTime.parse(iso).toLocal();

String dateKey(String iso) => iso.length >= 10 ? iso.substring(0, 10) : iso;

String localKey(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String todayKey() => localKey(DateTime.now());

String formatTime(String iso) => DateFormat('HH:mm', 'tr_TR').format(parseDt(iso));

String hhmm(DateTime d) => DateFormat('HH:mm').format(d);

String timeAgo(String iso) {
  final s = DateTime.now().difference(DateTime.parse(iso)).inSeconds;
  if (s < 60) return 'şimdi';
  if (s < 3600) return '${s ~/ 60} dk önce';
  if (s < 86400) return '${s ~/ 3600} sa önce';
  if (s < 7 * 86400) return '${s ~/ 86400} gün önce';
  return DateFormat('d MMM', 'tr_TR').format(parseDt(iso));
}

String initials(String name) =>
    name.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).take(2).map((p) => p.substring(0, 1).toUpperCase()).join();

String formatSize(int n) => n < 1024 * 1024 ? '${(n / 1024).round().clamp(1, 1 << 30)} KB' : '${(n / 1024 / 1024).toStringAsFixed(1)} MB';

/// tr-TR küçük harf (İ/I dönüşümü).
String lowerTr(String s) => s.replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();

Set<int> toggled(Set<int> s, int id) => s.contains(id) ? ({...s}..remove(id)) : {...s, id};
