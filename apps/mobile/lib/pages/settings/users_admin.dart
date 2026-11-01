import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/api.dart';
import '../../core/live.dart';
import '../../core/theme.dart';
import '../../models/settings.dart';
import '../../widgets/glass.dart';
import 'common.dart';

List<T> _decode<T>(dynamic j, T Function(Map<String, dynamic>) f) =>
    ((j as List?) ?? const []).whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();

/// Kullanıcılar ve Departmanlar sekmeleri (web UsersAdmin). Telefonda tablo kart listesine dönüşür.
class UsersAdmin extends StatefulWidget {
  const UsersAdmin({super.key, required this.part});
  final String part; // users | departments
  @override
  State<UsersAdmin> createState() => _UsersAdminState();
}

class _UsersAdminState extends State<UsersAdmin> {
  late final users = ApiData<List<AdminUser>>('/users', decode: (j) => _decode(j, AdminUser.fromJson));
  late final roles = ApiData<List<Role>>('/roles', decode: (j) => _decode(j, Role.fromJson));
  late final depts = ApiData<List<Department>>('/departments', decode: (j) => _decode(j, Department.fromJson));
  final deptName = TextEditingController();

  @override
  void dispose() { users.dispose(); roles.dispose(); depts.dispose(); deptName.dispose(); super.dispose(); }

  Future<void> addDept() async {
    if (deptName.text.trim().isEmpty) return;
    try {
      await Api.i.post('/departments', {'name': deptName.text});
      deptName.clear();
      depts.reload();
    } catch (e) { if (mounted) showToast(context, e is ApiError ? e.message : 'Eklenemedi'); }
  }

  Future<void> setManager(Department d, int? managerId) async {
    try {
      await Api.i.patch('/departments/${d.id}', {'managerId': managerId});
    } catch (e) { if (mounted) showToast(context, e is ApiError ? e.message : 'Kaydedilemedi'); }
    depts.reload();
  }

  void edit(AdminUser? u) => showGlassSheet(context, builder: (c) => UserForm(
        user: u, roles: roles.data ?? const [], depts: depts.data ?? const [],
        onSaved: () { Navigator.pop(c); users.reload(); },
      ));

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([users, roles, depts]),
        builder: (c, _) => widget.part == 'users' ? _users(c) : _departments(c),
      );

  Widget _users(BuildContext context) {
    final t = context.tk;
    return Panel(
      title: 'Kullanıcılar',
      trailing: smBtn('Kullanıcı', () => edit(null), primary: true, icon: LucideIcons.plus),
      children: [
        errLine(context, users.error),
        if (users.data == null && users.error.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
        for (final u in users.data ?? const <AdminUser>[])
          InkWell(
            onTap: () => edit(u),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(u.fullName, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: t.text))),
                  u.status == 'active' ? Text('Aktif', style: TextStyle(color: t.text2)) : Text('Pasif', style: TextStyle(color: t.danger)),
                ]),
                const SizedBox(height: 2),
                Text(u.email, style: TextStyle(fontSize: 14, color: t.text2)),
                const SizedBox(height: 6),
                Text(
                  'Departman: ${u.departmentName ?? '—'} · Plasiyer: ${u.erpRepCode ?? '—'}\n'
                  'Roller: ${u.roles.map((r) => r.name).join(', ').isEmpty ? '—' : u.roles.map((r) => r.name).join(', ')}\n'
                  'Son giriş: ${u.lastLoginAt != null ? timeAgo(u.lastLoginAt!) : '—'}',
                  style: TextStyle(fontSize: 13.5, height: 1.4, color: t.text3),
                ),
              ]),
            ),
          ),
      ],
    );
  }

  Widget _departments(BuildContext context) {
    final t = context.tk;
    final active = (users.data ?? const <AdminUser>[]).where((u) => u.status == 'active').toList();
    return Panel(title: 'Departmanlar', children: [
      for (final d in depts.data ?? const <Department>[])
        Container(
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: t.sep))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(d.name, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: t.text)),
            const SizedBox(height: 6),
            Sel<int>(
              value: active.any((u) => u.id == d.managerId) ? d.managerId : null,
              items: [
                const DropdownMenuItem<int?>(value: null, child: Text('Yönetici yok')),
                for (final u in active) DropdownMenuItem<int?>(value: u.id, child: Text(u.fullName)),
              ],
              onChanged: (v) => setManager(d, v),
            ),
          ]),
        ),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: TextField(controller: deptName, maxLength: 120, onChanged: (_) => setState(() {}), onSubmitted: (_) => addDept(),
            decoration: const InputDecoration(hintText: 'Yeni departman adı', counterText: ''))),
        const SizedBox(width: 8),
        smBtn('Ekle', deptName.text.trim().isEmpty ? null : addDept, primary: true),
      ]),
    ]);
  }
}

