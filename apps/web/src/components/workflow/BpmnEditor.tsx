import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { ArrowLeft, CheckCircle2, Maximize2, Save, Upload } from 'lucide-react';
import Modeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import type { UserRef } from '../../lib/types';
import { DEF_STATUS_LABEL, type ProcessDefinition, type ProcessMeta } from '../../lib/types-workflow';
import { portalModdle } from './portal-moddle';

/* bpmn-js servisleri tipsiz kullanılır (diagram-js servis tipleri geniş ve değişken). */
type Any = any;

interface Props { definitionId: number; onBack(): void; onSaved(def: ProcessDefinition): void }

export function BpmnEditor({ definitionId, onBack, onSaved }: Props) {
  const { data: def, error } = useApi<ProcessDefinition>(`/process-definitions/${definitionId}`);
  const { data: meta } = useApi<ProcessMeta>('/process-meta');
  const { data: users } = useApi<UserRef[]>('/users/directory');
  const host = useRef<HTMLDivElement>(null);
  const [modeler, setModeler] = useState<Any>(null);
  const [selected, setSelected] = useState<Any>(null);
  const [rev, setRev] = useState(0);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!def?.bpmnXml || !host.current) return;
    setName(def.name);
    const m: Any = new Modeler({ container: host.current, moddleExtensions: { portal: portalModdle } });
    let alive = true;
    m.importXML(def.bpmnXml)
      .then(() => { if (alive) { m.get('canvas').zoom('fit-viewport', 'auto'); setModeler(m); } })
      .catch((e: Error) => setErrors([`Diyagram açılamadı: ${e.message}`]));
    m.on('selection.changed', (e: Any) => setSelected(e.newSelection.length === 1 ? e.newSelection[0] : null));
    m.on('elements.changed', () => setRev((r) => r + 1));
    return () => { alive = false; m.destroy(); };
  }, [def?.id]);

  const xml = async () => (await modeler.saveXML({ format: true })).xml as string;

  const save = async (): Promise<ProcessDefinition | null> => {
    setBusy(true); setMsg(null);
    try {
      const saved = await api<ProcessDefinition>(`/process-definitions/${definitionId}`, json('PUT', { bpmnXml: await xml(), name }));
      setMsg({ ok: true, text: saved.id === definitionId ? 'Taslak kaydedildi' : `Yeni taslak sürüm oluşturuldu (v${saved.version})` });
      onSaved(saved);
      return saved;
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' }); return null; } finally { setBusy(false); }
  };

  const validate = async () => {
    const r = await api<{ errors: string[] }>('/process-definitions/validate', json('POST', { bpmnXml: await xml() }));
    setErrors(r.errors);
    if (!r.errors.length) setMsg({ ok: true, text: 'Diyagram geçerli' });
    return r.errors;
  };

  const publish = async () => {
    if ((await validate()).length) return;
    if (!window.confirm('Bu sürüm yayınlansın mı? Yeni başlayan süreçler bu sürümü kullanır; çalışanlar kendi sürümünde devam eder.')) return;
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try {
      const pub = await api<ProcessDefinition>(`/process-definitions/${saved.id}/publish`, json('POST'));
      setMsg({ ok: true, text: `v${pub.version} yayınlandı` });
      onSaved(pub);
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Yayınlanamadı' }); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <button className="link-btn" onClick={onBack}><ArrowLeft size={14} /> Süreçler</button>
          <h1>{def?.name ?? 'Süreç'}</h1>
          {def && <p className="sub"><code>{def.key}</code> · v{def.version} · <span className={`status ${def.status}`}>{DEF_STATUS_LABEL[def.status]}</span>
            {def.status !== 'draft' && <> · kaydedince yeni taslak sürüm açılır</>}</p>}
        </div>
        <div className="actions">
          <button className="btn ghost" disabled={!modeler} onClick={() => modeler.get('canvas').zoom('fit-viewport', 'auto')} title="Sığdır"><Maximize2 size={15} /></button>
          <button className="btn ghost" disabled={!modeler || busy} onClick={() => void validate()}><CheckCircle2 size={15} /> Doğrula</button>
          <button className="btn ghost" disabled={!modeler || busy} onClick={() => void save()}><Save size={15} /> Kaydet</button>
          <button className="btn primary" disabled={!modeler || busy} onClick={() => void publish()}><Upload size={15} /> Yayınla</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && <p className={msg.ok ? 'ok' : 'error'} role="status" style={{ marginBottom: 10 }}>{msg.text}</p>}
      {errors.length > 0 && <ul className="errors" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="wf-editor">
        <div className="bpmn-canvas" ref={host} />
        <aside className="glass props-panel">
          <label>Süreç adı<input value={name} maxLength={150} onChange={(e) => setName(e.target.value)} /></label>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%', margin: '4px 0' }} />
          {modeler && selected
            ? <ElementProps key={`${selected.id}-${rev}`} modeler={modeler} el={selected} meta={meta} users={users ?? []} />
            : <Help />}
        </aside>
      </div>
    </>
  );
}

/** Odaktan çıkınca/Enter'da değişikliği diyagrama yazan alan (her tuşta komut üretmemek için). */
function Field({ label, value, onCommit, placeholder, type = 'text', area }: {
  label: string; value: string; onCommit(v: string): void; placeholder?: string; type?: string; area?: boolean;
}) {
  const [v, setV] = useState(value);
  const commit = () => { if (v !== value) onCommit(v); };
  const onKey = (e: RKeyboardEvent) => { if (e.key === 'Enter' && !area) (e.target as HTMLElement).blur(); };
  return (
    <label>{label}
      {area
        ? <textarea rows={3} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
        : <input type={type} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={onKey} />}
    </label>
  );
}

const TYPE_LABEL: Record<string, string> = {
  'bpmn:StartEvent': 'Başlangıç', 'bpmn:EndEvent': 'Bitiş', 'bpmn:UserTask': 'Kullanıcı görevi (onay)', 'bpmn:ServiceTask': 'Servis görevi (otomatik)',
  'bpmn:ExclusiveGateway': 'Karar kapısı', 'bpmn:SequenceFlow': 'Akış', 'bpmn:Task': 'Görev (tür seçilmemiş)',
};

function ElementProps({ modeler, el, meta, users }: { modeler: Any; el: Any; meta: ProcessMeta | null; users: UserRef[] }) {
  const bo = el.businessObject;
  const modeling = modeler.get('modeling');
  const update = (props: Record<string, unknown>) => modeling.updateProperties(el, props);
  const get = (k: string) => (bo.get(k) as string | undefined) ?? '';
  const type: string = el.type;

  if (el.type === 'label') return <p className="hint">Etiket seçildi; öğenin kendisini seçin.</p>;

  return (
    <>
      <div><b>{TYPE_LABEL[type] ?? type.replace('bpmn:', '')}</b><br /><small><code>{bo.id}</code></small></div>
      {type !== 'bpmn:SequenceFlow' || el.source?.type === 'bpmn:ExclusiveGateway'
        ? <Field label="Ad" value={bo.name ?? ''} onCommit={(v) => update({ name: v || undefined })} />
        : null}

      {type === 'bpmn:Task' && (
        <>
          <p className="hint">Motor yalnızca kullanıcı ve servis görevlerini çalıştırır. Türü seçin:</p>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn ghost sm" onClick={() => modeler.get('bpmnReplace').replaceElement(el, { type: 'bpmn:UserTask' })}>Kullanıcı görevi</button>
            <button className="btn ghost sm" onClick={() => modeler.get('bpmnReplace').replaceElement(el, { type: 'bpmn:ServiceTask' })}>Servis görevi</button>
          </div>
        </>
      )}

      {type === 'bpmn:UserTask' && (
        <>
          <label>Sorumlu
            <select value={get('portal:assignee')} onChange={(e) => update({ 'portal:assignee': e.target.value || undefined })}>
              <option value="">Seçin</option>
              <option value="manager">Başlatanın departman yöneticisi</option>
              <option value="initiator">Süreci başlatan kişi</option>
              <optgroup label="Birim (birimdeki herkesin görev listesine düşer)">
                {meta?.departments?.map((d) => <option key={d} value={`department:${d}`}>{d} birimi</option>)}
              </optgroup>
              <optgroup label="Rol (rolü olan herkes görebilir)">
                {meta?.roles.map((r) => <option key={r} value={`role:${r}`}>{r}</option>)}
              </optgroup>
              <optgroup label="Belirli kişi">
                {users.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.fullName}</option>)}
              </optgroup>
            </select>
          </label>
          <Field label="Süre (saat) — dolunca hatırlatma" type="number" value={get('portal:dueHours')} placeholder="Varsayılan ayar"
            onCommit={(v) => update({ 'portal:dueHours': v || undefined })} />
          <label>Karar seçenekleri
            <select value={get('portal:decisions') || 'approved,rejected'} onChange={(e) => update({ 'portal:decisions': e.target.value })}>
              <option value="approved,rejected">Onayla / Reddet</option>
              <option value="approved">Yalnızca onayla (tamamla)</option>
              <option value="paid">Ödendi olarak işaretle</option>
            </select>
          </label>
          <p className="hint">Karar, sonraki karar kapısında <code>decision</code> değişkeniyle okunur (örn. <code>{"${decision == 'approved'}"}</code>).</p>
        </>
      )}

      {type === 'bpmn:ServiceTask' && (
        <>
          <label>İşleyici
            <select value={get('portal:handler')} onChange={(e) => update({ 'portal:handler': e.target.value || undefined })}>
              <option value="">Seçin</option>
              {meta?.handlers.map((h) => <option key={h.name} value={h.name}>{h.label} ({h.name})</option>)}
            </select>
          </label>
          <Field label="Argüman" value={get('portal:args')} onCommit={(v) => update({ 'portal:args': v || undefined })}
            placeholder={meta?.handlers.find((h) => h.name === get('portal:handler'))?.argsHint} />
          {meta?.handlers.find((h) => h.name === get('portal:handler'))?.argsHint && (
            <p className="hint">Biçim: {meta.handlers.find((h) => h.name === get('portal:handler'))!.argsHint}</p>
          )}
        </>
      )}

      {type === 'bpmn:ExclusiveGateway' && (
        <p className="hint">Çıkan akışlara koşul yazın; koşulu sağlanmayan durumlar için bir akışı <b>varsayılan</b> yapın.</p>
      )}

      {type === 'bpmn:SequenceFlow' && el.source?.type === 'bpmn:ExclusiveGateway' && (
        <FlowProps modeler={modeler} el={el} />
      )}
    </>
  );
}

