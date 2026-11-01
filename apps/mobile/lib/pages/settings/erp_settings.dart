import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import 'common.dart';

/// Netsis bağlantı durumu ve senkron geçmişi (erp.manage).
class ErpSettings extends StatefulWidget {
  const ErpSettings({super.key});
  @override
  State<ErpSettings> createState() => _ErpSettingsState();
}

class _ErpSettingsState extends State<ErpSettings> {
  Note? msg;
  bool busy = false;
  Timer? poll;

  @override
  void dispose() { poll?.cancel(); super.dispose(); }

  // Senkron sürerken durumu 2 sn'de bir yenile.
  void _watch(dynamic d, bool running) {
    if (running && poll == null) {
      poll = Timer.periodic(const Duration(seconds: 2), (_) => d.reload());
    } else if (!running) {
      poll?.cancel();
      poll = null;
    }
  }

  Future<void> sync(dynamic d) async {
    setState(() { busy = true; msg = null; });
    try {
      final r = await Api.i.post('/erp/sync');
      msg = r['started'] == true ? const Note(true, 'Senkron başlatıldı') : const Note(false, 'Zaten çalışan bir senkron var');
      await d.reload();
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Başlatılamadı');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> test() async {
    setState(() { busy = true; msg = null; });
    try {
      final r = await Api.i.post('/erp/test');
      msg = r['ok'] == true ? Note(true, 'Bağlantı başarılı: ${r['database']}') : Note(false, 'Bağlantı hatası: ${r['error']}');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Test edilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) => Loader<ErpStatus>(
        path: '/erp/status',
        decode: (j) => ErpStatus.fromJson(Map<String, dynamic>.from(j as Map)),
        builder: (c, d) {
          final t = c.tk;
          final s = d.data;
          WidgetsBinding.instance.addPostFrameCallback((_) => _watch(d, s?.running == true));
          return Panel(title: 'Netsis entegrasyonu', children: [
            if (s != null && s.configured)
              Wrap(spacing: 8, runSpacing: 8, children: [
                smBtn('Bağlantıyı test et', busy ? null : test),
                smBtn(s.running ? 'Senkronlanıyor…' : 'Şimdi senkronla', busy || s.running ? null : () => sync(d), primary: true, icon: LucideIcons.refreshCw),
              ]),
            errLine(c, d.error),
            if (s != null && !s.configured)
              emptyLine(c, 'Netsis bağlantısı yapılandırılmamış. Sunucudaki apps/api/.env dosyasına NETSIS_DB_* değerlerini girin (bkz. docs/moduller/netsis.md).'),
            if (s != null && s.configured) ...[
              const SizedBox(height: 12),
              Prop('Sunucu', '${s.server}:${s.port} · ${s.database} (${s.dbUser}, salt okunur)'),
              Prop('Zamanlama', '${s.intervalMinutes > 0 ? '${s.intervalMinutes} dakikada bir' : 'Otomatik senkron kapalı'} · son ${s.windowDays} gün'),
              Prop('Önbellek',
                  '${s.counts['customers'] ?? 0} cari · ${s.counts['orders'] ?? 0} sipariş · ${s.counts['quotes'] ?? 0} teklif · ${s.counts['shipments'] ?? 0} sevk · ${s.counts['accountTx'] ?? 0} hareket'),
              noteView(msg),
              const H4('Son çalışmalar'),
              for (final r in s.runs)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(erpEntityLabel[r.entity] ?? r.entity, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text))),
                      Text(r.status == 'ok' ? 'Tamam' : r.status == 'failed' ? 'Hata' : 'Sürüyor',
                          style: TextStyle(fontWeight: FontWeight.w600, color: r.status == 'ok' ? t.green : r.status == 'failed' ? t.danger : t.orange)),
                    ]),
                    Text('${timeAgo(r.startedAt)} · ${r.trigger == 'manual' ? 'Elle' : 'Zamanlı'} · ${r.rows} satır', style: TextStyle(fontSize: 13.5, color: t.text2)),
                    if (r.error != null && r.error!.isNotEmpty) Text(r.error!, style: TextStyle(fontSize: 12.5, color: t.danger)),
                  ]),
                ),
              if (s.runs.isEmpty) emptyLine(c, 'Henüz senkron çalışmadı.'),
            ],
          ]);
        },
      );
}
