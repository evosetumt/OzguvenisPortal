import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';
import type { CustomerLookup } from '../lib/types-erp';

interface Props {
  value: string;
  onChange(code: string): void;
  /** Alandan çıkınca (düzenleme çekmecesinde kaydetmek için) */
  onCommit?(code: string): void;
  disabled?: boolean;
}

/**
 * Netsis cari kodu alanı: yazdıkça Netsis önbelleğinden kod/ad önerir (datalist).
 * Netsis yapılandırılmamışsa veya yetki yoksa düz metin alanı gibi çalışır.
 */
export function CustomerPicker({ value, onChange, onCommit, disabled }: Props) {
  const listId = useId();
  const [options, setOptions] = useState<CustomerLookup[]>([]);

  useEffect(() => {
    const q = value.trim();
    if (disabled || q.length < 2) { setOptions([]); return; }
    const h = setTimeout(() => {
      api<CustomerLookup[]>(`/erp/customers/lookup?q=${encodeURIComponent(q)}`).then(setOptions).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(h);
  }, [value, disabled]);

  const match = options.find((o) => o.code.toLocaleUpperCase('tr-TR') === value.trim().toLocaleUpperCase('tr-TR'));

  return (
    <span className="customer-picker">
      <input list={listId} maxLength={60} disabled={disabled} value={value} placeholder="Kod veya ünvan yazın"
        onChange={(e) => onChange(e.target.value)} onBlur={(e) => onCommit?.(e.target.value.trim())} />
      <datalist id={listId}>
        {options.map((o) => <option key={o.code} value={o.code}>{o.name}{o.city ? ` · ${o.city}` : ''}</option>)}
      </datalist>
      {match && <small>{match.name}</small>}
    </span>
  );
}
