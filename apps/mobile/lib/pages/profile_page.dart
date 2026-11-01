import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/user.dart';
import '../widgets/avatar.dart';
import '../widgets/glass.dart';
import 'shared/format.dart';
import 'shared/ui.dart';
import 'team_page.dart' show deptHue;

/// Görseli ortadan kare kırpar, 320 piksele küçültür ve PNG data URL'ye çevirir (API: POST /me/avatar {dataUrl}).
Future<String> _toAvatar(String path) async {
  final file = File(path);
  if (await file.length() > 15 * 1024 * 1024) throw 'Görsel 15 MB’tan küçük olmalı';
  final codec = await ui.instantiateImageCodec(await file.readAsBytes());
  final img = (await codec.getNextFrame()).image;
  final side = math.min(img.width, img.height).toDouble();
  final rec = ui.PictureRecorder();
  ui.Canvas(rec).drawImageRect(
    img,
    Rect.fromLTWH((img.width - side) / 2, (img.height - side) / 2, side, side),
    const Rect.fromLTWH(0, 0, 320, 320),
    Paint()..filterQuality = FilterQuality.high,
  );
  final out = await rec.endRecording().toImage(320, 320);
  final data = await out.toByteData(format: ui.ImageByteFormat.png);
  if (data == null) throw 'Lütfen bir görsel seçin';
  return 'data:image/png;base64,${base64Encode(data.buffer.asUint8List())}';
}

