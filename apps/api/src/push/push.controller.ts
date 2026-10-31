import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsIn, Matches } from 'class-validator';
import { createHash } from 'node:crypto';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

// FCM kayıt jetonu (web/Android) veya APNs jetonu: harf, rakam, ':', '-', '_'.
const TOKEN = /^[A-Za-z0-9:_-]{20,4096}$/;

class DeviceDto {
  @IsIn(['web', 'android', 'ios']) platform: string;
  @Matches(TOKEN, { message: 'Geçersiz bildirim jetonu' }) token: string;
}

class RemoveDeviceDto {
  @Matches(TOKEN, { message: 'Geçersiz bildirim jetonu' }) token: string;
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Push cihaz kayıtları (Firebase Cloud Messaging). Yol /notifications altındadır; bildirim modülünün parçası gibi görünür. */
@Controller('notifications')
@UseGuards(AuthGuard)
export class PushController {
  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

  /** Tarayıcının FCM jetonu alması için web yapılandırması; null ise tarayıcı bildirimleri kapalıdır. */
  @Get('push-config')
  config() {
    return { web: this.push.webConfig, server: this.push.isConfigured() };
  }

  /** Aynı jeton başka kullanıcıdaysa (cihaz el değiştirdi) bu kullanıcıya taşınır. */
  @Post('devices')
  @HttpCode(204)
  async register(@CurrentUser() u: AuthUser, @Body() dto: DeviceDto) {
    const tokenHash = hash(dto.token);
    await this.prisma.deviceToken.upsert({
      where: { tokenHash },
      update: { userId: u.id, platform: dto.platform, lastSeenAt: new Date() },
      create: { userId: u.id, platform: dto.platform, token: dto.token, tokenHash },
    });
  }

  @Delete('devices')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Body() dto: RemoveDeviceDto) {
    await this.prisma.deviceToken.deleteMany({ where: { tokenHash: hash(dto.token), userId: u.id } });
  }

  @Get('devices')
  devices(@CurrentUser() u: AuthUser) {
    return this.prisma.deviceToken.findMany({
      where: { userId: u.id },
      select: { id: true, platform: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
