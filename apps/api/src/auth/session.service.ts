import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

/** Her istekte veritabanına gitmemek için kısa süreli önbellek; iptal edilen oturum en geç bu kadar sonra düşer (aynı süreçte hemen). */
const CACHE_MS = 30_000;

interface SessionState { status: string; tokenVersion: number; deleted: boolean; at: number }

/**
 * Oturum iptali: JWT'deki `tv` (tokenVersion) veritabanındakiyle eşleşmezse jeton geçersizdir.
 * Kullanıcı pasifleştirilince/silinince, rolleri değişince veya şifresi değişince sürüm artırılır.
 */
@Injectable()
export class SessionService {
  private readonly cache = new Map<number, SessionState>();

  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  /** Jetondaki sürüm hâlâ geçerli ve kullanıcı aktif mi? Eski jetonlarda `tv` yok: 0 sayılır (dağıtımda herkes atılmasın). */
  async isValid(userId: number, tv: number | undefined): Promise<boolean> {
    const s = await this.state(userId);
    return !!s && !s.deleted && s.status === 'active' && s.tokenVersion === (tv ?? 0);
  }

  private async state(userId: number): Promise<SessionState | null> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < CACHE_MS) return hit;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true, tokenVersion: true, deletedAt: true } });
    if (!u) { this.cache.delete(userId); return null; }
    // Süresi geçmiş kayıtlar ayıklanır; harita kullanıcı sayısını aşmaz ama yine de şişmesin.
    if (this.cache.size > 5000) for (const [k, v] of this.cache) if (now - v.at >= CACHE_MS) this.cache.delete(k);
    const s = { status: u.status, tokenVersion: u.tokenVersion, deleted: !!u.deletedAt, at: now };
    this.cache.set(userId, s);
    return s;
  }

  /**
   * Kullanıcıların tüm açık oturumlarını geçersiz kılar: sürüm artırılır, önbellek silinir, soketleri kapatılır.
   * İşlem (transaction) içinden `tx` ile çağrılırsa yalnızca sürüm artırılır; çağıran, işlem tamamlanınca
   * `afterRevoke` çağırmalı (yoksa önbellek işlem bitmeden eski değerle yeniden dolabilir).
   */
  async revoke(userIds: number[], tx?: Prisma.TransactionClient) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await (tx ?? this.prisma).user.updateMany({ where: { id: { in: ids } }, data: { tokenVersion: { increment: 1 } } });
    if (!tx) this.afterRevoke(ids);
  }

  /** Sürüm artışı kalıcı olduktan sonra: önbelleği boşalt, açık soketleri kopar (RealtimeGateway dinler). */
  afterRevoke(userIds: number[]) {
    this.forget(userIds);
    this.events.emit('auth.revoked', null, { userIds });
  }

  /**
   * Önbelleği boşaltır (oturum iptali olmadan). Yeniden aktifleştirmede şart: yoksa önbellekteki "disabled" kaydı
   * yüzünden kullanıcı yeniden giriş yapsa bile 30 sn boyunca 401 alır.
   */
  forget(userIds: number[]) {
    for (const id of userIds) this.cache.delete(id);
  }
}
