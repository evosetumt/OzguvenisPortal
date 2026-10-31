import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { LoginPage } from './pages/LoginPage';
import { TasksPage } from './pages/TasksPage';
import { HomePage } from './pages/HomePage';
import { CalendarPage } from './pages/CalendarPage';

// Modül sayfaları ilk açılışta indirilmez (BPMN gibi büyük kütüphaneler yalnızca gerekince yüklenir).
const page = <K extends string>(load: () => Promise<Record<K, () => JSX.Element>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const SettingsPage = page(() => import('./pages/SettingsPage'), 'SettingsPage');
const InsightsPage = page(() => import('./pages/InsightsPage'), 'InsightsPage');
const OrdersPage = page(() => import('./pages/OrdersPage'), 'OrdersPage');
const AccountsPage = page(() => import('./pages/AccountsPage'), 'AccountsPage');
const ExpensesPage = page(() => import('./pages/ExpensesPage'), 'ExpensesPage');
const ApprovalsPage = page(() => import('./pages/ApprovalsPage'), 'ApprovalsPage');
const WorkflowsPage = page(() => import('./pages/WorkflowsPage'), 'WorkflowsPage');
const TrackingPage = page(() => import('./pages/TrackingPage'), 'TrackingPage');
const PaymentsPage = page(() => import('./pages/PaymentsPage'), 'PaymentsPage');
const TeamPage = page(() => import('./pages/TeamPage'), 'TeamPage');
const MessagesPage = page(() => import('./pages/MessagesPage'), 'MessagesPage');
const MeetingsPage = page(() => import('./pages/MeetingsPage'), 'MeetingsPage');

/**
 * Modül sayfası yalnızca yetkisi olana açılır (menüde gizli olsa da adres çubuğundan girilemesin).
 * Yetki sonradan kaldırılırsa (Ayarlar → Roller ve yetkiler) açık sayfa ana sayfaya döner. Asıl denetim API'dedir.
 */
function Guard({ perm, children }: { perm: string | string[]; children: JSX.Element }) {
  const { can } = useAuth();
  return [perm].flat().some(can) ? children : <Navigate to="/" replace />;
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return <div className="boot">Yükleniyor…</div>;
  if (!me) return <Routes><Route path="*" element={<LoginPage />} /></Routes>;

  return (
    <Shell>
      <Suspense fallback={<p className="empty">Yükleniyor…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks" element={<Guard perm={'task.read'}><TasksPage /></Guard>} />
          <Route path="/calendar" element={<Guard perm={'calendar.read'}><CalendarPage /></Guard>} />
          <Route path="/insights" element={<Guard perm={'report.read'}><InsightsPage /></Guard>} />
          <Route path="/orders" element={<Guard perm={['order.read', 'quote.read', 'shipment.read']}><OrdersPage /></Guard>} />
          <Route path="/accounts" element={<Guard perm={'account.read'}><AccountsPage /></Guard>} />
          <Route path="/expenses" element={<Guard perm={'expense.create'}><ExpensesPage /></Guard>} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/workflows" element={<Guard perm={'workflow.design'}><WorkflowsPage /></Guard>} />
          <Route path="/tracking" element={<Guard perm={'tracking.read'}><TrackingPage /></Guard>} />
          <Route path="/payments" element={<Guard perm={['payment.read', 'payment.manage']}><PaymentsPage /></Guard>} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/whatsapp" element={<Navigate to="/settings?tab=whatsapp" replace />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}
