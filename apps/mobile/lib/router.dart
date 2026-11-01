import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/auth.dart';
import 'pages/accounts_page.dart';
import 'pages/approvals_page.dart';
import 'pages/calendar_page.dart';
import 'pages/expenses_page.dart';
import 'pages/home_page.dart';
import 'pages/insights_page.dart';
import 'pages/login_page.dart';
import 'pages/meetings_page.dart';
import 'pages/messages_page.dart';
import 'pages/orders_page.dart';
import 'pages/payments_page.dart';
import 'pages/settings_page.dart';
import 'pages/tasks_page.dart';
import 'pages/team_page.dart';
import 'pages/tracking_page.dart';
import 'pages/workflows_page.dart';
import 'pages/notifications_page.dart';
import 'pages/profile_page.dart';
import 'shell.dart';

/// Web App.tsx rotaları. Modül yalnızca yetkisi olana açılır; yetki kalkarsa ana sayfaya döner (asıl denetim API'dedir).
GoRouter buildRouter(AuthController auth) {
  String? guard(List<String> perm) => perm.isEmpty || auth.canAny(perm) ? null : '/';
  GoRoute r(String path, Widget page, [List<String> perm = const []]) =>
      GoRoute(path: path, redirect: (_, __) => guard(perm), pageBuilder: (c, s) => NoTransitionPage(key: s.pageKey, child: page));

  return GoRouter(
    refreshListenable: auth,
    redirect: (c, s) => auth.me == null ? (s.uri.path == '/login' ? null : '/login') : (s.uri.path == '/login' ? '/' : null),
    routes: [
      GoRoute(path: '/login', builder: (c, s) => const LoginPage()),
      ShellRoute(
        builder: (c, s, child) => Shell(child: child),
        routes: [
          r('/', const HomePage()),
          r('/tasks', const TasksPage(), ['task.read']),
          r('/calendar', const CalendarPage(), ['calendar.read']),
          r('/messages', const MessagesPage()),
          r('/team', const TeamPage()),
          r('/meetings', const MeetingsPage()),
          r('/approvals', const ApprovalsPage()),
          r('/insights', const InsightsPage(), ['report.read']),
          r('/orders', const OrdersPage(), ['order.read', 'quote.read', 'shipment.read']),
          r('/accounts', const AccountsPage(), ['account.read']),
          r('/expenses', const ExpensesPage(), ['expense.create']),
          r('/payments', const PaymentsPage(), ['payment.read', 'payment.manage']),
          r('/tracking', const TrackingPage(), ['tracking.read']),
          r('/workflows', const WorkflowsPage(), ['workflow.design']),
          r('/settings', const SettingsPage()),
          r('/notifications', const NotificationsPage()),
          GoRoute(path: '/profile/:id', builder: (c, s) => ProfilePage(userId: int.parse(s.pathParameters['id']!))),
        ],
      ),
    ],
  );
}
