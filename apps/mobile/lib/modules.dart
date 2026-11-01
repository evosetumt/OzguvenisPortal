import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Menü ve yönlendirme kaydı (web Shell.tsx → NAV ile aynı sıra ve yetkiler). perm: herhangi biri yeterli; boşsa herkese açık.
class NavItem {
  final String path, label;
  final IconData icon;
  final List<String> perm;
  const NavItem(this.path, this.label, this.icon, [this.perm = const []]);
}

const navItems = [
  NavItem('/', 'Ana Sayfa', LucideIcons.house),
  NavItem('/tasks', 'Görevler', LucideIcons.squareCheck, ['task.read']),
  NavItem('/calendar', 'Takvim', LucideIcons.calendarDays, ['calendar.read']),
  NavItem('/messages', 'Mesajlar', LucideIcons.messageSquare),
  NavItem('/team', 'Ekip', LucideIcons.users),
  NavItem('/meetings', 'Toplantılar', LucideIcons.video),
  NavItem('/approvals', 'Onaylarım', LucideIcons.clipboardCheck),
  NavItem('/insights', 'Analiz', LucideIcons.chartColumn, ['report.read']),
  NavItem('/orders', 'Sipariş / Teklif', LucideIcons.fileText, ['order.read', 'quote.read', 'shipment.read']),
  NavItem('/accounts', 'Cari Hesaplar', LucideIcons.wallet, ['account.read']),
  NavItem('/expenses', 'Masraflar', LucideIcons.receipt, ['expense.create']),
  NavItem('/payments', 'Ödemeler', LucideIcons.banknote, ['payment.read', 'payment.manage']),
  NavItem('/tracking', 'Süre Takibi', LucideIcons.timer, ['tracking.read']),
  NavItem('/workflows', 'Akış Tasarımcısı', LucideIcons.workflow, ['workflow.design']),
  NavItem('/settings', 'Ayarlar', LucideIcons.settings),
];
