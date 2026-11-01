import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../core/api.dart';
import '../core/realtime.dart';
import '../core/theme.dart';
import '../models/task.dart';
import '../widgets/glass.dart';
import 'shared/format.dart';
import 'shared/ui.dart';

/// Web NotificationsBell'in tam ekran karşılığı: bildirim listesi, tek tek / toplu okundu işareti.
class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> with SocketEvents<NotificationsPage> {
  List<NotificationItem> items = [];
  int unread = 0;
  bool loaded = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    // WebSocket koparsa yedek olarak periyodik yoklama
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
    onSocket('notification:new', (d) {
      final n = NotificationItem.fromJson(Map<String, dynamic>.from(d as Map));
      setState(() {
        if (!items.any((x) => x.id == n.id)) items = [n, ...items].take(30).toList();
        unread++;
      });
    });
    Realtime.socket.on('connect', _onConnect);
  }

  void _onConnect(dynamic _) { if (mounted) _load(); }

  @override
  void dispose() {
    _poll?.cancel();
    Realtime.socket.off('connect', _onConnect);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Api.i.get('/notifications');
      if (!mounted) return;
      setState(() {
        items = [for (final e in (r['items'] as List)) NotificationItem.fromJson(Map<String, dynamic>.from(e))];
        unread = (r['unreadCount'] as num?)?.toInt() ?? 0;
        loaded = true;
      });
    } catch (_) {
      if (mounted) setState(() => loaded = true);
    }
  }

  Future<void> _open(NotificationItem n) async {
    if (n.readAt == null) {
      setState(() {
        items = [for (final x in items) x.id == n.id ? x.read() : x];
        unread = unread > 0 ? unread - 1 : 0;
      });
      Api.i.post('/notifications/${n.id}/read').catchError((_) {});
    }
    if (n.link != null && n.link!.isNotEmpty) context.go(n.link!);
  }

  Future<void> _readAll() async {
    try { await Api.i.post('/notifications/read-all'); } catch (_) {}
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.only(bottom: 110), children: [
        PageHead(title: 'Bildirimler', actions: [
          if (unread > 0) PillButton(label: 'Tümünü okundu say', icon: LucideIcons.checkCheck, onPressed: _readAll),
        ]),
        if (!loaded) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())),
        if (loaded && items.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: emptyText(context, 'Bildirim yok.')),
        for (final n in items)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
            child: Glass(
              radius: 18, onTap: () => _open(n), padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(width: 9, height: 9, margin: const EdgeInsets.only(top: 6, right: 10), decoration: BoxDecoration(color: n.readAt == null ? t.accent : Colors.transparent, shape: BoxShape.circle)),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(n.title, style: TextStyle(fontSize: 15, fontWeight: n.readAt == null ? FontWeight.w700 : FontWeight.w500, color: t.text)),
                  if (n.body != null && n.body!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(n.body!, style: TextStyle(fontSize: 14, color: t.text2))),
                  Padding(padding: const EdgeInsets.only(top: 4), child: Text(timeAgo(n.createdAt), style: TextStyle(fontSize: 12.5, color: t.text3))),
                ])),
              ]),
            ),
          ),
      ]),
    );
  }
}
