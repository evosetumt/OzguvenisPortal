export interface PeriodStats { completed: number; onTime: number; late: number; onTimeRate: number | null; avgCycleDays: number | null }

export interface TaskReport {
  period: { from: string; to: string; days: number; scope: 'all' | 'department' | 'own' };
  capacity: number;
  current: PeriodStats;
  previous: PeriodStats;
  open: number;
  overdue: number;
  daily: { date: string; completed: number; created: number; prevCompleted: number }[];
  byProject: { project: { id: number; name: string; color: string } | null; completed: number; share: number | null }[];
  workload: { user: { id: number; fullName: string; department: string | null }; open: number; overdue: number; completed: number }[];
  slowest: { id: number; title: string; ageDays: number; overdue: boolean; project: { name: string; color: string } | null; assignee: string | null }[];
  erp: { open: number; autoClosed: number; manualClosed: number; avgLeadDays: number | null };
}