/// Web ProfileDrawer (+ UserMenu işlevleri): kişi profili. Kendi profilinde fotoğraf ve durum değiştirilir.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.userId});
  final int userId;
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final ApiData<Profile> d = ApiData<Profile>('/team/${widget.userId}', decode: (j) => Profile.fromJson(Map<String, dynamic>.from(j)))..addListener(_r);
  String err = '';
  bool busy = false;

  void _r() { if (mounted) setState(() {}); }

  @override
  void dispose() { d.dispose(); super.dispose(); }

  @override
  void didUpdateWidget(ProfilePage old) {
    super.didUpdateWidget(old);
    if (old.userId != widget.userId) d.setPath('/team/${widget.userId}');
  }

  Future<void> _pickPhoto(Profile p) async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, maxHeight: 1600);
    if (x == null) return;
    setState(() { err = ''; busy = true; });
    try {
      final url = await _toAvatar(x.path);
      final r = await Api.i.post('/me/avatar', {'dataUrl': url});
      p.avatarUrl = r['avatarUrl'];
      if (mounted) context.read<AuthController>().patchMe(avatarUrl: p.avatarUrl);
    } catch (e) {
      err = e is ApiError ? e.message : (e is String ? e : 'Fotoğraf yüklenemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _removePhoto(Profile p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Profil fotoğrafı kaldırılsın mı?'),
        actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Kaldır'))],
      ),
    );
    if (ok != true) return;
    try {
      await Api.i.delete('/me/avatar');
      p.avatarUrl = null;
      if (mounted) context.read<AuthController>().patchMe(avatarUrl: '');
    } catch (e) {
      err = e is ApiError ? e.message : 'Kaldırılamadı';
    }
    if (mounted) setState(() {});
  }

  Future<void> _setPresence(Profile p, String presence) async {
    final before = p.presence;
    final auth = context.read<AuthController>();
    setState(() => p.presence = presence);
    auth.patchMe(presence: presence);
    try {
      await Api.i.patch('/me', {'presence': presence});
    } catch (e) {
      p.presence = before;
      auth.patchMe(presence: before);
      err = e is ApiError ? e.message : 'Durum değiştirilemedi';
      if (mounted) setState(() {});
    }
  }

  Widget _row(BuildContext context, {required Widget lead, required String title, String? sub, Color? subColor, Widget? trail, required VoidCallback onTap}) {
    final t = context.tk;
    return InkWell(
      borderRadius: BorderRadius.circular(14), onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(children: [
          lead,
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.text)),
            if (sub != null) Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: subColor ?? t.text2)),
          ])),
          ?trail,
        ]),
      ),
    );
  }

  Widget _icoBox(Color c, IconData i) => Container(width: 32, height: 32, decoration: BoxDecoration(color: c.withValues(alpha: .18), borderRadius: BorderRadius.circular(10)), child: Icon(i, size: 15, color: c));

  Widget _section(BuildContext context, String title, String? count, List<Widget> children) => Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: Glass(
          radius: 22, padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [sectionTitle(context, title, count: count), ...children]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final p = d.data;
    final auth = context.watch<AuthController>();
    if (p == null) {
      return ListView(children: [
        const PageHead(title: 'Profil'),
        Padding(padding: const EdgeInsets.all(40), child: Center(child: d.error.isNotEmpty ? Text(d.error, style: TextStyle(color: t.danger)) : const CircularProgressIndicator())),
      ]);
    }
    final today = todayKey();
    final load = p.workload == null ? 0.0 : (p.workload!.load.clamp(0, 100)) / 100;
    final hue = deptHue(p.department?.id);

    return ListView(padding: const EdgeInsets.only(bottom: 110), children: [
      // Üst kart
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
        child: Glass(
          radius: 26, padding: const EdgeInsets.all(18),
          child: Column(children: [
            Row(children: [
              Stack(clipBehavior: Clip.none, children: [
                Avatar(name: p.fullName, src: p.avatarUrl, size: 84, presence: p.presence),
                if (p.self)
                  Positioned(right: -4, bottom: -4, child: Material(
                    color: t.accent, shape: const CircleBorder(),
                    child: InkWell(customBorder: const CircleBorder(), onTap: busy ? null : () => _pickPhoto(p), child: const Padding(padding: EdgeInsets.all(8), child: Icon(LucideIcons.camera, size: 16, color: Colors.white))),
                  )),
              ]),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p.fullName, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -.4, color: t.text)),
                Text(p.title ?? (p.isManager ? 'Birim yöneticisi' : '—'), style: TextStyle(fontSize: 14.5, color: t.text2)),
                const SizedBox(height: 8),
                Wrap(spacing: 10, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  if (p.department != null) Chip2(p.department!.name, dot: hue),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    PresenceDot(p.presence), const SizedBox(width: 6),
                    Text(presenceLabel[p.presence] ?? 'Uzakta', style: TextStyle(fontSize: 13.5, color: t.text2)),
                  ]),
                ]),
              ])),
            ]),
            if (p.self)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(children: [
                  TextButton(onPressed: busy ? null : () => _pickPhoto(p), child: Text(busy ? 'Yükleniyor…' : (p.avatarUrl != null && p.avatarUrl!.isNotEmpty ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'))),
                  if (p.avatarUrl != null && p.avatarUrl!.isNotEmpty)
                    TextButton.icon(onPressed: () => _removePhoto(p), icon: Icon(LucideIcons.trash2, size: 13, color: t.danger), label: Text('Kaldır', style: TextStyle(color: t.danger))),
                ]),
              ),
          ]),
        ),
      ),
      if (err.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: Text(err, style: TextStyle(color: t.danger, fontSize: 14))),

      if (p.self)
        _section(context, 'Durumun', null, [
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final s in presenceOrder)
              FilterChip2(on: p.presence == s, label: presenceLabel[s]!, leading: PresenceDot(s), onTap: () => _setPresence(p, s)),
          ]),
          const SizedBox(height: 4),
        ]),

      Padding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Glass(
            radius: 18, padding: const EdgeInsets.all(14), onTap: () => launchUrl(Uri.parse('mailto:${p.email}')),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('E-posta', style: TextStyle(fontSize: 12.5, color: t.text2)),
              const SizedBox(height: 4),
              Row(children: [Icon(LucideIcons.mail, size: 15, color: t.accentInk), const SizedBox(width: 6), Expanded(child: Text(p.email, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: t.text)))]),
            ]),
          )),
          const SizedBox(width: 10),
          Expanded(child: Glass(
            radius: 18, padding: const EdgeInsets.all(14), onTap: p.phone == null || p.phone!.isEmpty ? null : () => launchUrl(Uri.parse('tel:${p.phone!.replaceAll(RegExp(r'\s'), '')}')),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Telefon', style: TextStyle(fontSize: 12.5, color: t.text2)),
              const SizedBox(height: 4),
              Row(children: [
                Icon(LucideIcons.phone, size: 15, color: p.phone != null && p.phone!.isNotEmpty ? t.accentInk : t.text3),
                const SizedBox(width: 6),
                Expanded(child: Text(p.phone != null && p.phone!.isNotEmpty ? p.phone! : '—', overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: t.text))),
              ]),
            ]),
          )),
        ]),
      ),

      if (p.workload != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          child: Glass(
            radius: 22, padding: const EdgeInsets.all(16),
            child: Row(children: [
              SizedBox(width: 76, height: 76, child: Stack(alignment: Alignment.center, children: [
                SizedBox.expand(child: CircularProgressIndicator(value: load, strokeWidth: 7, backgroundColor: t.fill2, color: p.workload!.load > 100 ? t.danger : t.accent)),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('${p.workload!.load}%', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text)),
                  Text('yük', style: TextStyle(fontSize: 11, color: t.text2)),
                ]),
              ])),
              const SizedBox(width: 18),
              Expanded(child: Column(children: [
                _kv(t, 'Açık görev', '${p.workload!.open}', ' / ${p.capacity}'),
                _kv(t, 'Bu hafta biten', '${p.workload!.doneWeek}'),
                _kv(t, 'Bu hafta bitecek', '${p.workload!.dueWeek}'),
                _kv(t, 'Geciken', '${p.workload!.overdue}', null, p.workload!.overdue > 0 ? t.danger : null),
              ])),
            ]),
          ),
        ),

      if (p.openTasks != null)
        _section(context, 'Açık görevler', '${p.workload?.open ?? 0}', [
          if (p.openTasks!.isEmpty) emptyText(context, 'Açık görev yok'),
          for (final x in p.openTasks!)
            _row(context,
              lead: _icoBox(x.projectColor != null ? hexColorOr(x.projectColor, t.accent) : t.accent, LucideIcons.listChecks),
              title: x.title,
              sub: '${x.dueDate != null ? formatDue(x.dueDate!) : 'Tarih yok'}${x.projectName != null ? ' · ${x.projectName}' : ''}',
              subColor: x.dueDate != null && dateKey(x.dueDate!).compareTo(today) < 0 ? t.danger : null,
              trail: x.priority == 'high' || x.priority == 'urgent' ? PrioChip(x.priority) : null,
              onTap: () => context.go('/tasks?id=${x.id}'),
            ),
          if ((p.workload?.open ?? 0) > p.openTasks!.length)
            TextButton(onPressed: () => context.go(p.self ? '/tasks?mine=1' : '/tasks?assignee=${p.id}'), child: Text('${(p.workload?.open ?? 0) - p.openTasks!.length} görev daha')),
        ]),

      _section(context, 'Bu hafta', '${p.events.length}', [
        if (p.events.isEmpty) emptyText(context, 'Bu hafta görünen etkinlik yok'),
        for (final e in p.events)
          _row(context,
            lead: SizedBox(width: 34, child: Column(children: [
              Text(_wd(e.startsAt), style: TextStyle(fontSize: 11, color: t.text2)),
              Text('${tryParseIso(e.startsAt)?.day ?? ''}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text)),
            ])),
            title: e.title,
            sub: e.allDay ? 'Tüm gün' : '${formatDue(e.startsAt)} · ${formatTime(e.startsAt)}',
            onTap: () => context.go('/calendar'),
          ),
      ]),

      if (p.projects.isNotEmpty)
        _section(context, 'Projeler', '${p.projects.length}', [
          for (final x in p.projects)
            _row(context,
              lead: Container(width: 8, height: 32, decoration: BoxDecoration(color: hexColorOr(x.color, t.accent), borderRadius: BorderRadius.circular(4))),
              title: x.name, sub: '${x.role} · ${x.open} açık görev',
              trail: Icon(LucideIcons.chevronRight, size: 16, color: t.text3),
              onTap: () => context.go('/tasks?project=${x.id}'),
            ),
        ]),

      if (p.self)
        _section(context, 'Hesap', null, [
          _row(context, lead: _icoBox(const Color(0xFFF59E0B), LucideIcons.keyRound), title: 'Şifre değiştir', sub: 'Giriş şifreni güncelle', trail: Icon(LucideIcons.chevronRight, size: 16, color: t.text3), onTap: () => context.go('/settings?tab=account')),
          _row(context, lead: _icoBox(const Color(0xFFA78BFA), LucideIcons.bell), title: 'Bildirim tercihleri', sub: 'Hangi kanaldan haber alacağın', trail: Icon(LucideIcons.chevronRight, size: 16, color: t.text3), onTap: () => context.go('/settings?tab=notifications')),
          _row(context, lead: _icoBox(t.blue, LucideIcons.settings), title: 'Tüm ayarlar', trail: Icon(LucideIcons.chevronRight, size: 16, color: t.text3), onTap: () => context.go('/settings')),
          _row(context, lead: _icoBox(t.danger, LucideIcons.logOut), title: 'Çıkış yap', onTap: auth.logout),
          Padding(padding: const EdgeInsets.only(top: 8), child: Text('Ad, unvan ve birim bilgilerini yöneticin Ayarlar → Kullanıcılar’dan değiştirir.', style: TextStyle(fontSize: 12.5, color: t.text3))),
        ]),
    ]);
  }

  Widget _kv(Tokens t, String k, String v, [String? suffix, Color? c]) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(k, style: TextStyle(fontSize: 13.5, color: t.text2))),
          Text(v, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: c ?? t.text)),
          if (suffix != null) Text(suffix, style: TextStyle(fontSize: 13, color: t.text2)),
        ]),
      );

  String _wd(String iso) {
    final d = tryParseIso(iso);
    return d == null ? '' : const ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][d.weekday - 1];
  }
}

Color hexColorOr(String? s, Color fallback) {
  final h = (s ?? '').replaceFirst('#', '');
  final v = h.length == 6 ? int.tryParse(h, radix: 16) : null;
  return v == null ? fallback : Color(0xFF000000 | v);
}
