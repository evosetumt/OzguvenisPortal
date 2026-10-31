import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { ReportsService } from './reports.service';

const RANGES = [7, 30, 90];

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  /** Görev analizi: dönem özeti ve önceki dönemle karşılaştırma, günlük seri, proje, iş yükü, zamanında bitirme. days: 7 | 30 | 90. */
  @Get('tasks')
  @RequirePermission('report.read')
  tasks(@CurrentUser() u: AuthUser, @Query('days') days?: string) {
    const d = Number(days);
    return this.svc.tasks(u, RANGES.includes(d) ? d : 30);
  }

  /** Ana sayfa panosu: kapsam görev okuma iznine göre; izni olmayan boş liste alır. */
  @Get('home')
  home(@CurrentUser() u: AuthUser) {
    return this.svc.home(u);
  }
}
