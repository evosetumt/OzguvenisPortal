import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { scopeOf } from '../common/scope';
import { TrackingService } from './tracking.service';
import { TrackingReminderService } from './tracking-reminder.service';
import {
  AttachFileDto, CATEGORIES, ITEM_STATUSES, RenewDto, TrackedItemDto, UpdateTrackedItemDto, UpdateVehicleDto, VehicleDto, VehicleServiceDto,
} from './tracking.dto';

const optInt = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const oneOf = <T extends readonly string[]>(list: T, v?: string) => (v && (list as readonly string[]).includes(v) ? v : undefined);

@Controller('tracking')
@UseGuards(AuthGuard)
export class TrackingController {
  constructor(private readonly svc: TrackingService, private readonly reminders: TrackingReminderService) {}

  @Get('summary')
  @RequirePermission('tracking.read')
  summary(@CurrentUser() u: AuthUser) {
    return this.svc.summary(u);
  }

  @Get('items')
  @RequirePermission('tracking.read')
  list(
    @CurrentUser() u: AuthUser,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('within') within?: string,
  ) {
    return this.svc.list(u, {
      category: oneOf(CATEGORIES, category),
      status: oneOf(ITEM_STATUSES, status),
      q: q?.trim() || undefined,
      vehicleId: optInt(vehicleId),
      within: optInt(within),
    });
  }

  @Get('items/:id')
  @RequirePermission('tracking.read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(u, id);
  }

  @Post('items')
  @RequirePermission('tracking.write')
  create(@CurrentUser() u: AuthUser, @Body() dto: TrackedItemDto) {
    return this.svc.create(u, dto);
  }

  @Patch('items/:id')
  @RequirePermission('tracking.write')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrackedItemDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermission('tracking.write')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(u, id);
  }

  @Post('items/:id/renew')
  @RequirePermission('tracking.write')
  renew(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RenewDto) {
    return this.svc.renew(u, id, dto);
  }

  @Post('items/:id/files')
  @RequirePermission('tracking.write')
  attach(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AttachFileDto) {
    return this.svc.attachFile(u, id, dto.attachmentId);
  }

  @Delete('items/:id/files/:attachmentId')
  @HttpCode(204)
  @RequirePermission('tracking.write')
  detach(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('attachmentId', ParseIntPipe) attachmentId: number) {
    return this.svc.detachFile(u, id, attachmentId);
  }

  @Get('vehicles')
  @RequirePermission('tracking.read')
  vehicles(@CurrentUser() u: AuthUser) {
    return this.svc.vehicles(u);
  }

  @Get('vehicles/:id')
  @RequirePermission('tracking.read')
  vehicle(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.vehicle(u, id);
  }

  @Post('vehicles')
  @RequirePermission('tracking.write')
  createVehicle(@CurrentUser() u: AuthUser, @Body() dto: VehicleDto) {
    return this.svc.createVehicle(u, dto);
  }

  @Patch('vehicles/:id')
  @RequirePermission('tracking.write')
  updateVehicle(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVehicleDto) {
    return this.svc.updateVehicle(u, id, dto);
  }

  @Delete('vehicles/:id')
  @HttpCode(204)
  @RequirePermission('tracking.write')
  removeVehicle(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeVehicle(u, id);
  }

  @Post('vehicles/:id/services')
  @RequirePermission('tracking.write')
  addService(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: VehicleServiceDto) {
    return this.svc.addService(u, id, dto);
  }

  @Delete('services/:id')
  @HttpCode(204)
  @RequirePermission('tracking.write')
  removeService(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeService(u, id);
  }

  /** Hatırlatma işini hemen çalıştırır (yalnızca tüm kayıtlarda yazma yetkisi olanlar). */
  @Post('reminders/run')
  @HttpCode(200)
  @RequirePermission('tracking.write')
  runReminders(@CurrentUser() u: AuthUser) {
    if (scopeOf(u, 'tracking.write') !== 'all') throw new ForbiddenException();
    return this.reminders.run();
  }
}
