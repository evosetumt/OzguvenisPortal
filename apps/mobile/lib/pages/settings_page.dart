import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../core/auth.dart';
import '../core/theme.dart';
import '../widgets/glass.dart';
import 'settings/account_settings.dart';
import 'settings/appearance_settings.dart';
import 'settings/chat_archive.dart';
import 'settings/erp_settings.dart';
import 'settings/expense_settings.dart';
import 'settings/mail_settings.dart';
import 'settings/notification_settings.dart';
import 'settings/payment_settings.dart';
import 'settings/roles_settings.dart';
import 'settings/users_admin.dart';
import 'settings/whatsapp_settings.dart';

class _Tab {
  final String id, label;
  final IconData icon;
  final bool show;
  const _Tab(this.id, this.label, this.icon, this.show);
}

/// Ayarlar sekmeleri: kullanıcı yalnızca yetkisi olanları görür; seçili sekme adreste (?tab=) tutulur.
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _keys = <String, GlobalKey>{};
  String? _shown;

  List<_Tab> _tabs(AuthController a) => [
        const _Tab('account', 'Hesap', LucideIcons.keyRound, true),
        const _Tab('appearance', 'Görünüm', LucideIcons.palette, true),
        const _Tab('notifications', 'Bildirimlerim', LucideIcons.bell, true),
        _Tab('rules', 'Bildirim kuralları', LucideIcons.bellRing, a.can('notification.manage')),
        _Tab('users', 'Kullanıcılar', LucideIcons.users, a.can('user.manage')),
        _Tab('roles', 'Roller ve yetkiler', LucideIcons.shieldCheck, a.can('user.manage')),
        _Tab('departments', 'Departmanlar', LucideIcons.building2, a.can('user.manage')),
        _Tab('expense', 'Masraf', LucideIcons.receipt, a.can('expense.accounting') || a.can('user.manage')),
        _Tab('payment', 'Ödeme', LucideIcons.banknote, a.me?.permissions['payment.manage'] == 'all'),
        _Tab('whatsapp', 'WhatsApp', LucideIcons.messageCircle, a.can('whatsapp.send')),
        _Tab('erp', 'Netsis', LucideIcons.refreshCw, a.can('erp.manage')),
        _Tab('chat-archive', 'Sohbet arşivi', LucideIcons.archive, a.can('chat.audit')),
      ].where((t) => t.show).toList();

  Widget _panel(String tab) => switch (tab) {
        'appearance' => const AppearanceSettings(),
        'notifications' => const MyNotifications(),
        'rules' => const Column(children: [RulesAdmin(), MailSettings()]),
        'users' => const UsersAdmin(part: 'users'),
        'roles' => const RolesSettings(),
        'departments' => const UsersAdmin(part: 'departments'),
        'expense' => const ExpenseSettings(),
        'payment' => const PaymentSettings(),
        'whatsapp' => const WhatsappSettings(),
        'erp' => const ErpSettings(),
        'chat-archive' => const ChatArchive(),
        _ => const PasswordForm(),
      };

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.watch<AuthController>();
    final tabs = _tabs(auth);
    final want = GoRouterState.of(context).uri.queryParameters['tab'];
    final tab = tabs.any((x) => x.id == want) ? want! : 'account';

    // Telefonda sekmeler yatay kayar: seçili sekmeyi görünür alana getir.
    if (_shown != tab) {
      _shown = tab;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _keys[tab]?.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, alignment: .5, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });
    }

    return ListView(padding: const EdgeInsets.only(bottom: 24), children: [
      const PageHead(title: 'Ayarlar', sub: 'Hesap, bildirim ve yönetim ayarları'),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(children: [
          for (final x in tabs)
            Padding(
              key: _keys.putIfAbsent(x.id, GlobalKey.new),
              padding: const EdgeInsets.only(right: 8),
              child: Semantics(
                button: true, selected: tab == x.id,
                child: Material(
                  color: tab == x.id ? t.accent : t.fill, shape: const StadiumBorder(),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: () => context.go('/settings?tab=${x.id}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Row(children: [
                        Icon(x.icon, size: 16, color: tab == x.id ? Colors.white : t.text2),
                        const SizedBox(width: 6),
                        Text(x.label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: tab == x.id ? Colors.white : t.text2)),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 14),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: KeyedSubtree(key: ValueKey(tab), child: _panel(tab))),
    ]);
  }
}
