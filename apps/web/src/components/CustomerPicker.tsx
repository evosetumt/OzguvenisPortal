import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Loader2, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import type { CustomerLookup } from '../lib/types-erp';

interface Props {
  value: string;
  onChange(code: string): void;
  /** Seçim yapılınca / temizlenince (düzenleme çekmecesinde kaydetmek için) */
  onCommit?(code: string): void;
  disabled?: boolean;
}

const MIN_QUERY = 2;
const SEARCH_DELAY_MS = 250;
const sameCode = (a: string, b: string) => a.toLocaleUpperCase('tr-TR') === b.toLocaleUpperCase('tr-TR');

/**
 * Netsis cari seçici: ünvan veya kod yazdıkça altta sonuç listesi açılır (ünvan, kod, şehir); seçilen cari
 * ad + kod çipi olarak görünür, çarpıyla kaldırılır. Listede olmayan bir kod Enter ile elle girilebilir.
 * Netsis yapılandırılmamışsa veya yetki yoksa liste boş kalır, alan elle kod girişi gibi çalışır.
 */
export function CustomerPicker({ value, onChange, onCommit, disabled }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!value);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<CustomerLookup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [label, setLabel] = useState<CustomerLookup | null>(null);

  // Dışarıdan gelen kodun ünvanı (çipte göstermek için)
  useEffect(() => {
    const code = value.trim();
    if (!code) { setLabel(null); setEditing(true); return; }
    setEditing(false);
    if (label && sameCode(label.code, code)) return;
    let alive = true;
    api<CustomerLookup[]>(`/erp/customers/lookup?q=${encodeURIComponent(code)}`)
      .then((list) => { if (alive) setLabel(list.find((o) => sameCode(o.code, code)) ?? null); })
      .catch(() => { if (alive) setLabel(null); });
    return () => { alive = false; };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- label yalnız önbellek; değişince yeniden sorgulamaya gerek yok

  // Yazarken arama (gecikmeli)
  useEffect(() => {
    const q = query.trim();
    if (disabled || !editing || q.length < MIN_QUERY) { setOptions([]); setIsLoading(false); return; }
    setIsLoading(true);
    let alive = true;
    const h = setTimeout(() => {
      api<CustomerLookup[]>(`/erp/customers/lookup?q=${encodeURIComponent(q)}`)
        .then((list) => { if (alive) { setOptions(list); setActive(0); } })
        .catch(() => { if (alive) setOptions([]); })
        .finally(() => { if (alive) setIsLoading(false); });
    }, SEARCH_DELAY_MS);
    return () => { alive = false; clearTimeout(h); };
  }, [query, disabled, editing]);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0);

  const choose = (c: CustomerLookup | string) => {
    const code = typeof c === 'string' ? c.trim() : c.code;
    setLabel(typeof c === 'string' ? null : c);
    setQuery(''); setOptions([]);
    setEditing(!code);
    onChange(code);
    onCommit?.(code);
  };

  const clear = () => { choose(''); focusInput(); };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault(); // formu göndermesin
      if (options[active]) choose(options[active]);
      else if (query.trim()) choose(query); // listede yok: elle kod
      return;
    }
    if (e.key === 'Escape' && (query || options.length)) { e.stopPropagation(); setQuery(''); setOptions([]); }
  };

  if (!editing && value) {
    const sub = label ? `${label.code}${label.city ? ` · ${label.city}` : ''}` : null;
    return (
      <span className="customer-picker">
        <span className="cp-chip">
          <Building2 size={15} />
          <span className="cp-chip__text"><b>{label?.name ?? value}</b>{sub && <small>{sub}</small>}</span>
          {!disabled && (
            <>
              <button type="button" className="link-btn" onClick={() => { setEditing(true); focusInput(); }}>Değiştir</button>
              <button type="button" className="icon-btn sm" title="Cariyi kaldır" aria-label="Cariyi kaldır" onClick={clear}><X size={15} /></button>
            </>
          )}
        </span>
      </span>
    );
  }

  const q = query.trim();
  const showList = q.length >= MIN_QUERY && !disabled;
  return (
    <span className="customer-picker">
      <span className="cp-input">
        <Search size={15} />
        <input ref={inputRef} role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list" maxLength={60}
          disabled={disabled} value={query} placeholder="Cari ünvanı veya kodu yazın…"
          onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKey}
          onBlur={() => { if (value) setTimeout(() => setEditing(false), 150); }} />
        {isLoading && <Loader2 size={15} className="cp-spin" />}
        {value && (
          <button type="button" className="icon-btn sm" title="Vazgeç" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQuery(''); setEditing(false); }}><X size={14} /></button>
        )}
      </span>
      {showList && (
        <ul className="cp-list" id={listId} role="listbox">
          {options.map((o, i) => (
            <li key={o.code} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
                <b>{o.name}</b><small>{o.code}{o.city ? ` · ${o.city}` : ''}</small>
              </button>
            </li>
          ))}
          {!isLoading && options.length === 0 && (
            <li className="cp-empty">
              Eşleşen cari yok.{' '}
              <button type="button" className="link-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(query)}>“{q}” kodunu kullan</button>
            </li>
          )}
        </ul>
      )}
    </span>
  );
}
