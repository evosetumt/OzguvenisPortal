import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { RequirePermission } from '../common/permissions.decorator';
import { WhatsappService } from './whatsapp.service';

class WaSettingsDto {
  @IsString() @Matches(/^\d{5,30}$/, { message: 'Telefon numarası kimliği (Phone number ID) yalnız rakamlardan oluşur' }) phoneNumberId: string;
  @IsString() @Matches(/^(\d{5,30})?$/, { message: 'WhatsApp Business hesap kimliği (WABA ID) yalnız rakamlardan oluşur' }) wabaId: string;
  @IsString() @Matches(/^(v\d{1,3}\.\d{1,2})?$/, { message: 'API sürümü v21.0 biçiminde olmalı' }) apiVersion: string;
  /** Gizli alanlar: gönderilmezse kayıtlı değer korunur, boş metin silinir. */
  @IsOptional() @IsString() @MaxLength(1000) accessToken?: string;
  @IsOptional() @IsString() @MaxLength(200) appSecret?: string;
  @IsOptional() @IsString() @MaxLength(200) verifyToken?: string;
}

@Controller('whatsapp')
@UseGuards(AuthGuard)
export class WhatsappController {
  constructor(private readonly svc: WhatsappService, private readonly audit: AuditService) {}

  /** Ayarlar → WhatsApp: Meta Cloud API bağlantı bilgileri (gizli alanlar dönmez). */
  @Get('settings')
  @RequirePermission('notification.manage')
  settings() {
    return this.svc.getSettings();
  }

  @Put('settings')
  @RequirePermission('notification.manage')
  async saveSettings(@CurrentUser() u: AuthUser, @Body() dto: WaSettingsDto) {
    const t = (v?: string) => (v === undefined ? undefined : v.trim());
    const r = await this.svc.saveSettings({
      phoneNumberId: dto.phoneNumberId.trim(), wabaId: dto.wabaId.trim(), apiVersion: dto.apiVersion.trim(),
      accessToken: t(dto.accessToken), appSecret: t(dto.appSecret), verifyToken: t(dto.verifyToken),
    });
    await this.audit.log(u.id, 'whatsapp.settings', 'setting', 'whatsapp.config', {
      phoneNumberId: r.phoneNumberId, wabaId: r.wabaId, apiVersion: r.apiVersion,
      changed: (['accessToken', 'appSecret', 'verifyToken'] as const).filter((k) => dto[k] !== undefined),
    });
    return r;
  }

  @Get('status')
  @RequirePermission('whatsapp.send')
  async status() {
    return { ...this.svc.status(), eventTemplates: await this.svc.eventTemplates() };
  }

  @Get('templates')
  @RequirePermission('whatsapp.send')
  templates() {
    return this.svc.templates();
  }

  /** Ayarlar → WhatsApp: bildirim alacak kullanıcılar (numara Kullanıcılar ekranından) ve son mesaj durumu. */
  @Get('recipients')
  @RequirePermission('whatsapp.send')
  recipients() {
    return this.svc.recipients();
  }

}

/**
 * Meta webhook'u: oturum gerektirmez, ama POST istekleri X-Hub-Signature-256 ile doğrulanır.
 * Adres: https://<portal>/api/whatsapp/webhook
 */
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  constructor(private readonly svc: WhatsappService) {}

  @Get()
  verify(@Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    const ok = this.svc.verifyChallenge(mode, token, challenge);
    if (ok === null) throw new ForbiddenException();
    return ok;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') sig?: string) {
    if (!this.svc.verifySignature(req.rawBody, sig)) throw new ForbiddenException('İmza geçersiz');
    await this.svc.handleWebhook(req.body);
    return { ok: true };
  }
}
