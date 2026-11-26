import { useState, type FormEvent } from 'react';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { json, useApi } from '../lib/data';
import { useAuth } from '../lib/auth';
import { formatDue } from '../lib/format';
import { announcementState, audienceLabel, type Announcement } from '../lib/types-announcements';
import { Modal } from '../components/Modal';
import { useRequired } from '../lib/required';
import '../styles/announcements.css';

interface Department { id: number; name: string }
const STATE_LABEL = { live: 'Yayında', scheduled: 'Planlandı', ended: 'Sona erdi' } as const;

/** Duyurular: herkes kendisine açık duyuruları görür; yetkili (announcement.manage) birim seçip duyuru açar. */
export function AnnouncementsPage() {
  const { can } = useAuth();
  const manage = can('announcement.manage');
  const { data: active } = useApi<Announcement[]>('/announcements/active');
  const { data: all, reload } = useApi<Announcement[]>(manage ? '/announcements' : null);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const items = (manage ? all : active) ?? [];

  const remove = async (a: Announcement) => {
    if (!window.confirm(`"${a.title}" duyurusu kaldırılsın mı?`)) return;
    await api(`/announcements/${a.id}`, json('DELETE'));
    void reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Duyurular</h1>
        </div>
        {manage && <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Yeni duyuru</button>}
      </div>

      {items.length === 0 && <p className="empty">Şu an duyuru yok.</p>}
      <ul className="ann-cards">
        {items.map((a) => {
          const state = announcementState(a);
          return (
            <li key={a.id} className={'glass ann-card ' + state + (a.important ? ' imp' : '')}>
              <div className="ann-card__top">
                <span className={'ann-state ' + state}>{STATE_LABEL[state]}</span>
                {a.important && <span className="tag danger">Önemli</span>}
                <span className="ann-aud">{audienceLabel(a)}</span>
              </div>
              <h3><Megaphone size={18} /> {a.title}</h3>
              {a.body && <p>{a.body}</p>}
              <footer>
                <small>{a.author.fullName} · {formatDue(a.startsAt)}{a.endsAt ? ` → ${formatDue(a.endsAt)}` : ' · süresiz'}</small>
                {manage && (
                  <span className="ann-tools">
                    <button className="icon-btn sm" title="Düzenle" onClick={() => setEditing(a)}><Pencil size={15} /></button>
                    <button className="icon-btn sm" title="Kaldır" onClick={() => void remove(a)}><Trash2 size={15} /></button>
                  </span>
                )}
              </footer>
            </li>
          );
        })}
      </ul>

      {editing && <AnnouncementForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function AnnouncementForm({ item, onClose, onSaved }: { item: Announcement | null; onClose(): void; onSaved(): void }) {
  const { data: depts } = useApi<Department[]>('/departments');
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [important, setImportant] = useState(item?.important ?? false);
  const [allDepartments, setAll] = useState(item?.allDepartments ?? true); // yeni duyuru varsayılan olarak tüm şirkete
  const [selected, setSelected] = useState<Set<number>>(new Set(item?.departments.map((d) => d.id) ?? []));
  const [startsAt, setStartsAt] = useState(toLocalInput(item?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(item?.endsAt ?? null));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const req = useRequired('announcement');

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allDepartments && !selected.size) { setErr('Duyurunun gideceği birimleri seçin veya "Tüm şirket"i işaretleyin'); return; }
    const missing = req.check({ body, endsAt });
    if (missing) { setErr(missing); return; }
    setBusy(true); setErr('');
    const payload = {
      title, body: body || null, important, allDepartments, departmentIds: [...selected],
      startsAt: startsAt ? new Date(startsAt).toISOString() : null, endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    };
    try {
      await api(item ? `/announcements/${item.id}` : '/announcements', json(item ? 'PATCH' : 'POST', payload));
      onSaved();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Kaydedilemedi'); setBusy(false); }
  };

  return (
    <Modal title={item ? 'Duyuruyu düzenle' : 'Yeni duyuru'} onClose={onClose}>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>Başlık (kayan yazıda görünür)<input autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Ayrıntı{req.has('body') && <i className="req" aria-hidden="true">*</i>}<textarea rows={3} required={req.has('body')} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="field">
          <span>Birimler</span>
          <div className="chips">
            <button type="button" className={'chip' + (allDepartments ? ' on' : '')} onClick={() => setAll(!allDepartments)}>Tüm şirket</button>
            {!allDepartments && (depts ?? []).map((d) => (
              <button type="button" key={d.id} className={'chip' + (selected.has(d.id) ? ' on' : '')} onClick={() => toggle(d.id)}>{d.name}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <label>Yayın başlangıcı<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /><small>Boşsa hemen</small></label>
          <label>Bitiş{req.has('endsAt') && <i className="req" aria-hidden="true">*</i>}<input type="datetime-local" required={req.has('endsAt')} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /><small>Boşsa kaldırılana kadar</small></label>
        </div>
        <label className="check"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} /> Önemli (kırmızı şeritle öne çıkar)</label>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : item ? 'Kaydet' : 'Yayınla'}</button>
        </div>
      </form>
    </Modal>
  );
}
