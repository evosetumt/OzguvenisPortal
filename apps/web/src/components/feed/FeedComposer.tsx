import { useState, type FormEvent } from 'react';
import { Building2, Camera, ImagePlus, Send } from 'lucide-react';
import { Avatar } from '../Avatar';
import { AttachmentPicker } from '../AttachmentPicker';
import { CustomerPicker } from '../CustomerPicker';
import { api } from '../../lib/api';
import { json } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { useRequired } from '../../lib/required';
import type { FileRef } from '../../lib/types-workflow';

const POST_MAX = 4000;

/**
 * Sosyal medya tarzı paylaşım kutusu: kapalıyken "Ne paylaşmak istersin?" hapı ve hızlı fotoğraf düğmeleri,
 * açılınca metin, fotoğraf/dosya ekleri ve isteğe bağlı firma. Metin veya en az bir ek yeterlidir.
 */
export function FeedComposer({ onPosted }: { onPosted(): void }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [customer, setCustomer] = useState('');
  const [files, setFiles] = useState<FileRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const req = useRequired('feedPost');

  const firstName = me!.fullName.split(' ')[0];
  const canPost = (!!body.trim() || files.length > 0) && !busy;
  const reset = () => { setOpen(false); setBody(''); setCustomer(''); setFiles([]); setErr(''); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canPost) return;
    const missing = req.check({ customerCode: customer });
    if (missing) { setErr(missing); return; }
    setBusy(true); setErr('');
    try {
      await api('/feed', json('POST', { body: body.trim(), customerCode: customer.trim() || null, attachmentIds: files.map((f) => f.id) }));
      reset();
      onPosted();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Paylaşılamadı'); } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div className="fd-composer is-closed">
        <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} />
        <button type="button" className="fd-composer__pill" onClick={() => setOpen(true)}>Ne paylaşmak istersin, {firstName}?</button>
        <div className="fd-composer__quick">
          <button type="button" className="fd-quick photo" onClick={() => setOpen(true)} title="Fotoğraf"><ImagePlus size={19} /><span>Fotoğraf</span></button>
          <button type="button" className="fd-quick camera" onClick={() => setOpen(true)} title="Kamera"><Camera size={19} /><span>Kamera</span></button>
        </div>
      </div>
    );
  }

  return (
    <form className="fd-composer is-open" onSubmit={(e) => void submit(e)}>
      <div className="fd-composer__top">
        <Avatar id={me!.id} name={me!.fullName} src={me!.avatarUrl} />
        <div>
          <b>{me!.fullName}</b>
          <small>İş akışına paylaşılıyor</small>
        </div>
      </div>
      <textarea autoFocus rows={4} maxLength={POST_MAX} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder={`Ne paylaşmak istersin, ${firstName}? Müşteri görüşmesi, bir başarı, bir fotoğraf…`} />
      <AttachmentPicker files={files} onAdd={(add) => setFiles((cur) => [...cur, ...add])}
        onRemove={(x) => setFiles((cur) => cur.filter((y) => y.id !== x.id))} />
      <div className="fd-composer__bar">
        <div className="fd-cust">
          <span className="fd-cust__label"><Building2 size={16} />Firma{req.has('customerCode') && <i className="req" aria-hidden="true">*</i>}</span>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>
        <span className="fd-spacer" />
        <button type="button" className="btn ghost sm" onClick={reset}>Vazgeç</button>
        <button className="btn primary sm fd-send" disabled={!canPost}><Send size={15} /> {busy ? 'Paylaşılıyor…' : 'Paylaş'}</button>
      </div>
      {err && <p className="error">{err}</p>}
    </form>
  );
}
