import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/user.dart';
import '../widgets/avatar.dart';
import '../widgets/glass.dart';
import 'shared/format.dart';
import 'shared/ui.dart';

Color deptHue(int? id) => id == null || id == 0 ? Colors.grey : HSLColor.fromAHSL(1, deptHueDeg(id), .7, .62).toColor();

/// Web TeamPage: kişi kartları (durum, unvan, birim, iş yükü). Profil '/profile/:id' rotasında açılır.
class TeamPage extends StatefulWidget {
  const TeamPage({super.key});
  @override
  State<TeamPage> createState() => _TeamPageState();
}

class _TeamPageState extends State<TeamPage> {
  int? dept; // null = tümü
  String q = '';

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.watch<AuthController>();
    final meId = auth.me!.id;
    return ApiView<TeamData>(
      path: '/team',
      decode: (j) => TeamData.fromJson(Map<String, dynamic>.from(j)),
      builder: (context, data, reload) {
        final members = data.members;
        final depts = <int, (String, int)>{};
        for (final x in members) {
          final d = x.department;
          if (d != null) depts[d.id] = (d.name, (depts[d.id]?.$2 ?? 0) + 1);
        }
        final deptList = depts.entries.toList()..sort((a, b) => b.value.$2 - a.value.$2);
        final ql = q.trim().toLowerCase();
        final shown = members
            .where((x) => dept == null || x.department?.id == dept)
            .where((x) => ql.isEmpty || '${x.fullName} ${x.title ?? ''} ${x.department?.name ?? ''}'.toLowerCase().contains(ql))
            .toList()
          ..sort((a, b) => a.id == meId ? -1 : (b.id == meId ? 1 : 0));
        final online = members.where((x) => x.presence == 'online').length;
        final focus = members.where((x) => x.presence == 'focus').length;
        final withLoad = members.where((x) => x.workload != null).toList();
        final cap = data.capacity < 1 ? 1 : data.capacity;
        final avgLoad = withLoad.isEmpty ? null : (withLoad.fold<double>(0, (s, x) => s + (x.workload!.open / cap).clamp(0, 1)) / withLoad.length * 100).round();

        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(padding: const EdgeInsets.only(bottom: 110), children: [
            PageHead(title: 'Ekip', sub: '${members.length} kişi · ${depts.length} birim', actions: [
              if (auth.can('user.manage')) PillButton(label: 'Kişi ekle', icon: LucideIcons.userPlus, primary: true, onPressed: () => context.go('/settings?tab=users')),
            ]),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(children: [
                Expanded(child: StatTile('Çevrimiçi', '$online', small: '/ ${members.length}')),
                const SizedBox(width: 8),
                Expanded(child: StatTile('Odakta', '$focus')),
                if (avgLoad != null) ...[const SizedBox(width: 8), Expanded(child: StatTile('Ortalama yük', '%$avgLoad'))],
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: TextField(
                decoration: const InputDecoration(hintText: 'Kişi ara…', prefixIcon: Icon(LucideIcons.search, size: 16)),
                onChanged: (v) => setState(() => q = v),
              ),
            ),
            SizedBox(
              height: 40,
              child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 14), children: [
                FilterChip2(label: 'Tümü', on: dept == null, onTap: () => setState(() => dept = null)),
                for (final d in deptList) Padding(padding: const EdgeInsets.only(left: 8), child: FilterChip2(label: d.value.$1, on: dept == d.key, onTap: () => setState(() => dept = d.key))),
              ]),
            ),
            const SizedBox(height: 10),
            for (final x in shown) _card(context, x, meId, cap),
            if (shown.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Text('Eşleşen kişi yok', style: TextStyle(color: t.text2))),
          ]),
        );
      },
    );
  }

  Widget _card(BuildContext context, Member x, int meId, int cap) {
    final t = context.tk;
    final pctLoad = x.workload == null ? 0.0 : (x.workload!.open / cap).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
      child: Glass(
        radius: 22, padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(14), onTap: () => context.push('/profile/${x.id}'),
                child: Row(children: [
                  Avatar(name: x.fullName, src: x.avatarUrl, size: 48, presence: x.presence),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(x.fullName, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text))),
                      if (x.id == meId) Padding(padding: const EdgeInsets.only(left: 6), child: Chip2('Sen', color: t.accentInk, bg: t.accentSoft)),
                    ]),
                    Text(x.title ?? (x.isManager ? 'Birim yöneticisi' : '—'), overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: t.text2)),
                  ])),
                ]),
              ),
            ),
            if (x.isManager) Chip2('Yönetici', color: t.accentInk, bg: t.accentSoft),
          ]),
          const SizedBox(height: 10),
          Wrap(spacing: 12, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              PresenceDot(x.presence), const SizedBox(width: 6),
              Text(presenceLabel[x.presence] ?? 'Uzakta', style: TextStyle(fontSize: 13.5, color: t.text2)),
            ]),
            if (x.department != null) Chip2(x.department!.name, dot: deptHue(x.department!.id)),
          ]),
          const SizedBox(height: 10),
          if (x.workload != null)
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(TextSpan(children: [
                TextSpan(text: 'İş yükü  ', style: TextStyle(fontSize: 12.5, color: t.text2)),
                TextSpan(text: '${x.workload!.open}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.text)),
                TextSpan(text: ' / $cap', style: TextStyle(fontSize: 13, color: t.text2)),
              ])),
              const SizedBox(height: 6),
              ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: pctLoad, minHeight: 6, backgroundColor: t.fill2, color: x.workload!.open > cap ? t.danger : t.accent)),
            ])
          else
            Text(x.email, style: TextStyle(fontSize: 13.5, color: t.text2)),
          const SizedBox(height: 10),
          Row(children: [
            if (x.workload != null)
              Expanded(child: Text.rich(TextSpan(children: [
                TextSpan(text: '${x.workload!.open}', style: const TextStyle(fontWeight: FontWeight.w700)),
                const TextSpan(text: ' açık görev'),
                if (x.workload!.overdue > 0) TextSpan(text: ' · ${x.workload!.overdue} geciken', style: TextStyle(color: t.danger)),
              ]), style: TextStyle(fontSize: 13.5, color: t.text2)))
            else
              const Spacer(),
            PillButton(label: 'Profil', onPressed: () => context.push('/profile/${x.id}')),
            if (x.id != meId) Padding(padding: const EdgeInsets.only(left: 8), child: IconButton(tooltip: 'Mesaj gönder', icon: const Icon(LucideIcons.messageSquare, size: 17), onPressed: () => context.go('/messages?to=${x.id}'))),
          ]),
        ]),
      ),
    );
  }
}
