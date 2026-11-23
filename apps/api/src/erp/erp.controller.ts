import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuditService } from '../common/audit.service';
import { ErpService, ListFilter } from './erp.service';
import { ErpSyncService } from './erp-sync.service';
import { NetsisClient } from './netsis.client';

class NetsisConnectionDto {
  /** "sunucu", "10.0.0.5" veya adlandırılmış örnek "sunucu\NETSIS" */
  @IsString() @MaxLength(200) @Matches(/^[^\s;'"]+$/, { message: 'Sunucu adında boşluk, noktalı virgül veya tırnak olamaz' }) server: string;
  @IsInt() @Min(1) @Max(65535) port: number;
  @IsString() @MaxLength(128) @Matches(/^[^;'"]+$/, { message: 'Veritabanı adında noktalı virgül veya tırnak olamaz' }) database: string;
  @IsString() @MaxLength(128) user: string;
  /** Gönderilmezse kayıtlı şifre korunur. */
  @IsOptional() @IsString() @MaxLength(256) password?: string;
  @IsBoolean() encrypt: boolean;
  @IsBoolean() trustServerCertificate: boolean;
}

const optDate = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Geçersiz tarih');
  return d;
};
const filter = (q: Record<string, string | undefined>): ListFilter => ({
  q: q.q?.trim().slice(0, 100) || undefined,
  status: q.status || undefined,
  kind: q.kind || undefined,
  customerCode: q.customer?.trim() || undefined,
  from: optDate(q.from),
  to: optDate(q.to),
});

/** Netsis önbelleğinden okuma uç noktaları. Kayıtlar plasiyer kapsamına göre filtrelenir; Netsis'e yazma yoktur. */
@Controller('erp')
@UseGuards(AuthGuard)
export class ErpController {
  constructor(
    private readonly erp: ErpService,
    private readonly sync: ErpSyncService,
    private readonly netsis: NetsisClient,
    private readonly audit: AuditService,
  ) {}

  /** Ayarlar → Netsis: bağlantı bilgileri (şifre dönmez). */
  @Get('connection')
  @RequirePermission('erp.manage')
  connection() {
    return this.netsis.getConfig();
  }

  @Put('connection')
  @RequirePermission('erp.manage')
  async saveConnection(@CurrentUser() u: AuthUser, @Body() dto: NetsisConnectionDto) {
    if (!dto.server.trim() || !dto.database.trim() || !dto.user.trim()) throw new BadRequestException('Sunucu, veritabanı ve kullanıcı boş olamaz');
    const cfg = await this.netsis.saveConfig({
      server: dto.server.trim(), port: dto.port, database: dto.database.trim(), user: dto.user.trim(),
      encrypt: dto.encrypt, trustServerCertificate: dto.trustServerCertificate, password: dto.password,
    });
    const { passwordSet, ...logged } = cfg;
    await this.audit.log(u.id, 'erp.connection', 'setting', 'erp.netsis', { ...logged, passwordChanged: dto.password !== undefined });
    return cfg;
  }

  @Get('status')
  @RequirePermission('erp.manage')
  status() {
    return this.erp.status();
  }

  @Post('sync')
  @HttpCode(202)
  @RequirePermission('erp.manage')
  async startSync(@CurrentUser() u: AuthUser) {
    const started = this.sync.trigger('manual');
    if (started) await this.audit.log(u.id, 'erp.sync', 'erp', 'all');
    return { started, running: this.sync.isRunning };
  }

  @Post('test')
  @HttpCode(200)
  @RequirePermission('erp.manage')
  test() {
    return this.erp.testConnection();
  }

  @Get('customers/lookup')
  @RequirePermission('account.read', 'order.read', 'quote.read', 'task.write')
  lookup(@CurrentUser() u: AuthUser, @Query('q') q?: string) {
    return this.erp.lookup(u, q?.trim().slice(0, 60) || undefined);
  }

  @Get('customers')
  @RequirePermission('account.read')
  customers(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('debtors') debtors?: string) {
    return this.erp.customers(u, q?.trim().slice(0, 100) || undefined, debtors === '1');
  }

  @Get('customers/:code')
  @RequirePermission('account.read')
  customer(@CurrentUser() u: AuthUser, @Param('code') code: string) {
    return this.erp.customer(u, code.slice(0, 35));
  }

  /** Ekstredeki faturanın e-Fatura / e-Arşiv XML'i (önizleme istemcide, gömülü GİB XSLT şablonuyla). */
  @Get('customers/:code/edocs/:docNo')
  @RequirePermission('account.read')
  eDocument(@CurrentUser() u: AuthUser, @Param('code') code: string, @Param('docNo') docNo: string) {
    return this.erp.eDocument(u, code.slice(0, 35), docNo.trim().slice(0, 30));
  }

  @Get('orders')
  @RequirePermission('order.read')
  orders(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.erp.orders(u, filter(q));
  }

  @Get('orders/:id')
  @RequirePermission('order.read')
  order(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.erp.order(u, id);
  }

  @Get('quotes')
  @RequirePermission('quote.read')
  quotes(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.erp.quotes(u, filter(q));
  }

  @Get('quotes/:id')
  @RequirePermission('quote.read')
  quote(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.erp.quote(u, id);
  }

  @Get('shipments')
  @RequirePermission('shipment.read')
  shipments(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) {
    return this.erp.shipments(u, filter(q));
  }

  @Get('reports/summary')
  @RequirePermission('report.read')
  summary(@CurrentUser() u: AuthUser) {
    return this.erp.summary(u);
  }
}
