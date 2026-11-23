import { useApi } from './data';

/** Zorunlu alan kataloğu ve ayarı (sunucu: apps/api/src/required-fields). */
export interface RequiredFieldDef { key: string; label: string }
export interface RequiredFormDef { form: string; label: string; fields: RequiredFieldDef[] }
export type RequiredMap = Record<string, string[]>;
export interface RequiredFieldsData { catalog: RequiredFormDef[]; required: RequiredMap }

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Set) return v.size === 0;
  return false;
}

/** Boş kalan zorunlu alanların etiketleri (form göndermeden önce gösterilir; sunucu da aynı kuralı uygular). */
export function missingRequired(data: RequiredFieldsData | null | undefined, form: string, values: Record<string, unknown>): string[] {
  if (!data) return [];
  const def = data.catalog.find((d) => d.form === form);
  const req = new Set(data.required[form] ?? []);
  return (def?.fields ?? []).filter((f) => req.has(f.key) && isEmptyValue(values[f.key])).map((f) => f.label);
}

/** Formda kullanım: const req = useRequired('task'); req.has('dueDate'); req.check({ ... }) → hata metni veya ''. */
export function useRequired(form: string) {
  const { data } = useApi<RequiredFieldsData>('/required-fields');
  const set = new Set(data?.required[form] ?? []);
  return {
    has: (key: string) => set.has(key),
    /** Eksik varsa "Zorunlu alanlar boş: ..." metni, yoksa boş metin */
    check: (values: Record<string, unknown>) => {
      const missing = missingRequired(data, form, values);
      return missing.length ? `Zorunlu alanlar boş: ${missing.join(', ')}` : '';
    },
  };
}
