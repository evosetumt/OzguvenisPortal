import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, Table2, LineChart as LineIcon } from 'lucide-react';
import { useApi } from '../lib/data';
import type { TaskReport } from '../lib/types-insights';
import '../styles/insights.css';

const RANGES = [7, 30, 90] as const;
const SCOPE_LABEL = { all: '', department: ' · departmanım', own: ' · yalnızca benim görevlerim' };
const nf = (n: number) => n.toLocaleString('tr-TR');
const dayLabel = (k: string, long = false) =>
  new Date(`${k}T00:00:00`).toLocaleDateString('tr-TR', long ? { day: 'numeric', month: 'long', weekday: 'short' } : { day: 'numeric', month: 'short' });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Önceki döneme göre değişim etiketi. lowerIsBetter: süre gibi azalması iyi olan ölçüler. */
function Delta({ cur, prev, unit = '%', mode = 'pct', lowerIsBetter = false }: {
  cur: number | null; prev: number | null; unit?: string; mode?: 'pct' | 'diff'; lowerIsBetter?: boolean;
}) {
  if (cur === null || prev === null) return null;
  let v: number;
  if (mode === 'pct') {
    if (!prev) return null;
    v = Math.round(((cur - prev) / prev) * 100);
  } else v = Math.round((cur - prev) * 10) / 10;
  if (!v) return <span className="delta">±0{unit}</span>;
  const good = lowerIsBetter ? v < 0 : v > 0;
  return <span className={'delta ' + (good ? 'up' : 'down')}>{v > 0 ? '+' : '−'}{nf(Math.abs(v))}{unit}</span>;
}

