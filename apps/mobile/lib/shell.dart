import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'core/auth.dart';
import 'core/realtime.dart';
import 'core/theme.dart';
import 'modules.dart';
import 'pages/calls/call_layer.dart';
import 'pages/chat/unread.dart';
import 'widgets/avatar.dart';
import 'widgets/glass.dart';

/// Web Shell.tsx'in telefon düzeni: üstte araç çubuğu, altta cam sekme çubuğu (ilk 4 bölüm + tüm bölümleri açan Menü).
class Shell extends StatefulWidget {
  const Shell({super.key, required this.child});
  final Widget child;
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  late final UnreadMessages unread;

  @override
  void initState() {
    super.initState();
    unread = UnreadMessages(context.read<AuthController>().me!.id)..start();
    WidgetsBinding.instance.addObserver(this);
    // Yönetici rolümü/yetkilerimi değiştirdi: menü ve erişim hemen güncellensin.
    Realtime.socket.on('auth:changed', (_) => mounted ? context.read<AuthController>().reloadSession() : null);
  }

  @override
  void dispose() {
    unread.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) => Realtime.setVisible(s == AppLifecycleState.resumed);

  @override
  void didChangePlatformBrightness() => context.read<ThemeController>().setSystem(WidgetsBinding.instance.platformDispatcher.platformBrightness);

  void _menu(List<NavItem> items) {
    showGlassSheet(context, builder: (c) => _MenuSheet(items: items));
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final theme = context.watch<ThemeController>();
    final t = context.tk;
    final items = navItems.where((n) => n.perm.isEmpty || auth.canAny(n.perm)).toList();
    final loc = GoRouterState.of(context).uri.path;
    bool active(NavItem n) => n.path == '/' ? loc == '/' : loc.startsWith(n.path);
    final tabs = items.take(4).toList();
    final inTabs = tabs.any(active);
    final title = items.where(active).map((e) => e.label).firstOrNull ?? '';

    return CallLayer(child: Scaffold(
      extendBody: true,
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
            child: Glass(
              radius: 99, padding: const EdgeInsets.all(6),
              child: Row(children: [
                const SizedBox(width: 12),
                Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: t.text))),
                if (auth.can('task.write')) _iconBtn(LucideIcons.plus, () => context.go('/tasks?new=1')),
                _iconBtn(theme.isDark ? LucideIcons.sun : LucideIcons.moon, theme.toggle),
                _iconBtn(LucideIcons.bell, () => context.push('/notifications')),
              ]),
            ),
          ),
          Expanded(child: widget.child),
        ]),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
          child: Glass(
            radius: 99, padding: const EdgeInsets.all(6),
            child: Row(children: [
              for (final n in tabs) Expanded(child: ListenableBuilder(listenable: unread, builder: (_, __) => _tab(n.icon, n.label.split(' ').first, active(n), () => context.go(n.path), dot: n.path == '/messages' && unread.count > 0))),
              Expanded(child: _tab(LucideIcons.layoutGrid, 'Menü', !inTabs, () => _menu(items))),
            ]),
          ),
        ),
      ),
    ));
  }

  Widget _iconBtn(IconData i, VoidCallback f) => IconButton(onPressed: f, icon: Icon(i, size: 21), color: context.tk.text, visualDensity: VisualDensity.compact);

  Widget _tab(IconData icon, String label, bool on, VoidCallback f, {bool dot = false}) {
    final t = context.tk;
    return InkWell(
      borderRadius: BorderRadius.circular(99), onTap: f,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(99), color: on ? t.fill2 : Colors.transparent),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Stack(clipBehavior: Clip.none, children: [
            Icon(icon, size: 21, color: on ? t.accentInk : t.text2),
            if (dot) Positioned(right: -3, top: -2, child: Container(width: 8, height: 8, decoration: BoxDecoration(color: t.danger, shape: BoxShape.circle))),
          ]),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: on ? t.text : t.text2)),
        ]),
      ),
    );
  }
}

/// Web "sheet": tüm bölümler ızgarası + kullanıcı satırı.
class _MenuSheet extends StatelessWidget {
  const _MenuSheet({required this.items});
  final List<NavItem> items;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    final auth = context.watch<AuthController>();
    final me = auth.me!;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(18),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          GridView.count(
            crossAxisCount: 4, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 10, crossAxisSpacing: 6, childAspectRatio: .86,
            children: [
              for (final n in items)
                InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () { Navigator.pop(context); context.go(n.path); },
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(width: 52, height: 52, decoration: BoxDecoration(color: t.fill, borderRadius: BorderRadius.circular(18)), child: Icon(n.icon, size: 22, color: t.text)),
                    const SizedBox(height: 6),
                    Text(n.label, textAlign: TextAlign.center, maxLines: 2, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: t.text)),
                  ]),
                ),
            ],
          ),
          Divider(color: t.sep, height: 28),
          Row(children: [
            Expanded(child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () { Navigator.pop(context); context.push('/profile/${me.id}'); },
              child: Row(children: [
                Avatar(name: me.fullName, src: me.avatarUrl, presence: me.presence ?? 'online'),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(me.fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: FontWeight.w600, color: t.text)),
                  Text('Profilim ve fotoğrafım', style: TextStyle(fontSize: 12.5, color: t.text2)),
                ])),
              ]),
            )),
            IconButton(onPressed: () { Navigator.pop(context); auth.logout(); }, icon: const Icon(LucideIcons.logOut, size: 18)),
          ]),
        ]),
      ),
    );
  }
}
