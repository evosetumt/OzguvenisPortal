import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

const WINDOW_MS = 15 * 60_000;
/** E-posta başına sınır. */
const MAX_FAILS = 5;
/** IP başına sınır daha geniş: ofisteki herkes aynı NAT/vekil IP'sinden gelebilir, tek kişinin hatası herkesi kilitlemesin. */
const MAX_FAILS_IP = 20;
/** Harita bu boyutu aşarsa süresi dolanlar hemen ayıklanır (çok sayıda farklı e-posta/IP ile şişirilmesin). */
const PRUNE_AT = 10_000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

interface Entry { fails: number; first: number }

/**
 * Kaba kuvvet koruması (bellek içi, tek süreç): e-posta başına 15 dakikada en çok 5, IP başına 20 hatalı giriş.
 * Başarılı girişte ilgili kayıtlar sıfırlanır. Süreç yeniden başlarsa sayaçlar da sıfırlanır; bu kabul edilebilir.
 */
@Injectable()
export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  private lastPrune = Date.now();

  private keys(email: string, ip: string | undefined): string[] {
    const keys = [`e:${email.trim().toLowerCase()}`];
    // Yerel adres = IIS vekili (trust proxy kapalıyken herkes böyle görünür); IP sınırı uygulanmaz, e-posta sınırı yeter.
    if (ip && !LOOPBACK.has(ip)) keys.push(`i:${ip}`);
    return keys;
  }

  /** Giriş denemesinden önce: sınır aşıldıysa 429. */
  check(email: string, ip: string | undefined): void {
    const now = Date.now();
    this.prune(now);
    for (const k of this.keys(email, ip)) {
      const e = this.entries.get(k);
      if (e && now - e.first < WINDOW_MS && e.fails >= (k.startsWith('i:') ? MAX_FAILS_IP : MAX_FAILS)) {
        throw new HttpException('Çok fazla başarısız deneme. Lütfen biraz sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  fail(email: string, ip: string | undefined): void {
    const now = Date.now();
    for (const k of this.keys(email, ip)) {
      const e = this.entries.get(k);
      if (!e || now - e.first >= WINDOW_MS) this.entries.set(k, { fails: 1, first: now });
      else e.fails++;
    }
  }

  succeed(email: string, ip: string | undefined): void {
    for (const k of this.keys(email, ip)) this.entries.delete(k);
  }

  private prune(now: number): void {
    // Dakikada bir (veya harita büyüyünce) süresi dolan kayıtlar silinir; harita sınırsız büyümez.
    if (now - this.lastPrune < 60_000 && this.entries.size < PRUNE_AT) return;
    this.lastPrune = now;
    for (const [k, e] of this.entries) if (now - e.first >= WINDOW_MS) this.entries.delete(k);
  }
}
