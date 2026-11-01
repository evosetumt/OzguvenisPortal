import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import '../../widgets/glass.dart';
import 'common.dart';

/// Bildirimlerim sekmesi: kullanıcının olay/kanal tercihleri.
/// NOT: Push kaydı (firebase_messaging) projede henüz yok; web'deki "Bu cihazda aç/Kapat" akışı eklenmedi.
class MyNotifications extends StatefulWidget {
  const MyNotifications({super.key});
  @override
  State<MyNotifications> createState() => _MyNotificationsState();
}

class _MyNotificationsState extends State<MyNotifications> {
  bool busy = false;
  Note? msg;

  Future<void> toggle(dynamic d, NotifPref p, String c) async {
    final channels = p.channels.contains(c) ? p.channels.where((x) => x != c).toList() : [...p.channels, c];
    final prev = d.data as List<NotifPref>?;
    d.setData([for (final x in prev ?? const <NotifPref>[]) x.eventCode == p.eventCode ? x.copy(channels: channels) : x]);
    try {
      final r = await Api.i.put('/notifications/prefs', {'items': [{'eventCode': p.eventCode, 'channels': channels}]});
      d.setData(((r as List?) ?? const []).whereType<Map>().map((e) => NotifPref.fromJson(Map<String, dynamic>.from(e))).toList());
    } catch (e) {
      d.setData(prev);
      if (mounted) setState(() => msg = Note(false, e is ApiError ? e.message : 'Kaydedilemedi'));
    }
  }

  Future<void> test() async {
    setState(() { busy = true; msg = null; });
    try {
      final r = await Api.i.post('/notifications/test');
      final results = ((r['results'] as List?) ?? const []).whereType<Map>().toList();
      final parts = results.map((x) {
        final st = x['status'];
        return '${channelLabel[x['channel']] ?? x['channel']}: ${st == 'sent' ? 'gönderildi' : st == 'skipped' ? 'yapılandırılmamış' : 'hata (${x['error']})'}';
      });
      msg = Note(!results.any((x) => x['status'] == 'failed'), ['Uygulama içi: gönderildi', ...parts].join(' · '));
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Gönderilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Loader<List<NotifPref>>(
      path: '/notifications/prefs',
      decode: (j) => ((j as List?) ?? const []).whereType<Map>().map((e) => NotifPref.fromJson(Map<String, dynamic>.from(e))).toList(),
      builder: (c, d) {
        final prefs = d.data;
        final used = allChannels.where((ch) => (prefs ?? const <NotifPref>[]).any((p) => p.available.contains(ch))).toList();
        return Panel(title: 'Bildirimlerim', children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(LucideIcons.bellOff, size: 18, color: t.text3),
            const SizedBox(width: 10),
            Expanded(child: Text('Bu cihaz için bildirim altyapısı henüz yapılandırılmamış (Firebase).', style: TextStyle(fontSize: 14, color: t.text2))),
          ]),
          const SizedBox(height: 10),
          Align(alignment: Alignment.centerLeft, child: smBtn('Deneme gönder', busy ? null : test, icon: LucideIcons.send)),
          noteView(msg),
          errLine(c, d.error),
          if (prefs != null)
            for (final p in prefs)
              Container(
                margin: const EdgeInsets.only(top: 10), padding: const EdgeInsets.only(top: 10),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final ch in used)
                      if (p.available.contains(ch)) ChipBtn(channelLabel[ch] ?? ch, p.channels.contains(ch), () => toggle(d, p, ch)),
                  ]),
                ]),
              ),
          const SizedBox(height: 12),
          Text('Yalnızca yöneticinin ilgili olay için açtığı kanallar seçilebilir.', style: TextStyle(fontSize: 13, color: t.text3)),
        ]);
      },
    );
  }
}

/// Bildirim kuralları sekmesi (notification.manage): olay başına kanal ve etkinlik.
class RulesAdmin extends StatefulWidget {
  const RulesAdmin({super.key});
  @override
  State<RulesAdmin> createState() => _RulesAdminState();
}

class _RulesAdminState extends State<RulesAdmin> {
  String err = '';

  Future<void> save(dynamic d, NotifRule r, {List<String>? channels, bool? isActive}) async {
    final next = r.copy(channels: channels, isActive: isActive);
    if (next.channels.isEmpty) { setState(() => err = 'En az bir kanal seçili olmalı'); return; }
    setState(() => err = '');
    final prev = d.data as RulesResp?;
    if (prev != null) d.setData(RulesResp([for (final x in prev.rules) x.eventCode == r.eventCode ? next : x], prev.channels));
    try {
      await Api.i.put('/notifications/rules/${Uri.encodeComponent(r.eventCode)}', {'channels': next.channels, 'isActive': next.isActive});
    } catch (e) {
      d.setData(prev);
      if (mounted) setState(() => err = e is ApiError ? e.message : 'Kaydedilemedi');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Loader<RulesResp>(
      path: '/notifications/rules',
      decode: (j) => RulesResp.fromJson(Map<String, dynamic>.from(j as Map)),
      builder: (c, d) {
        final data = d.data;
        final e = d.error.isNotEmpty ? d.error : err;
        return Panel(title: 'Bildirim kuralları', children: [
          const Hint('Hangi olayın hangi kanallardan gideceği. Alıcılar olay türüne göre sistemde tanımlıdır (atanan kişi, görevi açan, davetliler…).'),
          if (data != null)
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final ch in data.channels)
                Chip2('${channelLabel[ch.channel] ?? ch.channel}: ${ch.configured ? 'hazır' : 'yapılandırılmamış'}',
                    color: ch.configured ? t.green : t.text3, bg: ch.configured ? t.green.withValues(alpha: .14) : t.fill),
            ]),
          if (e.isNotEmpty) Msg(false, e),
          if (data != null)
            for (final r in data.rules)
              Opacity(
                opacity: r.isActive ? 1 : .6,
                child: Container(
                  margin: const EdgeInsets.only(top: 10), padding: const EdgeInsets.only(top: 10),
                  decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(r.label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
                        Text(r.eventCode, style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: t.text3)),
                      ])),
                      Text('Etkin', style: TextStyle(fontSize: 13, color: t.text2)),
                      Switch(value: r.isActive, onChanged: (_) => save(d, r, isActive: !r.isActive)),
                    ]),
                    const SizedBox(height: 6),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final ch in allChannels)
                        ChipBtn(channelLabel[ch] ?? ch, r.channels.contains(ch),
                            r.isActive ? () => save(d, r, channels: r.channels.contains(ch) ? r.channels.where((x) => x != ch).toList() : [...r.channels, ch]) : null),
                    ]),
                  ]),
                ),
              ),
        ]);
      },
    );
  }
}
