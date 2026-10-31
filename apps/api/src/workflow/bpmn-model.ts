import { XMLParser } from 'fast-xml-parser';
import { parseExpression } from './expression';

/**
 * BPMN 2.0 XML'inin motorun desteklediği alt kümesi.
 * Özel öznitelikler `portal` ad alanındadır (xmlns:portal="http://ozguvenis.local/portal"):
 *  - userTask: portal:assignee (initiator | manager | department:<Birim> | role:<Rol> | user:<id>), portal:dueHours, portal:decisions (virgüllü)
 *  - serviceTask: portal:handler, portal:args
 */
export const PORTAL_NS = 'http://ozguvenis.local/portal';

export type ElementType = 'startEvent' | 'endEvent' | 'userTask' | 'serviceTask' | 'exclusiveGateway';
const SUPPORTED: ElementType[] = ['startEvent', 'endEvent', 'userTask', 'serviceTask', 'exclusiveGateway'];
const UNSUPPORTED = [
  'task', 'parallelGateway', 'inclusiveGateway', 'eventBasedGateway', 'complexGateway', 'scriptTask', 'sendTask', 'receiveTask',
  'manualTask', 'businessRuleTask', 'callActivity', 'subProcess', 'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent',
];

export interface BpmnElement {
  id: string;
  type: ElementType;
  name: string;
  attrs: Record<string, string>; // portal öznitelikleri (önek olmadan)
  incoming: string[];
  outgoing: string[];
  defaultFlow?: string;
}

export interface BpmnFlow { id: string; name: string; source: string; target: string; condition?: string }

export interface BpmnModel {
  elements: Map<string, BpmnElement>;
  flows: Map<string, BpmnFlow>;
  startId: string | null;
  unsupported: { id: string; type: string; name: string }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
  isArray: (name) => [...SUPPORTED, ...UNSUPPORTED, 'sequenceFlow', 'process', 'incoming', 'outgoing'].includes(name),
});

const PORTAL_ATTRS = ['assignee', 'dueHours', 'decisions', 'handler', 'args'];

const text = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as Record<string, unknown>)['#text']);
  return undefined;
};

export function parseBpmn(xml: string): BpmnModel {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    throw new Error(`BPMN XML okunamadı: ${(e as Error).message}`);
  }
  const processes: any[] = doc?.definitions?.process ?? [];
  const proc = processes.find((p) => SUPPORTED.some((t) => p[t]?.length)) ?? processes[0];
  if (!proc) throw new Error('BPMN içinde süreç (process) bulunamadı');

  const elements = new Map<string, BpmnElement>();
  const flows = new Map<string, BpmnFlow>();
  const unsupported: BpmnModel['unsupported'] = [];

  for (const type of SUPPORTED) {
    for (const raw of proc[type] ?? []) {
      const attrs: Record<string, string> = {};
      for (const a of PORTAL_ATTRS) if (raw[`@_${a}`] != null) attrs[a] = String(raw[`@_${a}`]).trim();
      elements.set(raw['@_id'], {
        id: raw['@_id'],
        type,
        name: raw['@_name'] ?? '',
        attrs,
        incoming: [],
        outgoing: [],
        defaultFlow: raw['@_default'],
      });
    }
  }
  for (const type of UNSUPPORTED) {
    for (const raw of proc[type] ?? []) unsupported.push({ id: raw['@_id'], type, name: raw['@_name'] ?? '' });
  }
  for (const raw of proc.sequenceFlow ?? []) {
    const f: BpmnFlow = {
      id: raw['@_id'],
      name: raw['@_name'] ?? '',
      source: raw['@_sourceRef'],
      target: raw['@_targetRef'],
      condition: text(raw.conditionExpression)?.trim() || undefined,
    };
    flows.set(f.id, f);
    elements.get(f.source)?.outgoing.push(f.id);
    elements.get(f.target)?.incoming.push(f.id);
  }
  const starts = [...elements.values()].filter((e) => e.type === 'startEvent');
  return { elements, flows, startId: starts.length === 1 ? starts[0].id : null, unsupported };
}

const label = (e: { id: string; name: string }) => (e.name ? `"${e.name}"` : e.id);