/// Kullanıcı ekle/düzenle formu (web UserForm; modal yerine alt sayfa).
class UserForm extends StatefulWidget {
  const UserForm({super.key, this.user, required this.roles, required this.depts, required this.onSaved});
  final AdminUser? user;
  final List<Role> roles;
  final List<Department> depts;
  final VoidCallback onSaved;
  @override
  State<UserForm> createState() => _UserFormState();
}

class _UserFormState extends State<UserForm> {
  late final AdminUser? u = widget.user;
  late final email = TextEditingController(text: u?.email ?? '');
  late final fullName = TextEditingController(text: u?.fullName ?? '');
  late final phone = TextEditingController(text: u?.phone ?? '');
  late final title = TextEditingController(text: u?.title ?? '');
  late final erp = TextEditingController(text: u?.erpRepCode ?? '');
  final password = TextEditingController();
  late int? departmentId = u?.departmentId;
  late String status = u?.status ?? 'active';
  late final Set<int> roleIds = {...?u?.roles.map((r) => r.id)};
  String error = '';
  bool busy = false;

  @override
  void dispose() {
    for (final c in [email, fullName, phone, title, erp, password]) { c.dispose(); }
    super.dispose();
  }

  Future<void> submit() async {
    setState(() => error = '');
    if (fullName.text.trim().length < 2) { setState(() => error = 'Ad soyad en az 2 karakter olmalı'); return; }
    if (u == null && (email.text.trim().isEmpty || password.text.length < 8)) { setState(() => error = 'E-posta ve en az 8 karakterli şifre gerekli'); return; }
    if (u != null && password.text.isNotEmpty && password.text.length < 8) { setState(() => error = 'Şifre en az 8 karakter olmalı'); return; }
    final base = <String, dynamic>{
      'fullName': fullName.text,
      if (phone.text.isNotEmpty) 'phone': phone.text else if (u != null) 'phone': null,
      'title': title.text.trim().isEmpty ? null : title.text.trim(),
      'departmentId': departmentId,
      'erpRepCode': erp.text.trim().isEmpty ? null : erp.text.trim(),
      'roleIds': roleIds.toList(),
    };
    setState(() => busy = true);
    try {
      if (u != null) {
        await Api.i.patch('/users/${u!.id}', {...base, 'status': status, if (password.text.isNotEmpty) 'password': password.text});
      } else {
        await Api.i.post('/users', {...base, 'email': email.text, 'password': password.text});
      }
      widget.onSaved();
      return;
    } catch (e) {
      error = e is ApiError ? e.message : 'Kaydedilemedi';
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(u != null ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: t.text)),
        const SizedBox(height: 14),
        Fld('Ad soyad', fullName, maxLength: 150),
        Fld('Unvan', title, maxLength: 120, hint: 'ör. Satış Müdürü'),
        Fld('E-posta', email, keyboard: TextInputType.emailAddress, enabled: u == null),
        Fld('Telefon', phone, maxLength: 30, keyboard: TextInputType.phone),
        Fld(u != null ? 'Yeni şifre (boş: değişmez)' : 'Şifre', password, obscure: true, autofill: const [AutofillHints.newPassword]),
        Sel<int>(
          label: 'Departman', value: departmentId,
          items: [
            const DropdownMenuItem<int?>(value: null, child: Text('—')),
            for (final d in widget.depts) DropdownMenuItem<int?>(value: d.id, child: Text(d.name)),
          ],
          onChanged: (v) => setState(() => departmentId = v),
        ),
        Fld('Netsis plasiyer kodu', erp, maxLength: 20, hint: 'Sipariş/cari kapsamı için (ör. P01)'),
        if (u != null)
          Sel<String>(
            label: 'Durum', value: status,
            items: const [DropdownMenuItem<String?>(value: 'active', child: Text('Aktif')), DropdownMenuItem<String?>(value: 'disabled', child: Text('Pasif'))],
            onChanged: (v) => setState(() => status = v ?? 'active'),
          ),
        Padding(padding: const EdgeInsets.only(bottom: 6, left: 2), child: Text('Roller', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: t.text2))),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final r in widget.roles)
            ChipBtn(r.name, roleIds.contains(r.id), () => setState(() => roleIds.contains(r.id) ? roleIds.remove(r.id) : roleIds.add(r.id))),
        ]),
        const SizedBox(height: 10),
        Text('Rol ve departman değişiklikleri kullanıcının bir sonraki girişinde geçerli olur.', style: TextStyle(fontSize: 13, color: t.text3)),
        if (error.isNotEmpty) Msg(false, error),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          PillButton(label: 'Vazgeç', onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 8),
          PillButton(label: 'Kaydet', primary: true, busy: busy, onPressed: submit),
        ]),
      ]),
    );
  }
}
