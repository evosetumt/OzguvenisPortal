import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CalendarEventDto, UpdateCalendarEventDto } from './calendar.dto';

@Controller('calendar')
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  @Get()
  @RequirePermission('calendar.read')
  range(@CurrentUser() u: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    if (!from || !to) throw new BadRequestException('from ve to gerekli');
    return this.svc.range(u, new Date(from), new Date(to));
  }

  @Post()
  @RequirePermission('calendar.read')
  create(@CurrentUser() u: AuthUser, @Body() dto: CalendarEventDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermission('calendar.read')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCalendarEventDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('calendar.read')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(u, id);
  }
}
