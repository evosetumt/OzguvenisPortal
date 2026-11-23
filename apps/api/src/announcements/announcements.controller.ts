import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permissions.decorator';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementDto } from './announcements.dto';

@Controller('announcements')
@UseGuards(AuthGuard)
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  /** Herkes: kendisine açık, yayında olan duyurular. */
  @Get('active')
  active(@CurrentUser() u: AuthUser) {
    return this.svc.active(u);
  }

  @Get()
  @RequirePermission('announcement.manage')
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u);
  }

  @Post()
  @RequirePermission('announcement.manage')
  create(@CurrentUser() u: AuthUser, @Body() dto: AnnouncementDto) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  @RequirePermission('announcement.manage')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AnnouncementDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('announcement.manage')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(u, id);
  }
}