/** Yayınlamadan önce doğrulama. Hata listesi boşsa süreç çalıştırılabilir. */
export function validateBpmn(xml: string, handlers: Set<string>): string[] {
  let m: BpmnModel;
  try {
    m = parseBpmn(xml);
  } catch (e) {
    return [(e as Error).message];
  }
  const errors: string[] = [];
  for (const u of m.unsupported) {
    errors.push(u.type === 'task'
      ? `${label(u)}: görev türünü seçin (Kullanıcı görevi veya Servis görevi)`
      : `${label(u)}: desteklenmeyen öğe (${u.type})`);
  }
  const starts = [...m.elements.values()].filter((e) => e.type === 'startEvent');
  if (starts.length !== 1) errors.push(`Tam olarak bir başlangıç olayı olmalı (şu an ${starts.length})`);
  if (![...m.elements.values()].some((e) => e.type === 'endEvent')) errors.push('En az bir bitiş olayı olmalı');

  for (const f of m.flows.values()) {
    if (!m.elements.has(f.source) || !m.elements.has(f.target)) errors.push(`Akış ${f.id} desteklenmeyen bir öğeye bağlı`);
    if (f.condition) {
      try { parseExpression(f.condition); } catch (e) { errors.push(`Akış ${label(f)} koşulu hatalı: ${(e as Error).message}`); }
    }
  }

  for (const e of m.elements.values()) {
    if (e.type === 'endEvent') {
      if (e.outgoing.length) errors.push(`${label(e)}: bitiş olayından çıkış olamaz`);
      continue;
    }
    if (e.type !== 'startEvent' && !e.incoming.length) errors.push(`${label(e)}: gelen akış yok`);
    if (!e.outgoing.length) errors.push(`${label(e)}: çıkan akış yok`);
    if (e.type === 'exclusiveGateway') {
      if (e.outgoing.length > 1) {
        const noCond = e.outgoing.filter((id) => !m.flows.get(id)?.condition && id !== e.defaultFlow);
        if (noCond.length) errors.push(`${label(e)}: koşulsuz çıkışlar var; her çıkışa koşul yazın veya birini varsayılan yapın`);
      }
    } else if (e.outgoing.length > 1) {
      errors.push(`${label(e)}: birden fazla çıkış var; dallanma için karar kapısı (exclusive gateway) kullanın`);
    }
    if (e.type === 'userTask') {
      const a = e.attrs.assignee ?? '';
      if (!/^(initiator|manager|department:.+|role:.+|user:\d+)$/.test(a)) errors.push(`${label(e)}: sorumlu tanımlı değil (initiator, manager, department:<Birim>, role:<Rol> veya user:<id>)`);
      if (e.attrs.dueHours && !(Number(e.attrs.dueHours) > 0)) errors.push(`${label(e)}: süre (saat) pozitif sayı olmalı`);
    }
    if (e.type === 'serviceTask') {
      if (!e.attrs.handler) errors.push(`${label(e)}: işleyici seçilmemiş`);
      else if (!handlers.has(e.attrs.handler)) errors.push(`${label(e)}: bilinmeyen işleyici "${e.attrs.handler}"`);
    }
  }

  // Erişilebilirlik: her öğe başlangıçtan ulaşılabilir ve her öğeden bir bitişe ulaşılabilir olmalı.
  if (m.startId) {
    const seen = new Set<string>([m.startId]);
    const queue = [m.startId];
    while (queue.length) {
      for (const fid of m.elements.get(queue.shift()!)!.outgoing) {
        const t = m.flows.get(fid)?.target;
        if (t && m.elements.has(t) && !seen.has(t)) { seen.add(t); queue.push(t); }
      }
    }
    for (const e of m.elements.values()) if (!seen.has(e.id)) errors.push(`${label(e)}: başlangıçtan ulaşılamıyor`);

    const canEnd = new Set([...m.elements.values()].filter((e) => e.type === 'endEvent').map((e) => e.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of m.elements.values()) {
        if (canEnd.has(e.id)) continue;
        if (e.outgoing.some((fid) => canEnd.has(m.flows.get(fid)?.target ?? ''))) { canEnd.add(e.id); changed = true; }
      }
    }
    for (const e of m.elements.values()) if (seen.has(e.id) && !canEnd.has(e.id)) errors.push(`${label(e)}: bitiş olayına ulaşmıyor`);
  }
  return [...new Set(errors)];
}
