import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../common/settings.service';

/**
 * Zorunlu alan yönetimi: yönetici Ayarlar → Zorunlu alanlar'dan hangi formda hangi alanın doldurulması
 * gerektiğini seçer (settings: "form.required" = { form: [alan, ...] }). Kural sunucuda uygulanır,
 * formlar aynı listeyi okuyup alanı yıldızla işaretler. Katalog web tarafında lib/required.ts ile aynıdır.
 */
export interface RequiredFieldDef { key: string; label: string }
export interface RequiredFormDef { form: string; label: string; fields: RequiredFieldDef[] }
export type RequiredMap = Record<string, string[]>;

export const REQUIRED_CATALOG: RequiredFormDef[] = [
  { form: 'task', label: 'Görev', fields: [
    { key: 'description', label: 'Açıklama' },
    { key: 'assigneeId', label: 'Atanan kişi' },
    { key: 'dueDate', label: 'Bitiş tarihi' },
    { key: 'attachments', label: 'Ek dosya / fotoğraf' },
  ] },
  { form: 'event', label: 'Takvim etkinliği', fields: [
    { key: 'description', label: 'Açıklama' },
    { key: 'location', label: 'Yer' },
    { key: 'attendees', label: 'Davetliler' },
    { key: 'attachments', label: 'Ek dosya' },
  ] },
  { form: 'feedPost', label: 'İş akışı notu', fields: [
    { key: 'customerCode', label: 'Firma' },
  ] },
  { form: 'announcement', label: 'Duyuru', fields: [
    { key: 'body', label: 'Ayrıntı' },
    { key: 'endsAt', label: 'Bitiş tarihi' },
  ] },
];

const KEY = 'form.required';

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Katalogda olmayan form/alanları ayıklar (eski veya elle yazılmış ayar). */
export function sanitizeRequired(raw: unknown): RequiredMap {
  const out: RequiredMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of REQUIRED_CATALOG) {
    const list = (raw as Record<string, unknown>)[def.form];
    if (!Array.isArray(list)) continue;
    const allowed = new Set(def.fields.map((f) => f.key));
    const keys = [...new Set(list.filter((k): k is string => typeof k === 'string' && allowed.has(k)))];
    if (keys.length) out[def.form] = keys;
  }
  return out;
}

/** values içinde boş kalan zorunlu alanların etiketleri. partial: yalnız gönderilen (undefined olmayan) alanlara bakılır (güncelleme). */
export function missingRequired(form: string, map: RequiredMap, values: Record<string, unknown>, partial = false): string[] {
  const def = REQUIRED_CATALOG.find((d) => d.form === form);
  if (!def) return [];
  const req = new Set(map[form] ?? []);
  return def.fields
    .filter((f) => req.has(f.key) && (!partial || values[f.key] !== undefined) && isEmptyValue(values[f.key]))
    .map((f) => f.label);
}

@Injectable()
export class RequiredFieldsService {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<RequiredMap> {
    return sanitizeRequired(await this.settings.get<unknown>(KEY, {}));
  }

  async save(raw: unknown): Promise<RequiredMap> {
    const map = sanitizeRequired(raw);
    await this.settings.set(KEY, map);
    return map;
  }

  async isRequired(form: string, key: string) {
    return (await this.get())[form]?.includes(key) ?? false;
  }

  /** Eksik zorunlu alan varsa 400 döner: "Zorunlu alanlar boş: Açıklama, Bitiş tarihi" */
  async assert(form: string, values: Record<string, unknown>, partial = false) {
    const missing = missingRequired(form, await this.get(), values, partial);
    if (missing.length) throw new BadRequestException(`Zorunlu alanlar boş: ${missing.join(', ')}`);
  }
}