function FlowProps({ modeler, el }: { modeler: Any; el: Any }) {
  const bo = el.businessObject;
  const modeling = modeler.get('modeling');
  const moddle = modeler.get('moddle');
  const isDefault = el.source.businessObject.default === bo;

  const setCondition = (body: string) => {
    modeling.updateProperties(el, {
      conditionExpression: body.trim() ? moddle.create('bpmn:FormalExpression', { body: body.trim() }) : undefined,
    });
  };
  const setDefault = (on: boolean) => {
    if (on && bo.conditionExpression) modeling.updateProperties(el, { conditionExpression: undefined });
    modeling.updateProperties(el.source, { default: on ? bo : undefined });
  };

  return (
    <>
      <label className="check"><input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} /> Varsayılan akış</label>
      {!isDefault && (
        <Field label="Koşul" area value={bo.conditionExpression?.body ?? ''} onCommit={setCondition}
          placeholder="${amountTry <= settings.expense.autoApproveLimit}" />
      )}
      <p className="hint">
        Değişkenler: <code>decision</code>, <code>comment</code>, masraf için <code>amountTry</code>, <code>amount</code>, <code>category</code>;
        ayarlar: <code>settings.expense.autoApproveLimit</code>. İşleçler: <code>== != &lt; &lt;= &gt; &gt;= && || !</code>
      </p>
    </>
  );
}

function Help() {
  return (
    <div className="hint">
      <p className="hint">Soldaki paletten öğe ekleyin, bağlamak için öğeye tıklayıp ok simgesini sürükleyin. Özellikleri düzenlemek için bir öğe seçin.</p>
      <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
        <li><b>Kullanıcı görevi</b>: onay adımı; sorumlu ve karar seçenekleri.</li>
        <li><b>Servis görevi</b>: otomatik adım (durum güncelle, bildirim gönder).</li>
        <li><b>Karar kapısı</b>: koşullu dallanma; bir çıkış varsayılan olmalı.</li>
      </ul>
      <p className="hint">Desteklenmeyen öğeler (paralel kapı, alt süreç, ara olaylar) yayında hata verir.</p>
    </div>
  );
}
