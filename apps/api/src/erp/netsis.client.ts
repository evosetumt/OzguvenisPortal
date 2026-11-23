import { BadRequestException, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql';
import { SettingsService } from '../common/settings.service';
import { openSecret, sealSecret } from '../common/secret-box';

/**
 * Netsis Türkçe metni Latin1 (SQL_Latin1_General_CP1_CI_AS) varchar sütunlarda Windows-1254 baytlarıyla saklar;
 * CP1252 olarak okunduğunda İ ı Ş ş Ğ ğ harfleri Ý ý Þ þ Ð ð görünür. NETSIS_TURKISH_FIX=false ile kapatılır.
 */
const TR_FIX: Record<string, string> = { 'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 'Ð': 'Ğ', 'ð': 'ğ' };
export const fixTurkish = (s: string) => s.replace(/[ÝýÞþÐð]/g, (c) => TR_FIX[c]);

/** Netsis SQL Server bağlantısı. Ayarlar → Netsis ekranından girilir (settings: erp.netsis); girilmemişse NETSIS_DB_* ortam değişkenleri. */
export interface NetsisConnection {
  server: string; // "sunucu" veya "sunucu\ÖRNEK" (adlandırılmış örnek)
  port: number;
  database: string;
  user: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}
type Loaded = NetsisConnection & { password?: string };
type Stored = NetsisConnection & { password?: string }; // password: şifreli (secret-box)

const KEY = 'erp.netsis';

function fromEnv(): Loaded | null {
  const e = process.env;
  if (!e.NETSIS_DB_SERVER || !e.NETSIS_DB_NAME || !e.NETSIS_DB_USER) return null;
  return {
    server: e.NETSIS_DB_SERVER, port: Number(e.NETSIS_DB_PORT ?? 1433), database: e.NETSIS_DB_NAME, user: e.NETSIS_DB_USER,
    password: e.NETSIS_DB_PASSWORD, encrypt: e.NETSIS_DB_ENCRYPT !== 'false', trustServerCertificate: e.NETSIS_DB_TRUST_CERT !== 'false',
  };
}

/**
 * Netsis veritabanına SALT OKUNUR bağlantı. Netsis'e hiçbir koşulda yazılmaz:
 * - Bağlanan SQL kullanıcısının yalnızca db_datareader (veya seçili tablolarda SELECT) yetkisi olmalı.
 * - Bağlantı ApplicationIntent=ReadOnly ile açılır; bu sınıf yalnızca netsis.queries.ts'teki SELECT'leri çalıştırır.
 */
@Injectable()
export class NetsisClient implements OnModuleInit, OnApplicationShutdown {
  private pool: sql.ConnectionPool | null = null;
  private connecting: Promise<sql.ConnectionPool> | null = null;
  private cfg: Loaded | null = null;
  /** Ayar her değiştiğinde artar; eski ayarlarla başlamış bağlantı denemesi tamamlansa bile kullanılmaz. */
  private generation = 0;
  private source: 'settings' | 'env' | 'none' = 'none';

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit() {
    await this.load();
  }

  private async load() {
    const s = await this.settings.get<Stored | null>(KEY, null);
    if (!s?.server || !s.database || !s.user) {
      this.cfg = fromEnv();
      this.source = this.cfg ? 'env' : 'none';
    } else {
      let password: string | undefined;
      try { password = s.password ? openSecret(s.password, KEY) : undefined; } catch { password = undefined; } // JWT_SECRET değiştiyse yeniden girilir
      this.cfg = { ...s, password };
      this.source = 'settings';
    }
    this.resetPool();
  }

  get configured() {
    return !!this.cfg;
  }

  /** Arayüzde gösterilecek bağlantı özeti (şifre içermez). */
  describe() {
    const c = this.cfg;
    return c ? { server: c.server, port: c.port, database: c.database, user: c.user } : null;
  }

  /** Ayarlar ekranı için: şifre hiçbir zaman dönmez, yalnızca kayıtlı olup olmadığı. */
  getConfig() {
    const c = this.cfg;
    return {
      server: c?.server ?? '', port: c?.port ?? 1433, database: c?.database ?? '', user: c?.user ?? '',
      encrypt: c?.encrypt ?? true, trustServerCertificate: c?.trustServerCertificate ?? true,
      passwordSet: !!c?.password, source: this.source,
    };
  }

  /**
   * password: undefined → mevcut şifre korunur (ortam değişkeninden gelse de), '' → silinir.
   * Sunucu/port/veritabanı/kullanıcı değişiyorsa şifre yeniden istenir: kayıtlı şifre başka bir sunucuya gönderilmez.
   */
  async saveConfig(c: NetsisConnection & { password?: string }) {
    const cur = this.cfg;
    const { password, ...rest } = c;
    const sameTarget = !!cur && cur.server === rest.server && cur.port === rest.port && cur.database === rest.database && cur.user === rest.user;
    if (password === undefined && cur?.password && !sameTarget) {
      throw new BadRequestException('Sunucu, port, veritabanı veya kullanıcı değiştiğinde şifreyi yeniden girin');
    }
    const keep = password === undefined ? (sameTarget ? cur?.password : undefined) : password;
    await this.settings.set(KEY, { ...rest, ...(keep ? { password: sealSecret(keep, KEY) } : {}) } satisfies Stored);
    await this.load();
    return this.getConfig();
  }

  /** Ayar değişince açık havuz ve süren bağlantı denemesi geçersiz olur; sonraki sorgu yeni bilgilerle bağlanır. */
  private resetPool() {
    this.generation++;
    this.connecting = null;
    const stale = this.pool;
    this.pool = null;
    if (stale) void stale.close().catch(() => undefined);
  }

  private connect(): Promise<sql.ConnectionPool> {
    if (this.pool?.connected) return Promise.resolve(this.pool);
    if (this.connecting) return this.connecting;
    const c = this.cfg;
    if (!c) return Promise.reject(new Error('Netsis bağlantısı yapılandırılmamış'));
    // Kopmuş eski havuz kapatılmadan yenisi açılırsa bağlantılar sızar.
    const old = this.pool;
    this.pool = null;
    if (old) void old.close().catch(() => undefined);

    const generation = this.generation;
    const [server, instanceName] = c.server.split('\\');
    const pool = new sql.ConnectionPool({
      server,
      port: instanceName ? undefined : c.port,
      database: c.database,
      user: c.user,
      password: c.password,
      requestTimeout: 120_000,
      connectionTimeout: 15_000,
      pool: { max: 3, min: 0, idleTimeoutMillis: 60_000 },
      options: {
        instanceName,
        encrypt: c.encrypt,
        trustServerCertificate: c.trustServerCertificate,
        readOnlyIntent: true,
        // Netsis tarihleri saat dilimi bilgisi olmadan sunucunun yerel saatiyle tutulur.
        useUTC: false,
        appName: 'OzguvenisPortal (salt okunur)',
      },
    });
    const attempt: Promise<sql.ConnectionPool> = pool
      .connect()
      .then((connected) => {
        if (generation !== this.generation) {
          void connected.close().catch(() => undefined);
          throw new Error('Netsis bağlantı ayarları değişti; işlemi yeniden deneyin');
        }
        connected.on('error', (e) => console.error('Netsis bağlantı havuzu hatası', e));
        this.pool = connected;
        return connected;
      })
      .finally(() => {
        if (this.connecting === attempt) this.connecting = null;
      });
    this.connecting = attempt;
    return attempt;
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
