import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permissions.decorator';
import { AuditService } from '../common/audit.service';
import { Channel, CHANNELS, NotificationsService } from './notifications.service';

class RuleDto {
  @IsArray() @ArrayMaxSize(4) @IsIn(CHANNELS as unknown as string[], { each: true }) channels: Channel[];
  @IsBoolean() isActive: boolean;
}

class PrefItemDto {
  @IsString() @MaxLength(60) eventCode: string;
  @IsArray() @ArrayMaxSize(4) @IsIn(CHANNELS as unknown as string[], { each: true }) channels: string[];
}

class PrefsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PrefItemDto) items: PrefItemDto[];
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService, private readonly audit: AuditService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string) {
    const [items, unreadCount] = await Promise.all([this.svc.list(u.id, unread === '1'), this.svc.unreadCount(u.id)]);
    return { items, unreadCount };
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() u: AuthUser) {
    return this.svc.markRead(u.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.markRead(u.id, id);
  }

  /** Kullanıcının olay bazında seçtiği kanallar. */
  @Get('prefs')
  prefs(@CurrentUser() u: AuthUser) {
    return this.svc.getPrefs(u.id);
  }

  @Put('prefs')
  savePrefs(@CurrentUser() u: AuthUser, @Body() dto: PrefsDto) {
    return this.svc.savePrefs(u.id, dto.items);
  }

  /** Kendime tüm kanallardan deneme bildirimi; kanal bazında sonuç döner. */
  @Post('test')
  @HttpCode(200)
  async test(@CurrentUser() u: AuthUser) {
    const channels = this.svc.availableChannels().map((c) => c.channel);
    const results = await this.svc.deliver(u.id, {
      type: 'system.test', title: 'Deneme bildirimi', body: 'Bildirim kanallarınız çalışıyor.', link: '/settings',
    }, channels);
    return { results };
  }

  @Get('rules')
  @RequirePermission('notification.manage')
  async rules() {
    return { rules: await this.svc.listRules(), channels: this.svc.availableChannels() };
  }

  @Put('rules/:eventCode')
  @RequirePermission('notification.manage')
  async saveRule(@CurrentUser() u: AuthUser, @Param('eventCode') eventCode: string, @Body() dto: RuleDto) {
    const r = await this.svc.saveRule(eventCode, [...new Set(dto.channels)], dto.isActive);
    if (!r) throw new NotFoundException('Kural bulunamadı');
    await this.audit.log(u.id, 'notification.rule_update', 'notification_rule', eventCode, dto);
    return r;
  }
}
