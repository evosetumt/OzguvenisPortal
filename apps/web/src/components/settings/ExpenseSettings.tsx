import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import type { ExpenseCategory, ExpenseSettingsData } from '../../lib/types-workflow';
import '../../styles/workflow.css';

/** Masraf eşiği, onay hatırlatma süresi, kategoriler ve Jev kategori önerisi (muhasebe veya kullanıcı yöneticisi). */
export function ExpenseSettings() {
  const { can } = useAuth();
  if (!can('expense.accounting') && !can('user.manage')) return null;
  return <ExpenseSettingsInner />;
}

function ExpenseSettingsInner() {
  const { data: s, setData } = useApi<ExpenseSettingsData>('/expense-settings');
  const { data: cats, reload } = useApi<ExpenseCategory[]>('/expense-categories?all=1');
  const [f, setF] = useState({ autoApproveLimit: '', approvalReminderHours: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    if (s) setF({ autoApproveLimit: String(s.autoApproveLimit), approvalReminderHours: String(s.approvalReminderHours) });
  }, [s]);

  const save = async (body: Partial<ExpenseSettingsData>) => {
    setMsg(null);
    try {
      setData(await api<ExpenseSettingsData>('/expense-settings', json('PUT', body)));
      setMsg({ ok: true, text: 'Kaydedildi' });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' }); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save({ autoApproveLimit: Number(f.autoApproveLimit.replace(',', '.')), approvalReminderHours: Number(f.approvalReminderHours) });
  };
  const toggleAi = (on: boolean) => {
    if (on && !window.confirm('Açılırsa masraf açıklamaları kategori önerisi için TypeSafe (şirket dışı bir yapay zekâ servisi) sunucularına gönderilir. Onaylıyor musunuz?')) return;
    void save({ aiCategorySuggest: on });
  };
  const addCat = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try { await api('/expense-categories', json('POST', { name: newCat, sortOrder: (cats?.length ?? 0) })); setNewCat(''); void reload(); }
    catch (x) { setMsg({ ok: false, text: x instanceof Error ? x.message : 'Eklenemedi' }); }
  };
  const toggleCat = async (c: ExpenseCategory) => {
    await api(`/expense-categories/${c.id}`, json('PATCH', { isActive: !c.isActive }));
    void reload();
  };

  return (
    <section className="glass panel narrow">
      <h3>Masraf onayı</h3>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>Otomatik onay eşiği (TL)<input inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" value={f.autoApproveLimit} onChange={(e) => setF({ ...f, autoApproveLimit: e.target.value })} /></label>
          <label>Onay hatırlatma süresi (saat)<input type="number" min={1} max={720} required value={f.approvalReminderHours} onChange={(e) => setF({ ...f, approvalReminderHours: e.target.value })} /></label>
        </div>
        <p className="hint">Eşik ve altındaki masraflar yönetici onayı olmadan muhasebeye düşer. Süreç akışı Akış Tasarımcısı'ndan değiştirilebilir.</p>
        <div className="actions"><button className="btn primary sm">Kaydet</button></div>
      </form>

      <h4>Kategoriler</h4>
      <div className="chips">
        {cats?.map((c) => (
          <button key={c.id} type="button" className={'chip' + (c.isActive ? ' on' : '')} title={c.isActive ? 'Pasif yap' : 'Etkinleştir'} onClick={() => void toggleCat(c)}>{c.name}</button>
        ))}
      </div>
      <form className="inline-form" onSubmit={addCat}>
        <input placeholder="Yeni kategori" maxLength={80} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
        <button className="btn primary sm" disabled={!newCat.trim()}>Ekle</button>
      </form>

      <h4>Yapay zekâ ile kategori önerisi</h4>
      <label className="check">
        <input type="checkbox" checked={!!s?.aiCategorySuggest} disabled={!s?.aiAvailable} onChange={(e) => toggleAi(e.target.checked)} />
        Masraf açıklamasından kategori öner (TypeSafe Jev)
      </label>
      <p className="hint">
        {s?.aiAvailable
          ? 'Açıkken masraf açıklaması (ve tutar) şirket dışındaki TypeSafe servisine gönderilir; fiş görseli gönderilmez. Varsayılan kapalıdır.'
          : 'Sunucuda TYPESAFE_API_KEY tanımlı değil; özellik kullanılamaz.'}
      </p>
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p>}
    </section>
  );
}
