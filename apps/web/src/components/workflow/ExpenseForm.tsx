import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Paperclip, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { json, useApi } from '../../lib/data';
import { uploadFile } from '../../lib/files';
import { localKey } from '../../lib/format';
import { Modal } from '../Modal';
import { Receipt } from './Receipt';
import type { CategorySuggestion, ExpenseCategory, ExpenseDetail, ExpenseSettingsData, FileRef } from '../../lib/types-workflow';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'];

interface Props { expense?: ExpenseDetail; onClose(): void; onSaved(e: ExpenseDetail, submit: boolean): void }

export function ExpenseForm({ expense, onClose, onSaved }: Props) {
  const { data: cats } = useApi<ExpenseCategory[]>('/expense-categories');
  const { data: settings } = useApi<ExpenseSettingsData>('/expense-settings');
  const [f, setF] = useState({
    categoryId: expense ? String(expense.categoryId) : '',
    amount: expense ? String(expense.amount) : '',
    currency: expense?.currency ?? 'TRY',
    amountTry: expense && expense.currency !== 'TRY' ? String(expense.amountTry) : '',
    expenseDate: expense ? expense.expenseDate.slice(0, 10) : localKey(new Date()),
    description: expense?.description ?? '',
  });
  const [files, setFiles] = useState<FileRef[]>(expense?.receipts ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const aiOn = !!settings?.aiCategorySuggest && settings.aiAvailable;
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const suggest = async (auto = false) => {
    if (!aiOn || f.description.trim().length < 3 || (auto && f.categoryId)) return;
    setSuggesting(true);
    try {
      const s = await api<CategorySuggestion>('/expenses/suggest-category', json('POST', { description: f.description }));
      setSuggestion(s);
      if (auto && s.categoryId) setF((cur) => (cur.categoryId ? cur : { ...cur, categoryId: String(s.categoryId) }));
    } catch { setSuggestion(null); } finally { setSuggesting(false); }
  };

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    setUploading(true);
    setErr('');
    try {
      for (const file of list.slice(0, 10 - files.length)) {
        const up = await uploadFile(file);
        setFiles((cur) => [...cur, up]);
      }
    } catch (x) { setErr(x instanceof Error ? x.message : 'Dosya yüklenemedi'); } finally { setUploading(false); }
  };

  const save = async (submit: boolean) => {
    setBusy(true);
    setErr('');
    const body = {
      categoryId: Number(f.categoryId),
      amount: Number(f.amount.replace(',', '.')),
      currency: f.currency,
      ...(f.currency !== 'TRY' ? { amountTry: Number(f.amountTry.replace(',', '.')) } : {}),
      expenseDate: f.expenseDate,
      description: f.description,
      receiptIds: files.map((x) => x.id),
    };
    try {
      let saved = expense
        ? await api<ExpenseDetail>(`/expenses/${expense.id}`, json('PATCH', body))
        : await api<ExpenseDetail>('/expenses', json('POST', body));
      if (submit) saved = await api<ExpenseDetail>(`/expenses/${saved.id}/submit`, json('POST'));
      onSaved(saved, submit);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Kaydedilemedi');
    } finally { setBusy(false); }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void save(true); };
  const suggestedName = suggestion?.categoryId ? cats?.find((c) => c.id === suggestion.categoryId)?.name : null;

  return (
    <Modal title={expense ? `Masraf #${expense.id}` : 'Yeni masraf'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <label>Açıklama
          <textarea required minLength={2} maxLength={500} rows={2} placeholder="Örn. Ankara müşteri ziyareti, otel 1 gece"
            value={f.description} onChange={set('description')} onBlur={() => void suggest(true)} />
        </label>
        <div className="row">
          <label>Kategori
            <select required value={f.categoryId} onChange={set('categoryId')}>
              <option value="">Seçin</option>
              {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Tarih<input type="date" required max={localKey(new Date())} value={f.expenseDate} onChange={set('expenseDate')} /></label>
        </div>
        {aiOn && (
          <div className="suggest">
            <button type="button" className="link-btn" onClick={() => void suggest()} disabled={suggesting || f.description.trim().length < 3}>
              <Sparkles size={13} /> {suggesting ? 'Öneriliyor…' : 'Kategori öner'}
            </button>
            {suggestion && (suggestedName
              ? <span>Öneri: <b>{suggestedName}</b>{String(suggestion.categoryId) !== f.categoryId && (
                <button type="button" className="link-btn" onClick={() => setF({ ...f, categoryId: String(suggestion.categoryId) })}>Uygula</button>
              )}</span>
              : <span>Açıklamadan kategori çıkarılamadı</span>)}
          </div>
        )}
        <div className="row">
          <label>Tutar<input required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="0,00" value={f.amount} onChange={set('amount')} /></label>
          <label>Para birimi
            <select value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          {f.currency !== 'TRY' && (
            <label>TL karşılığı<input required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" value={f.amountTry} onChange={set('amountTry')} /></label>
          )}
        </div>
        <div className="field">Fiş / belge
          <div className="receipts">
            {files.map((file) => <Receipt key={file.id} file={file} onRemove={() => setFiles(files.filter((x) => x.id !== file.id))} />)}
            {files.length < 10 && (
              <button type="button" className="receipt add" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Paperclip size={18} />{uploading ? 'Yükleniyor…' : 'Ekle'}
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" hidden multiple accept="image/*,application/pdf" capture="environment" onChange={onFiles} />
        </div>
        {settings && <p className="hint">{settings.autoApproveLimit.toLocaleString('tr-TR')} TL ve altındaki masraflar otomatik onaylanıp muhasebeye gider.</p>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn ghost" disabled={busy || uploading} onClick={() => void save(false)}>Taslak kaydet</button>
          <button className="btn primary" disabled={busy || uploading || !files.length} title={files.length ? '' : 'Önce fiş ekleyin'}>Onaya gönder</button>
        </div>
      </form>
    </Modal>
  );
}
