import 'package:intl/intl.dart';

/// Web lib/format.ts karşılığı (tr_TR). Bitiş tarihleri API'de UTC gece yarısıdır; tarih kısmı doğrudan okunur.
String dateKey(String iso) => iso.length >= 10 ? iso.substring(0, 10) : iso;

String localKey(DateTime d) => DateFormat('yyyy-MM-dd').format(d);
String todayKey() => localKey(DateTime.now());

DateTime? tryParseIso(String? s) => s == null ? null : DateTime.tryParse(s)?.toLocal();

/// "Bugün", "Yarın", "Dün" veya "12 Kas"
String formatDue(String iso) {
  final k = dateKey(iso);
  final t = DateTime.parse('${todayKey()}T00:00:00Z');
  final d = DateTime.tryParse('${k}T00:00:00Z');
  if (d == null) return iso;
  final diff = d.difference(t).inDays;
  if (diff == 0) return 'Bugün';
  if (diff == 1) return 'Yarın';
  if (diff == -1) return 'Dün';
  return DateFormat('d MMM', 'tr_TR').format(d);
}

bool isOverdue(String? iso, bool done) => iso != null && iso.isNotEmpty && !done && dateKey(iso).compareTo(todayKey()) < 0;
bool isToday(String? iso) => iso != null && iso.isNotEmpty && dateKey(iso) == todayKey();

String timeAgo(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 60) return 'şimdi';
  if (s < 3600) return '${s ~/ 60} dk önce';
  if (s < 86400) return '${s ~/ 3600} sa önce';
  if (s < 7 * 86400) return '${s ~/ 86400} gün önce';
  return DateFormat('d MMM', 'tr_TR').format(d.toLocal());
}

String formatTime(String iso) {
  final d = tryParseIso(iso);
  return d == null ? '' : DateFormat('HH:mm', 'tr_TR').format(d);
}

String initials(String name) =>
    name.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).take(2).map((p) => p.substring(0, 1).toUpperCase()).join();

String formatSize(num n) => n < 1024 * 1024 ? '${(n / 1024).round().clamp(1, 1 << 30)} KB' : '${(n / 1024 / 1024).toStringAsFixed(1)} MB';

/// Birim rengi (web TeamPage → deptHue): hsl(id*67 % 360, 70%, 62%)
double deptHueDeg(int id) => ((id * 67) % 360).toDouble();
