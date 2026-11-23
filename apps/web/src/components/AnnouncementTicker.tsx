import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { useApi } from '../lib/data';
import { formatDue } from '../lib/format';
import { audienceLabel, type Announcement } from '../lib/types-announcements';
import { Modal } from './Modal';

/**
 * Üst çubuğun altında duyuru şeridi: yayındaki duyuru başlıkları sağdan sola kayar.
 * Dokununca duyuruların tamamı açılır. Duyuru yoksa hiç görünmez.
 */
export function AnnouncementTicker() {
  const { data } = useApi<Announcement[]>('/announcements/active');
  const [open, setOpen] = useState(false);
  const items = data ?? [];
  if (!items.length) return null;
  const important = items.some((a) => a.important);
  // Okuma hızı: karakter başına ~0,22 sn, en az 18 sn
  const duration = Math.max(18, items.reduce((n, a) => n + a.title.length, 0) * 0.22);
  const run = items.map((a) => (
    <span key={a.id} className={'tk-item' + (a.important ? ' imp' : '')}>{a.important && <b>ÖNEMLİ</b>}{a.title}</span>
  ));

  return (
    <>
      <button type="button" className={'ann-ticker' + (important ? ' important' : '')} onClick={() => setOpen(true)} aria-label="Duyuruları aç">
        <span className="ann-label"><Megaphone size={16} /><span>Duyurular</span></span>
        <span className="ann-track">
          <span className="ann-run" style={{ animationDuration: `${duration}s` }}>
            {run}<span aria-hidden="true" className="ann-dup">{run}</span>
          </span>
        </span>
      </button>
      {open && (
        <Modal title="Duyurular" onClose={() => setOpen(false)}>
          <ul className="ann-list">
            {items.map((a) => (
              <li key={a.id} className={a.important ? 'imp' : ''}>
                <h4>{a.important && <span className="tag danger">Önemli</span>} {a.title}</h4>
                {a.body && <p>{a.body}</p>}
                <small>{a.author.fullName} · {audienceLabel(a)} · {formatDue(a.startsAt)}{a.endsAt && ` → ${formatDue(a.endsAt)}`}</small>
              </li>
            ))}
          </ul>
          <div className="actions"><Link className="btn" to="/announcements" onClick={() => setOpen(false)}>Tüm duyurular</Link></div>
        </Modal>
      )}
    </>
  );
}
