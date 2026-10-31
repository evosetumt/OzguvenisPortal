import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * settings tablosu: anahtar → JSON değer (eşikler, süreler vb. koda gömülmez).
 * Bildirim gönderimi gibi sık yollarda okunduğu için bellekte tutulur; set() ve tabloya yapılan her yazım önbelleği temizler.
 */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<string, string | null>();

  constructor(private readonly prisma: PrismaService) {
    this.prisma.onWrite((topics) => { if (topics.includes('settings')) this.cache.clear(); });
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    let raw = this.cache.get(key);
    if (raw === undefined) {
      raw = (await this.prisma.setting.findUnique({ where: { key } }))?.value ?? null;
      this.cache.set(key, raw);
    }
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async set(key: string, value: unknown) {
    const v = JSON.stringify(value);
    await this.prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
    this.cache.set(key, v);
  }

  async all() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => {
      let value: unknown = r.value;
      try { value = JSON.parse(r.value); } catch { /* düz metin */ }
      return { key: r.key, value };
    });
  }
}
