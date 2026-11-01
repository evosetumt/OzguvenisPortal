import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import '../../widgets/glass.dart';
import 'common.dart';

const _stateLabel = {'ok': 'Gönderilebilir', 'no-phone': 'Telefon yok', 'invalid': 'Geçersiz numara', 'opted-out': 'Bildirimleri durdurmuş'};

String _fmtPhone(String p) => p.startsWith('90') && p.length == 12 ? '+90 ${p.substring(2, 5)} ${p.substring(5, 8)} ${p.substring(8, 10)} ${p.substring(10)}' : '+$p';

List<T> _dec<T>(dynamic j, T Function(Map<String, dynamic>) f) =>
    ((j as List?) ?? const []).whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();

/// Ayarlar → WhatsApp: bağlantı durumu, bildirim şablonları ve alıcılar (salt okunur).
class WhatsappSettings extends StatefulWidget {
  const WhatsappSettings({super.key});
  @override
  State<WhatsappSettings> createState() => _WhatsappSettingsState();
}

class _WhatsappSettingsState extends State<WhatsappSettings> {
  late final status = ApiData<WaStatus>('/whatsapp/status', decode: (j) => WaStatus.fromJson(Map<String, dynamic>.from(j as Map)));
  late final templates = ApiData<List<WaTemplate>>('/whatsapp/templates', decode: (j) => _dec(j, WaTemplate.fromJson));
  late final people = ApiData<List<WaRecipient>>('/whatsapp/recipients', decode: (j) => _dec(j, WaRecipient.fromJson));

  @override
  void dispose() { status.dispose(); templates.dispose(); people.dispose(); super.dispose(); }

  Widget _link(BuildContext c, String text, String tab) => GestureDetector(
        onTap: () => c.go('/settings?tab=$tab'),
        child: Text(text, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.tk.accentInk)),
      );

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([status, templates, people]),
        builder: (c, _) {
          final t = c.tk;
          final st = status.data, ps = people.data;
          final reachable = ps?.where((p) => p.state == 'ok').length ?? 0;
          return Column(children: [
            Panel(
              title: 'WhatsApp Business',
              trailing: st == null
                  ? null
                  : st.configured
                      ? Chip2('Bağlı', color: t.green, bg: t.green.withValues(alpha: .14), dot: t.green)
                      : Chip2('Yapılandırılmamış', color: t.text3),
              children: [
                Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text('Bildirim kurallarında WhatsApp seçili olaylar (ör. görev atandı), Meta\'da onaylı şablonla kullanıcının kayıtlı telefonuna otomatik gönderilir. Hangi olayın WhatsApp\'tan gideceğini ',
                      style: TextStyle(fontSize: 13.5, height: 1.35, color: t.text2)),
                  _link(c, 'Bildirim kuralları', 'rules'),
                  Text(' sekmesinden seçebilirsiniz.', style: TextStyle(fontSize: 13.5, color: t.text2)),
                ]),
                const SizedBox(height: 10),
                for (final x in st?.eventTemplates ?? const <WaEventTemplate>[])
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                    child: Row(children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(x.label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: t.text)),
                        Text(x.name, style: TextStyle(fontSize: 12.5, fontFamily: 'monospace', color: t.text3)),
                      ])),
                      Builder(builder: (_) {
                        final tp = templates.data;
                        if (tp == null) return Text('…', style: TextStyle(color: t.text3));
                        final ok = tp.any((y) => y.name == x.name && y.language == x.language);
                        return Text(ok ? 'Onaylı' : 'Meta\'da onaylı değil', style: TextStyle(fontSize: 13.5, color: ok ? t.green : t.danger));
                      }),
                    ]),
                  ),
              ],
            ),
            Panel(
              title: 'Alıcılar',
              trailing: ps == null ? null : Text('$reachable / ${ps.length} kullanıcıya gönderilebilir', style: TextStyle(fontSize: 12.5, color: t.text3)),
              children: [
                Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text('Numaralar ', style: TextStyle(fontSize: 13.5, color: t.text2)),
                  _link(c, 'Kullanıcılar', 'users'),
                  Text(' sekmesindeki telefon alanından alınır; ayrıca kişi eklemeye gerek yoktur. Numarası olmayan kullanıcıya WhatsApp gitmez (uygulama içi ve e-posta bildirimi yine gider).',
                      style: TextStyle(fontSize: 13.5, height: 1.35, color: t.text2)),
                ]),
                errLine(c, people.error),
                const SizedBox(height: 8),
                for (final p in ps ?? const <WaRecipient>[])
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p.fullName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
                      Text(p.normalized != null ? _fmtPhone(p.normalized!) : (p.phone ?? '–'), style: TextStyle(fontSize: 13.5, color: t.text2)),
                      Text(_stateLabel[p.state] ?? p.state,
                          style: TextStyle(fontSize: 13.5, color: p.state == 'ok' ? t.green : p.state == 'no-phone' ? t.text3 : t.danger)),
                      if (p.hasLast)
                        Text.rich(TextSpan(children: [
                          TextSpan(text: waStatusLabel[p.lastStatus] ?? '${p.lastStatus}', style: TextStyle(color: p.lastStatus == 'failed' ? t.danger : t.text2)),
                          TextSpan(text: ' · ${timeAgo(p.lastCreatedAt ?? '')}', style: TextStyle(color: t.text3)),
                        ]), style: const TextStyle(fontSize: 13)),
                      if (p.lastError != null && p.lastError!.isNotEmpty) Text(p.lastError!, style: TextStyle(fontSize: 12, color: t.danger)),
                    ]),
                  ),
              ],
            ),
          ]);
        },
      );
}
