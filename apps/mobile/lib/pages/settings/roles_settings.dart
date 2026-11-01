import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import '../../widgets/glass.dart';
import 'common.dart';

List<T> _dec<T>(dynamic j, T Function(Map<String, dynamic>) f) =>
    ((j as List?) ?? const []).whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();

/// Roller ve modül yetkileri (user.manage): her rol için modül modül erişim yok / kendi / departman / tümü.
class RolesSettings extends StatefulWidget {
  const RolesSettings({super.key});
  @override
  State<RolesSettings> createState() => _RolesSettingsState();
}

class _RolesSettingsState extends State<RolesSettings> {
  late final catalog = ApiData<List<ModuleDef>>('/permissions/catalog', decode: (j) => _dec(j, ModuleDef.fromJson));
  late final roles = ApiData<List<RoleRow>>('/roles', decode: (j) => _dec(j, RoleRow.fromJson));
  int? roleId;
  Map<String, String?> draft = {};
  Note? msg;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    roles.addListener(_ensureRole);
  }

  @override
  void dispose() { roles.removeListener(_ensureRole); catalog.dispose(); roles.dispose(); super.dispose(); }

  void _ensureRole() {
    final rs = roles.data;
    if (rs != null && rs.isNotEmpty && !rs.any((r) => r.id == roleId)) {
      roleId = (rs.where((r) => !r.locked).firstOrNull ?? rs.first).id;
      draft = {};
      msg = null;
    }
  }

  RoleRow? get role => roles.data?.where((r) => r.id == roleId).firstOrNull;

  String? value(String code) => draft.containsKey(code) ? draft[code] : role?.permissions[code];
  List<MapEntry<String, String?>> get changed => draft.entries.where((e) => role?.permissions[e.key] != e.value).toList();

  void pick(int id) => setState(() { roleId = id; draft = {}; msg = null; });
  void set(String code, String? s) => setState(() => draft = {...draft, code: s});
  void setModule(ModuleDef m, bool on) => setState(() {
        final n = {...draft};
        // Açınca her izin rolün en dar kapsamıyla başlar.
        for (final p in m.permissions) { n[p.code] = on ? p.scopes.first : null; }
        draft = n;
      });

  Future<void> save() async {
    final r = role;
    if (r == null || changed.isEmpty) return;
    setState(() { busy = true; msg = null; });
    try {
      final res = await Api.i.patch('/roles/${r.id}', {'permissions': {for (final e in changed) e.key: e.value}});
      final updated = RoleRow.fromJson(Map<String, dynamic>.from(res as Map));
      roles.setData([for (final x in roles.data ?? const <RoleRow>[]) x.id == updated.id ? updated : x]);
      draft = {};
      msg = Note(true, 'Kaydedildi. ${r.userCount > 0 ? 'Bu roldeki ${r.userCount} kişinin açık oturumu hemen güncellendi.' : ''}');
    } catch (e) {
      msg = Note(false, e is ApiError ? e.message : 'Kaydedilemedi');
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> remove() async {
    final r = role;
    if (r == null || !await confirmDialog(context, '"${r.name}" rolü silinsin mi?')) return;
    try {
      await Api.i.delete('/roles/${r.id}');
      roleId = null;
      await roles.reload();
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => msg = Note(false, e is ApiError ? e.message : 'Silinemedi'));
    }
  }

  void create() => showGlassSheet(context, builder: (c) => _NewRole(onCreated: (id) async {
        Navigator.pop(c);
        await roles.reload();
        if (mounted) pick(id);
      }));

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([catalog, roles]),
        builder: (c, _) {
          final t = c.tk;
          if (roles.error.isNotEmpty) return Msg(false, roles.error);
          final cat = catalog.data, rs = roles.data;
          if (cat == null || rs == null) return emptyLine(c, 'Yükleniyor…');
          final r = role;
          return Panel(
            title: 'Roller ve yetkiler', icon: LucideIcons.shieldCheck,
            trailing: smBtn('Yeni rol', create, icon: LucideIcons.plus),
            children: [
              const Hint('Kullanıcı hangi modülleri göreceğini rolünden alır; bir kişinin birden fazla rolü varsa en geniş yetki geçerlidir. Rol atamak için: Kullanıcılar sekmesi.'),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final x in rs)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChipBtn('${x.name} · ${x.userCount} kişi', x.id == roleId, () => pick(x.id)),
                    ),
                ]),
              ),
              if (r != null) ...[
                if (r.locked)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Row(children: [
                      Icon(LucideIcons.lock, size: 13, color: t.text2),
                      const SizedBox(width: 6),
                      Expanded(child: Text('Admin rolü her zaman tüm modüllere tam yetkilidir ve değiştirilemez.', style: TextStyle(fontSize: 13.5, color: t.text2))),
                    ]),
                  ),
                const SizedBox(height: 12),
                for (final m in cat) _module(c, m, r),
                if (!r.locked)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      if (r.userCount == 0) smBtn('Rolü sil', remove, icon: LucideIcons.trash2),
                      if (changed.isNotEmpty) smBtn('Vazgeç', () => setState(() => draft = {})),
                      smBtn(busy ? 'Kaydediliyor…' : changed.isNotEmpty ? 'Kaydet (${changed.length} değişiklik)' : 'Kaydet', changed.isEmpty || busy ? null : save, primary: true),
                    ]),
                  ),
                noteView(msg),
              ],
            ],
          );
        },
      );

  Widget _module(BuildContext c, ModuleDef m, RoleRow r) {
    final t = c.tk;
    final on = m.permissions.any((p) => value(p.code) != null);
    return Container(
      margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: on ? t.accentSoft : t.fill, borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Flexible(child: Text(m.label, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text))),
          if (m.financial) ...[
            const SizedBox(width: 8),
            Chip2('Finansal', color: t.orange, bg: t.orange.withValues(alpha: .16)),
          ],
          const Spacer(),
          Text(on ? 'Açık' : 'Kapalı', style: TextStyle(fontSize: 13, color: t.text2)),
          Switch(value: on, onChanged: r.locked ? null : (v) => setModule(m, v)),
        ]),
        if (on)
          for (final p in m.permissions)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: p.scopes.length == 1 && p.scopes.first == 'all'
                  ? CheckRow('${p.label} — Var', value(p.code) != null, r.locked ? null : (v) => set(p.code, v ? 'all' : null))
                  : Sel<String>(
                      label: p.label, value: value(p.code), enabled: !r.locked,
                      items: [
                        const DropdownMenuItem<String?>(value: null, child: Text('Erişim yok')),
                        for (final s in p.scopes) DropdownMenuItem<String?>(value: s, child: Text(scopeLabel[s] ?? s)),
                      ],
                      onChanged: (v) => set(p.code, v),
                    ),
            ),
      ]),
    );
  }
}

class _NewRole extends StatefulWidget {
  const _NewRole({required this.onCreated});
  final void Function(int id) onCreated;
  @override
  State<_NewRole> createState() => _NewRoleState();
}

class _NewRoleState extends State<_NewRole> {
  final name = TextEditingController();
  String error = '';
  @override
  void dispose() { name.dispose(); super.dispose(); }

  Future<void> submit() async {
    if (name.text.trim().length < 2) { setState(() => error = 'Rol adı en az 2 karakter olmalı'); return; }
    try {
      final r = await Api.i.post('/roles', {'name': name.text});
      widget.onCreated(r['id'] as int);
    } catch (e) {
      if (mounted) setState(() => error = e is ApiError ? e.message : 'Oluşturulamadı');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Yeni rol', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: t.text)),
        const SizedBox(height: 14),
        Fld('Rol adı', name, maxLength: 80, hint: 'ör. Satış Temsilcisi'),
        const Hint('Yeni rol hiçbir modüle erişimle başlamaz; oluşturduktan sonra modülleri açın.'),
        if (error.isNotEmpty) Msg(false, error),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 8),
          PillButton(label: 'Oluştur', primary: true, onPressed: submit),
        ]),
      ]),
    );
  }
}
