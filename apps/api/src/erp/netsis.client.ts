import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as sql from 'mssql';

/**
 * Netsis Türkçe metni Latin1 (SQL_Latin1_General_CP1_CI_AS) varchar sütunlarda Windows-1254 baytlarıyla saklar;
 * CP1252 olarak okunduğunda İ ı Ş ş Ğ ğ harfleri Ý ý Þ þ Ð ð görünür. NETSIS_TURKISH_FIX=false ile kapatılır.
 */
const TR_FIX: Record<string, string> = { 'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 'Ð': 'Ğ', 'ð': 'ğ' };
export const fixTurkish = (s: string) => s.replace(/[ÝýÞþÐð]/g, (c) => TR_FIX[c]);

/**
 * Netsis veritabanına SALT OKUNUR bağlantı. Netsis'e hiçbir koşulda yazılmaz:
 * - Bağlanan SQL kullanıcısının yalnızca db_datareader (veya seçili tablolarda SELECT) yetkisi olmalı.
 * - Bağlantı ApplicationIntent=ReadOnly ile açılır; bu sınıf yalnızca netsis.queries.ts'teki SELECT'leri çalıştırır.
 */
@Injectable()
export class NetsisClient implements OnApplicationShutdown {
  private pool: sql.ConnectionPool | null = null;
  private connecting: Promise<sql.ConnectionPool> | null = null;

  get configured() {
    return !!(process.env.NETSIS_DB_SERVER && process.env.NETSIS_DB_NAME && process.env.NETSIS_DB_USER);
  }

  /** Arayüzde gösterilecek bağlantı özeti (şifre içermez). */
  describe() {
    if (!this.configured) return null;
    return { server: process.env.NETSIS_DB_SERVER, port: this.port, database: process.env.NETSIS_DB_NAME, user: process.env.NETSIS_DB_USER };
  }

  private get port() {
    return Number(process.env.NETSIS_DB_PORT ?? 1433);
  }

  private async connect() {
    if (this.pool?.connected) return this.pool;
    if (!this.connecting) {
      const [server, instanceName] = process.env.NETSIS_DB_SERVER!.split('\\');
      const pool = new sql.ConnectionPool({
        server,
        port: instanceName ? undefined : this.port,
        database: process.env.NETSIS_DB_NAME,
        user: process.env.NETSIS_DB_USER,
        password: process.env.NETSIS_DB_PASSWORD,
        requestTimeout: 120_000,
        connectionTimeout: 15_000,
        pool: { max: 3, min: 0, idleTimeoutMillis: 60_000 },
        options: {
          instanceName,
          encrypt: process.env.NETSIS_DB_ENCRYPT !== 'false',
          trustServerCertificate: process.env.NETSIS_DB_TRUST_CERT !== 'false',
          readOnlyIntent: true,
          // Netsis tarihleri saat dilimi bilgisi olmadan sunucunun yerel saatiyle tutulur.
          useUTC: false,
          appName: 'OzguvenisPortal (salt okunur)',
        },
      });
      this.connecting = pool.connect().finally(() => (this.connecting = null));
      this.pool = await this.connecting;
      this.pool.on('error', (e) => console.error('Netsis bağlantı havuzu hatası', e));
      return this.pool;
    }
    return this.connecting;
  }

  async query<T>(text: string, params: Record<string, Date | string | number> = {}): Promise<T[]> {
    if (!this.configured) throw new Error('Netsis bağlantısı yapılandırılmamış');
    const req = (await this.connect()).request();
    for (const [k, v] of Object.entries(params)) {
      req.input(k, v instanceof Date ? sql.DateTime : typeof v === 'number' ? sql.Decimal(18, 4) : sql.VarChar(100), v);
    }
    const r = await req.query<T>(text);
    if (process.env.NETSIS_TURKISH_FIX === 'false') return r.recordset;
    for (const row of r.recordset as Record<string, unknown>[]) {
      for (const k in row) if (typeof row[k] === 'string') row[k] = fixTurkish(row[k] as string);
    }
    return r.recordset;
  }

  async onApplicationShutdown() {
    await this.pool?.close().catch(() => undefined);
  }
}
