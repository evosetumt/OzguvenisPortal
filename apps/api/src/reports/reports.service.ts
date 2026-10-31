import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../common/settings.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf, startOfTodayUtc, taskScopeWhere } from '../common/scope';

const DAY = 86400000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Dönem metrikleri: tamamlanan, zamanında oranı, ortalama tamamlanma süresi. */
interface PeriodStats { completed: number; onTime: number; late: number; cycleDays: number[] }
const emptyStats = (): PeriodStats => ({ completed: 0, onTime: 0, late: 0, cycleDays: [] });

/**
 * Görev analizleri (Analiz sayfası). Kapsam report.read izninin kapsamıdır (own / department / all).
 * 30 kullanıcılık ölçekte kapsamdaki görevler belleğe alınıp hesaplanır.
 * Seçilen dönem bugün dahil son N gündür; karşılaştırma bir önceki N gündür.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  async tasks(u: AuthUser, days: number) {
    const scope = scopeOf(u, 'report.read');
    if (!scope) throw new ForbiddenException();
    const today = startOfTodayUtc();
    const end = new Date(today.getTime() + DAY); // yarın 00:00 (hariç)
    const start = new Date(end.getTime() - days * DAY);
    const prevStart = new Date(start.getTime() - days * DAY);
    const capacity = await this.settings.get<number>('report.workloadCapacity', 8);

    const rows = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        AND: [
          taskScopeWhere(u, scope, false),
          { OR: [{ status: { isDone: false } }, { completedAt: { gte: prevStart } }, { createdAt: { gte: prevStart } }] },
        ],
      },
      select: {
        id: true, title: true, createdAt: true, completedAt: true, dueDate: true, taskType: true, completedViaErp: true,
        status: { select: { isDone: true } },
        assignee: { select: { id: true, fullName: true, department: { select: { name: true } } } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    const idx = new Map<string, number>();
    const daily = Array.from({ length: days }, (_, i) => {
      const d = new Date(start.getTime() + i * DAY);
      idx.set(key(d), i);
      return { date: key(d), completed: 0, created: 0, prevCompleted: 0 };
    });
    const cur = emptyStats();
    const prev = emptyStats();
    const byProject = new Map<number, { project: { id: number; name: string; color: string } | null; completed: number }>();
    const workload = new Map<number, { user: { id: number; fullName: string; department: string | null }; open: number; overdue: number; completed: number }>();
    const slowest: { id: number; title: string; ageDays: number; overdue: boolean; project: { name: string; color: string } | null; assignee: string | null }[] = [];
    let open = 0;
    let overdue = 0;
    const erp = { open: 0, autoClosed: 0, manualClosed: 0, leadDays: [] as number[] };

    for (const t of rows) {
      const done = t.status.isDone;
      const isOverdue = !done && !!t.dueDate && t.dueDate < today;
      const c = done && t.completedAt ? t.completedAt : null;
      const inCur = !!c && c >= start && c < end;
      const inPrev = !!c && c >= prevStart && c < start;

      const ci = idx.get(key(t.createdAt));
      if (ci !== undefined) daily[ci].created++;
      if (inCur || inPrev) {
        const s = inCur ? cur : prev;
        s.completed++;
        s.cycleDays.push((c!.getTime() - t.createdAt.getTime()) / DAY);
        // Zamanında: bitiş gününün sonuna kadar tamamlandıysa (bitiş tarihi UTC gece yarısı saklanır)
        if (t.dueDate) (c!.getTime() < t.dueDate.getTime() + DAY ? s.onTime++ : s.late++);
        const di = inCur ? idx.get(key(c!)) : idx.get(key(new Date(c!.getTime() + days * DAY)));
        if (di !== undefined) inCur ? daily[di].completed++ : daily[di].prevCompleted++;
      }
      if (inCur) {
        const pk = t.project?.id ?? 0;
        if (!byProject.has(pk)) byProject.set(pk, { project: t.project, completed: 0 });
        byProject.get(pk)!.completed++;
      }
      if (!done) {
        open++;
        if (isOverdue) overdue++;
        slowest.push({
          id: t.id, title: t.title, ageDays: Math.floor((today.getTime() - startOfTodayUtc(t.createdAt).getTime()) / DAY),
          overdue: isOverdue, project: t.project ? { name: t.project.name, color: t.project.color } : null, assignee: t.assignee?.fullName ?? null,
        });
      }
      if (t.assignee) {
        if (!workload.has(t.assignee.id)) {
          workload.set(t.assignee.id, {
            user: { id: t.assignee.id, fullName: t.assignee.fullName, department: t.assignee.department?.name ?? null }, open: 0, overdue: 0, completed: 0,
          });
        }
        const w = workload.get(t.assignee.id)!;
        if (!done) w.open++;
        if (isOverdue) w.overdue++;
        if (inCur) w.completed++;
      }
      if (t.taskType !== 'general') {
        if (!done) erp.open++;
        else if (inCur) {
          if (t.completedViaErp) erp.autoClosed++; else erp.manualClosed++;
          erp.leadDays.push((c!.getTime() - t.createdAt.getTime()) / DAY);
        }
      }
    }

    const statOut = (s: PeriodStats) => ({
      completed: s.completed, onTime: s.onTime, late: s.late,
      onTimeRate: pct(s.onTime, s.onTime + s.late), avgCycleDays: avg(s.cycleDays),
    });
    const projects = [...byProject.values()].sort((a, b) => b.completed - a.completed);
    return {
      period: { from: key(start), to: key(today), days, scope },
      capacity,
      current: statOut(cur),
      previous: statOut(prev),
      open,
      overdue,
      daily,
      byProject: projects.map((p) => ({ ...p, share: pct(p.completed, cur.completed) })),
      workload: [...workload.values()].filter((w) => w.open || w.completed).sort((a, b) => b.open - a.open || b.completed - a.completed),
      slowest: slowest.sort((a, b) => b.ageDays - a.ageDays).slice(0, 5),
      erp: { open: erp.open, autoClosed: erp.autoClosed, manualClosed: erp.manualClosed, avgLeadDays: avg(erp.leadDays) },
    };
  }

  /**
   * Ana sayfa özeti (görev kapsamı task.read'e göre: personel kendi işleri, yönetici hepsi).
   * Bu hafta (Pzt–Paz) günlük biten iş, geçen haftaya göre, proje ilerlemesi, ekip yükü, son hareketler.
   */
  async home(u: AuthUser) {
    const scope = scopeOf(u, 'task.read');
    if (!scope) return { week: [], thisWeek: 0, lastWeek: 0, projects: [], team: [], activity: [], scope: null };
    const today = startOfTodayUtc();
    const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
    const lastMonday = new Date(monday.getTime() - 7 * DAY);
    const where = { deletedAt: null, ...taskScopeWhere(u, scope) };

    const [recentDone, open, projects, comments, created] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...where, status: { isDone: true }, completedAt: { gte: lastMonday } },
        select: { id: true, title: true, completedAt: true, assignee: { select: { id: true, fullName: true } }, project: { select: { name: true, color: true } } },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: { ...where, status: { isDone: false } },
        select: { dueDate: true, assignee: { select: { id: true, fullName: true, department: { select: { name: true } } } } },
      }),
      this.prisma.project.findMany({
        where: { deletedAt: null, status: 'active' },
        select: {
          id: true, name: true, color: true,
          tasks: { where, select: { dueDate: true, status: { select: { isDone: true } }, assignee: { select: { id: true, fullName: true } } } },
        },
      }),
      this.prisma.taskComment.findMany({
        where: { task: where }, orderBy: { createdAt: 'desc' }, take: 8,
        select: { createdAt: true, body: true, user: { select: { id: true, fullName: true } }, task: { select: { id: true, title: true } } },
      }),
      this.prisma.task.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, title: true, createdAt: true, createdBy: { select: { id: true, fullName: true } }, assignee: { select: { fullName: true } } },
      }),
    ]);

    const week = Array.from({ length: 7 }, (_, i) => ({ date: key(new Date(monday.getTime() + i * DAY)), completed: 0 }));
    let thisWeek = 0, lastWeek = 0;
    for (const t of recentDone) {
      const c = t.completedAt!;
      if (c >= monday) {
        thisWeek++;
        const i = Math.floor((startOfTodayUtc(c).getTime() - monday.getTime()) / DAY);
        if (week[i]) week[i].completed++;
      } else lastWeek++;
    }

    const team = new Map<number, { id: number; fullName: string; department: string | null; open: number; overdue: number; dueToday: number }>();
    for (const t of open) {
      if (!t.assignee) continue;
      if (!team.has(t.assignee.id)) team.set(t.assignee.id, { id: t.assignee.id, fullName: t.assignee.fullName, department: t.assignee.department?.name ?? null, open: 0, overdue: 0, dueToday: 0 });
      const m = team.get(t.assignee.id)!;
      m.open++;
      if (t.dueDate && t.dueDate < today) m.overdue++;
      if (t.dueDate && key(t.dueDate) === key(today)) m.dueToday++;
    }

    const projectRows = projects
      .map((p) => {
        const total = p.tasks.length;
        const done = p.tasks.filter((t) => t.status.isDone).length;
        const upcoming = p.tasks.filter((t) => !t.status.isDone && t.dueDate && t.dueDate >= today).map((t) => t.dueDate!.getTime());
        const people = [...new Map(p.tasks.filter((t) => t.assignee).map((t) => [t.assignee!.id, t.assignee!.fullName])).values()];
        return {
          id: p.id, name: p.name, color: p.color, total, done, open: total - done,
          progress: total ? Math.round((done / total) * 100) : 0,
          overdue: p.tasks.filter((t) => !t.status.isDone && t.dueDate && t.dueDate < today).length,
          nextDue: upcoming.length ? new Date(Math.min(...upcoming)).toISOString() : null,
          people: people.slice(0, 4), peopleCount: people.length,
        };
      })
      .filter((p) => p.total > 0)
      .sort((a, b) => b.open - a.open)
      .slice(0, 6);

    const activity = [
      ...recentDone.slice(0, 8).map((t) => ({ kind: 'completed', at: t.completedAt!, who: t.assignee?.fullName ?? null, taskId: t.id, title: t.title, text: null as string | null })),
      ...comments.map((c) => ({ kind: 'commented', at: c.createdAt, who: c.user.fullName, taskId: c.task.id, title: c.task.title, text: c.body.slice(0, 120) })),
      ...created.map((t) => ({ kind: 'created', at: t.createdAt, who: t.createdBy.fullName, taskId: t.id, title: t.title, text: t.assignee ? `${t.assignee.fullName} kişisine atandı` : null })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 10);

    return {
      scope, week, thisWeek, lastWeek, projects: projectRows,
      team: [...team.values()].sort((a, b) => b.open - a.open).slice(0, 8),
      activity,
    };
  }
}
