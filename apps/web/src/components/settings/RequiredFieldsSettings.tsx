import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import type { RequiredFieldsData, RequiredMap } from '../../lib/required';

/** Ayarlar → Zorunlu alanlar: her formda doldurulması zorunlu alanları seçer (kullanıcı yöneticisi). */
export function RequiredFieldsSettings() {
  const { data, setData } = useApi<RequiredFieldsData>('/required-fields');
  const [draft, setDraft] = useState<RequiredMap>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setDraft(data.required); }, [data]);

  const toggle = (form: string, key: string) => {
    setMsg(null);
    setDraft((cur) => {
      const list = cur[form] ?? [];
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      return { ...cur, [form]: next };
    });
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      setData(await api<RequiredFieldsData>('/required-fields', json('PUT', { required: draft })));
      setMsg({ ok: true, text: 'Kaydedildi. Formlar zorunlu alanları yıldızla gösterir, boş bırakılınca kaydetmez.' });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' }); } finally { setBusy(false); }
  };

  if (!data) return <p className="empty">Yükleniyor…</p>;
  return (
    <section className="glass panel">
      <h3>Zorunlu alanlar</h3>
      <p className="hint">Seçilen alanlar ilgili formda doldurulmadan kayıt yapılamaz (telefon ve tarayıcıda aynı kural geçerlidir). Başlık gibi her zaman zorunlu olan alanlar listede yer almaz.</p>
      <div className="req-forms">
        {data.catalog.map((def) => (
          <div key={def.form} className="req-form">
            <h4>{def.label}</h4>
            <div className="chips">
              {def.fields.map((f) => {
                const on = (draft[def.form] ?? []).includes(f.key);
                return (
                  <button key={f.key} type="button" role="switch" aria-checked={on} className={'chip' + (on ? ' on' : '')} onClick={() => toggle(def.form, f.key)}>
                    {on ? '✓ ' : ''}{f.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {msg && <p className={msg.ok ? 'ok-msg' : 'error'} role="status">{msg.text}</p>}
      <div className="actions"><button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
    </section>
  );
}