export function InsightsPage() {
  const [days, setDays] = useState<number>(30);
  const { data: r, error } = useApi<TaskReport>(`/reports/tasks?days=${days}`);

  const exportCsv = () => {
    if (!r) return;
    const lines = [['Tarih', 'Tamamlanan', 'Açılan', 'Önceki dönem tamamlanan'], ...r.daily.map((d) => [d.date, d.completed, d.created, d.prevCompleted])];
    const blob = new Blob(['﻿' + lines.map((l) => l.join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gorev-analizi-${r.period.from}-${r.period.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <header className="ins-head">
        <div className="ins-lead">
          <h1>Analiz</h1>
          <p className="ins-sub">Ekibin son {days} günde nasıl çalıştığı{r ? SCOPE_LABEL[r.period.scope] : ''}</p>
        </div>
        <dl className="ins-stats">
          <div className="glass stat">
            <dt>Tamamlanan</dt>
            <dd>{r ? nf(r.current.completed) : '–'}{r && <Delta cur={r.current.completed} prev={r.previous.completed} />}</dd>
          </div>
          <div className="glass stat">
            <dt>Zamanında</dt>
            <dd>{r?.current.onTimeRate ?? '–'}{r?.current.onTimeRate !== null && r && <small>%</small>}{r && <Delta cur={r.current.onTimeRate} prev={r.previous.onTimeRate} mode="diff" unit=" puan" />}</dd>
          </div>
          <div className="glass stat">
            <dt>Açık iş</dt>
            <dd>{r ? nf(r.open) : '–'}{r && r.overdue > 0 && <span className="delta down">{nf(r.overdue)} geciken</span>}</dd>
          </div>
          <div className="glass stat">
            <dt>Ort. tamamlanma</dt>
            <dd>{r?.current.avgCycleDays !== null && r ? nf(r.current.avgCycleDays) : '–'}{r?.current.avgCycleDays !== null && r && <small>g</small>}
              {r && <Delta cur={r.current.avgCycleDays} prev={r.previous.avgCycleDays} mode="diff" unit="g" lowerIsBetter />}</dd>
          </div>
        </dl>
        <div className="ins-actions">
          <div className="seg" role="group" aria-label="Dönem">
            {RANGES.map((d) => <button key={d} className={d === days ? 'on' : ''} aria-pressed={d === days} onClick={() => setDays(d)}>{d}G</button>)}
          </div>
          <button className="btn ghost" onClick={exportCsv} disabled={!r}><Download size={17} /> CSV indir</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {r && (
        <div className="insights">
          <Throughput r={r} />
          <ByProject r={r} />
          <NewWork r={r} />
          <Workload r={r} />
          <OnTime r={r} />
          {(r.erp.open > 0 || r.erp.autoClosed + r.erp.manualClosed > 0) && <ErpCard r={r} />}
        </div>
      )}
    </>
  );
}

function Card({ className, title, sub, tools, children }: { className: string; title: string; sub: string; tools?: ReactNode; children: ReactNode }) {
  return (
    <section className={'glass ins-card ' + className}>
      <header className="ins-card__head">
        <div><h3>{title}</h3><p className="ins-card__sub">{sub}</p></div>
        {tools && <div className="ins-card__tools">{tools}</div>}
      </header>
      {children}
    </section>
  );
}

/** Kapsayıcının genişliğini izler; SVG grafikler piksel ölçüsünde çizilir (yazılar ölçeklenmez). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Eğimi korunan (monotone) kübik eğri: veriyi aşmadan yumuşak çizgi. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
  const n = pts.length;
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let p = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (pts[i + 1][0] - pts[i][0]) / 3;
    p += ` C${pts[i][0] + dx},${pts[i][1] + m[i] * dx} ${pts[i + 1][0] - dx},${pts[i + 1][1] - m[i + 1] * dx} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return p;
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = Math.ceil(v / step);
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
};
const tickEvery = (days: number) => (days <= 7 ? 1 : days <= 30 ? 2 : 7);

function Throughput({ r }: { r: TaskReport }) {
  const [table, setTable] = useState(false);
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const prevTotal = r.previous.completed;
  const H = 240, L = 30, R = 8, T = 10, B = 26;
  const max = niceMax(Math.max(1, ...r.daily.map((d) => Math.max(d.completed, d.prevCompleted))));
  const n = r.daily.length;
  const x = (i: number) => L + (n === 1 ? 0 : (i / (n - 1)) * (w - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const cur = r.daily.map((d, i) => [x(i), y(d.completed)] as [number, number]);
  const prev = r.daily.map((d, i) => [x(i), y(d.prevCompleted)] as [number, number]);
  const line = smoothPath(cur);
  const every = tickEvery(n);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - L) / Math.max(1, w - L - R)) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <Card className="ins-thru" title="Tamamlanan iş" sub="Her gün bitirilen görevler"
      tools={<button className={'btn ghost sm' + (table ? ' on' : '')} aria-pressed={table} onClick={() => setTable(!table)}>
        {table ? <><LineIcon size={15} /> Grafik</> : <><Table2 size={15} /> Tablo</>}
      </button>}>
      <div className="ins-top">
        <p className="ins-sum"><b>{nf(r.current.completed)}</b> tamamlandı <Delta cur={r.current.completed} prev={prevTotal} />{prevTotal > 0 && <span> önceki {r.period.days} güne göre</span>}</p>
        <ul className="ins-key">
          <li><i className="key-line" /> Son {r.period.days} gün</li>
          <li><i className="key-line dash" /> Önceki {r.period.days} gün</li>
        </ul>
      </div>
      <div className="thru" ref={ref}>
        {!table && w > 0 && (
          <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
            aria-label={`Günlük tamamlanan görevler, toplam ${r.current.completed}`}>
            <defs>
              <linearGradient id="thru-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-ink)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--accent-ink)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, max / 2, max].map((v) => (
              <g key={v}>
                <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="grid" />
                <text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis">{nf(v)}</text>
              </g>
            ))}
            {/* Etiketler sondan geriye aralıklı: son gün her zaman görünür, üst üste binmez */}
            {r.daily.map((d, i) => (n - 1 - i) % every === 0 ? (
              <text key={d.date} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="axis">{dayLabel(d.date)}</text>
            ) : null)}
            <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#thru-fill)" />
            <path d={smoothPath(prev)} className="line prev" />
            <path d={line} className="line cur" />
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cursor" />
                <circle cx={x(hover)} cy={y(r.daily[hover].prevCompleted)} r={3.5} className="dot prev" />
                <circle cx={x(hover)} cy={y(r.daily[hover].completed)} r={5} className="dot cur" />
              </g>
            )}
          </svg>
        )}
        {!table && hover !== null && (
          <div className="ins-tip" style={{ left: Math.min(Math.max(x(hover), 70), w - 70) }}>
            <b>{dayLabel(r.daily[hover].date, true)}</b>
            <span><i className="key-line" /> {r.daily[hover].completed} tamamlandı</span>
            <span><i className="key-line dash" /> {r.daily[hover].prevCompleted} önceki dönem</span>
          </div>
        )}
        {table && (
          <div className="ins-table-wrap">
            <table className="itable">
              <thead><tr><th>Gün</th><th>Tamamlanan</th><th>Açılan</th><th>Önceki dönem</th></tr></thead>
              <tbody>
                {[...r.daily].reverse().map((d) => (
                  <tr key={d.date}><th>{dayLabel(d.date, true)}</th><td>{d.completed}</td><td>{d.created}</td><td className="muted">{d.prevCompleted}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th>Toplam</th><td>{r.current.completed}</td><td>{sum(r.daily.map((d) => d.created))}</td><td className="muted">{prevTotal}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

const FALLBACK = ['var(--purple)', 'var(--blue)', 'var(--pink)', 'var(--green)', 'var(--teal)', 'var(--orange)'];

function ByProject({ r }: { r: TaskReport }) {
  const [dim, setDim] = useState<number | null>(null);
  const items = r.byProject.slice(0, 6).map((p, i) => ({ ...p, color: p.project?.color ?? FALLBACK[i % FALLBACK.length] }));
  const rest = r.byProject.slice(6).reduce((n, p) => n + p.completed, 0);
  if (rest) items.push({ project: { id: -1, name: 'Diğer', color: 'var(--text-3)' }, completed: rest, share: Math.round((rest / r.current.completed) * 100), color: 'var(--text-3)' });
  const total = r.current.completed;
  const R = 62, C = 2 * Math.PI * R, gap = items.length > 1 ? 10 : 0;
  let off = 0;

  return (
    <Card className="ins-proj" title="Proje bazında" sub="Biten işin nereye gittiği">
      <div className="proj">
        <svg className="donut" viewBox="0 0 160 160" role="img" aria-label={`${total} tamamlanan görevin projelere dağılımı`}>
          <circle cx="80" cy="80" r={R} className="donut-track" />
          {total > 0 && items.map((p, i) => {
            const len = Math.max(0.5, (p.completed / total) * C - gap);
            const el = (
              <circle key={i} cx="80" cy="80" r={R} stroke={p.color} strokeDasharray={`${len} ${C}`} strokeDashoffset={-off}
                className={'donut-seg' + (dim !== null && dim !== i ? ' dim' : '')} transform="rotate(-90 80 80)"
                onMouseEnter={() => setDim(i)} onMouseLeave={() => setDim(null)} />
            );
            off += (p.completed / total) * C;
            return el;
          })}
          <text x="80" y="80" textAnchor="middle" className="donut-num">{nf(total)}</text>
          <text x="80" y="100" textAnchor="middle" className="donut-lab">tamamlandı</text>
        </svg>
        {items.length ? (
          <table className="plegend">
            <tbody>
              {items.map((p, i) => (
                <tr key={i} className={dim !== null && dim !== i ? 'dim' : ''} onMouseEnter={() => setDim(i)} onMouseLeave={() => setDim(null)}>
                  <th><i style={{ background: p.color }} /><span>{p.project?.name ?? 'Projesiz'}</span></th>
                  <td>{nf(p.completed)}</td>
                  <td>%{p.share ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">Bu dönemde tamamlanan görev yok.</p>}
      </div>
    </Card>
  );
}

function NewWork({ r }: { r: TaskReport }) {
  const total = sum(r.daily.map((d) => d.created));
  const max = niceMax(Math.max(1, ...r.daily.map((d) => d.created)));
  const n = r.daily.length;
  const every = n <= 7 ? 1 : n <= 30 ? 3 : 10;
  return (
    <Card className="ins-focus" title="Yeni iş" sub="Her gün açılan görevler">
      <p className="ins-sum"><b>{nf(total)}</b> görev açıldı <span>günde ortalama {nf(Math.round((total / n) * 10) / 10)}</span></p>
      <div className="hb" role="img" aria-label={`Günlük açılan görevler, toplam ${total}`}>
        <div className="hb-grid">
          {[max, max / 2, 0].map((v) => <span key={v}><em>{nf(v)}</em></span>)}
        </div>
        <div className="hb-cols">
          {r.daily.map((d, i) => (
            <div key={d.date} className={'hb-col' + ((n - 1 - i) % every === 0 ? ' tick' : '') + (i === n - 1 ? ' hi' : '')}>
              <div className="hb-track">
                <i className="hb-bar" style={{ height: `${(d.created / max) * 100}%` }} />
                <span className="hb-tip">{d.created}</span>
              </div>
              <span className="hb-lab">{dayLabel(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Workload({ r }: { r: TaskReport }) {
  const cap = r.capacity;
  const scale = Math.max(cap, ...r.workload.map((w) => w.open)) * 1.15;
  const over = r.workload.filter((w) => w.open > cap).length;
  return (
    <Card className="ins-work" title="İş yükü" sub={`Kişi başı açık görev, kapasite ${cap} görev`}
      tools={<span className={'pill' + (over ? ' warn' : '')}>{over ? `${over} kişi kapasite üstünde` : 'Herkes kapasite içinde'}</span>}>
      <ul className="ins-key work">
        <li><i className="key-bar" /> Açık iş</li>
        <li><i className="key-cap" /> Kapasite</li>
        <li><i className="key-bar over" /> Kapasite üstü</li>
      </ul>
      {r.workload.length === 0 && <p className="empty">Atanmış görev yok.</p>}
      <ul className="wl">
        {r.workload.map((w) => {
          const state = w.open > cap ? ' over' : w.open >= cap * 0.85 ? ' near' : '';
          return (
            <li key={w.user.id} className={'wl-row' + state}>
              <Link to={`/tasks?assignee=${w.user.id}`} className="wl-who">
                <span className="avatar sm">{w.user.fullName.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
                <span><b>{w.user.fullName}</b><small>{w.user.department ?? `${w.completed} tamamlandı`}</small></span>
              </Link>
              <div className="wl-bar" title={`${w.open} açık, ${w.overdue} geciken`}>
                <i className="wl-fill" style={{ width: `${Math.min(100, (w.open / scale) * 100)}%` }} />
                <i className="wl-cap" style={{ left: `${(cap / scale) * 100}%` }} />
              </div>
              <span className="wl-num"><b>{w.open}</b>/ {cap}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function OnTime({ r }: { r: TaskReport }) {
  const { onTime, late, onTimeRate } = r.current;
  const known = onTime + late;
  return (
    <Card className="ins-time" title="Zamanında bitirme" sub={`Son ${r.period.days} günde bitiş tarihli görevler`}>
      <p className="ot-big"><b>{onTimeRate ?? '–'}</b>{onTimeRate !== null && <small>%</small>} <span>bitiş gününde veya öncesinde bitti</span></p>
      <div className="ot-bar" aria-hidden="true">
        {known ? <>
          <i className="ok" style={{ flexGrow: onTime }} />
          {late > 0 && <i className="late" style={{ flexGrow: late }} />}
        </> : <i className="none" />}
      </div>
      <ul className="ins-key ot-key">
        <li><i className="dot-k ok" /><b>{nf(onTime)}</b> zamanında</li>
        <li><i className="dot-k late" /><b>{nf(late)}</b> geç</li>
      </ul>
      <h4 className="ot-title">En uzun süredir açık işler</h4>
      {r.slowest.length === 0 && <p className="empty">Açık görev yok.</p>}
      <ul className="slow">
        {r.slowest.map((t) => (
          <li key={t.id}>
            <Link to={`/tasks?id=${t.id}`}>
              <span className="slow-main">
                <b>{t.title}</b>
                <span>
                  {t.project && <span className="ptag" style={{ ['--hue' as string]: t.project.color }}><i />{t.project.name}</span>}
                  {t.assignee && <small>{t.assignee}</small>}
                </span>
              </span>
              <span className={'slow-age' + (t.overdue ? ' late' : '')}><b>{t.ageDays}g</b><small>{t.overdue ? 'gecikmiş' : 'açık'}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ErpCard({ r }: { r: TaskReport }) {
  const items = useMemo(() => [
    ['Açık iş emri', nf(r.erp.open)],
    ['Netsis ile otomatik kapanan', nf(r.erp.autoClosed)],
    ['Elle kapatılan', nf(r.erp.manualClosed)],
    ['Ort. kapanma süresi', r.erp.avgLeadDays === null ? '–' : `${nf(r.erp.avgLeadDays)} gün`],
  ], [r]);
  return (
    <Card className="ins-erp" title="İş emirleri (Netsis)" sub={`Son ${r.period.days} günde sipariş ve teklif türü görevler`}>
      <dl className="erp-stats">
        {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </Card>
  );
}
