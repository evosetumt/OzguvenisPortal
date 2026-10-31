import { Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthGuard)
export class WhatsappController {
  constructor(private readonly svc: WhatsappService) {}

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
