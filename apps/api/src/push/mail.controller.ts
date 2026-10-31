import { BadRequestException, Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permissions.decorator';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';

class SmtpDto {
  @IsString() @MaxLength(200) host: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsBoolean() secure: boolean;
  @IsString() @MaxLength(200) user: string;
  /** Boş bırakılırsa (gönderilmezse) kayıtlı şifre korunur. */
  @IsOptional() @IsString() @MaxLength(500) password?: string;
  @IsString() @MaxLength(200) from: string;
  @IsString() @MaxLength(300) portalUrl: string;
}

class MailTestDto {
  /** Verilmezse giriş yapan kullanıcının adresine gider. */
  @IsOptional() @IsEmail() to?: string;
}

/** E-posta (SMTP) sunucu ayarları: Ayarlar → Bildirim kuralları. */
@Controller('notifications/mail')
@UseGuards(AuthGuard)
export class MailController {
  constructor(private readonly email: EmailService, private readonly audit: AuditService, private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('notification.manage')
  get() {
    return this.email.getConfig();
  }

  @Put()
  @RequirePermission('notification.manage')
  async save(@CurrentUser() u: AuthUser, @Body() dto: SmtpDto) {
    const t = (s: string) => s.trim();
    const cfg = await this.email.saveConfig({
      host: t(dto.host), port: dto.port, secure: dto.secure, user: t(dto.user), from: t(dto.from),
      portalUrl: t(dto.portalUrl).replace(/\/$/, ''), password: dto.password,
    });
    const { passwordSet, ...logged } = cfg;
    await this.audit.log(u.id, 'mail.settings', 'setting', 'mail.smtp', { ...logged, passwordChanged: dto.password !== undefined });
    return cfg;
  }

  /** Deneme e-postası: verilen adrese, yoksa giriş yapan yöneticinin adresine. */
  @Post('test')
  @HttpCode(200)
  @RequirePermission('notification.manage')
  async test(@CurrentUser() u: AuthUser, @Body() dto: MailTestDto) {
    const me = (await this.prisma.user.findUnique({ where: { id: u.id }, select: { email: true, fullName: true } }))!;
    const to = dto.to ?? me.email;
    try {
      await this.email.sendTest(to, me.fullName);
    } catch (e) {
      throw new BadRequestException(`E-posta gönderilemedi: ${String((e as Error)?.message ?? e).slice(0, 500)}`);
    }
    return { to };
  }
}
