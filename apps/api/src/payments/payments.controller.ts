import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { SettingsService } from '../common/settings.service';
import { scopeOf } from '../common/scope';
import { PaymentsService } from './payments.service';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { AssignPaymentDto, PAYMENT_STATUSES, PAYMENT_TYPES, PaymentDto, PaymentSettingsDto, UpdatePaymentDto } from './payments.dto';

const requireAll = (u: AuthUser) => {
  if (scopeOf(u, 'payment.manage') !== 'all') throw new ForbiddenException('Bu işlem için tüm birimlerde ödeme yönetme yetkisi gerekir');
};
const oneOf = <T extends readonly string[]>(list: T, v?: string) => (v && (list as readonly string[]).includes(v) ? v : undefined);

/** Okuma uçlarında izin kontrolü serviste yapılır: birim yöneticisi payment.read izni olmasa da kendi biriminin ödemelerini görür. */
@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(
    private readonly svc: PaymentsService,
    private readonly scheduler: PaymentSchedulerService,
    private readonly settings: SettingsService,
  ) {}

  @Get('summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.svc.summary(u);
  }

  @Get('settings')
  async getSettings() {
    return { defaultLeadDays: await this.svc.defaultLeadDays() };
  }

  @Put('settings')
  async putSettings(@CurrentUser() u: AuthUser, @Body() dto: PaymentSettingsDto) {
    requireAll(u);
    await this.settings.set('payment.defaultLeadDays', dto.defaultLeadDays);
    await this.scheduler.run(); // kısalan/uzayan ön süre hemen uygulansın
    return dto;
  }

  @Post('run')
  run(@CurrentUser() u: AuthUser) {
    requireAll(u);
    return this.scheduler.run();
  }

  @Get()
  list(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('departmentId') departmentId?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.list(u, {
      status: status === 'open' || status === 'all' ? status : oneOf(PAYMENT_STATUSES, status),
      type: oneOf(PAYMENT_TYPES, type),
      departmentId: departmentId && /^\d+$/.test(departmentId) ? Number(departmentId) : undefined,
      q: q?.trim() || undefined,
    });
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(u, id);
  }

  @Post()
  @RequirePermission('payment.manage')
  create(@CurrentUser() u: AuthUser, @Body() dto: PaymentDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermission('payment.manage')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePaymentDto) {
    return this.svc.update(u, id, dto);
  }

  @Post(':id/assign')
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignPaymentDto) {
    return this.svc.assign(u, id, dto.assigneeId);
  }

  @Post(':id/pay')
  pay(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.pay(u, id);
  }

  @Post(':id/cancel')
  @RequirePermission('payment.manage')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(u, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('payment.manage')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(u, id);
  }
}
