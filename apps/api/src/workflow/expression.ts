/**
 * BPMN koşul ifadeleri için küçük ve güvenli değerlendirici (eval/Function kullanılmaz).
 * Desteklenen: sayı, 'metin', "metin", true/false/null, değişken yolları (amountTry, settings.expense.autoApproveLimit),
 * + - * /, == != < <= > >=, && || !, parantez. İfade `${ ... }` içinde de yazılabilir.
 */

type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'var'; path: string }
  | { t: 'not'; e: Node }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node };

interface Tok { k: 'num' | 'str' | 'id' | 'op' | 'end'; v: string }

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '===', '!==', '<', '>', '!', '+', '-', '*', '/', '(', ')'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ k: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (j >= src.length) throw new Error('Kapanmamış metin');
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ k: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPS.filter((o) => src.startsWith(o, i)).sort((a, b) => b.length - a.length)[0];
    if (!op) throw new Error(`Beklenmeyen karakter: ${c}`);
    out.push({ k: 'op', v: op === '===' ? '==' : op === '!==' ? '!=' : op });
    i += op.length;
  }
  out.push({ k: 'end', v: '' });
  return out;
}

const PREC: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };

export function parseExpression(src: string): Node {
  let s = src.trim();
  const m = /^\$\{([\s\S]*)\}$/.exec(s);
  if (m) s = m[1];
  if (!s.trim()) throw new Error('Boş ifade');
  const toks = tokenize(s);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];

  const primary = (): Node => {
    const t = next();
    if (t.k === 'num') {
      const v = Number(t.v);
      if (Number.isNaN(v)) throw new Error(`Geçersiz sayı: ${t.v}`);
      return { t: 'lit', v };
    }
    if (t.k === 'str') return { t: 'lit', v: t.v };
    if (t.k === 'id') {
      if (t.v === 'true') return { t: 'lit', v: true };
      if (t.v === 'false') return { t: 'lit', v: false };
      if (t.v === 'null') return { t: 'lit', v: null };
      if (t.v.endsWith('.') || t.v.includes('..')) throw new Error(`Geçersiz değişken: ${t.v}`);
      return { t: 'var', path: t.v };
    }
    if (t.k === 'op' && t.v === '(') {
      const e = binary(0);
      if (next().v !== ')') throw new Error('Kapanmamış parantez');
      return e;
    }
    if (t.k === 'op' && t.v === '!') return { t: 'not', e: primary() };
    if (t.k === 'op' && t.v === '-') return { t: 'neg', e: primary() };
    throw new Error(t.k === 'end' ? 'İfade eksik' : `Beklenmeyen: ${t.v}`);
  };

  const binary = (minPrec: number): Node => {
    let left = primary();
    for (;;) {
      const t = peek();
      const prec = t.k === 'op' ? PREC[t.v] : undefined;
      if (prec === undefined || prec < minPrec) break;
      next();
      const right = binary(prec + 1);
      left = { t: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  };

  const ast = binary(0);
  if (peek().k !== 'end') throw new Error(`Fazla ifade: ${peek().v}`);
  return ast;
}

/** İfadede geçen değişken yolları (settings.* değerlerini önceden yüklemek için). */
export function collectVars(n: Node, out = new Set<string>()): Set<string> {
  if (n.t === 'var') out.add(n.path);
  else if (n.t === 'not' || n.t === 'neg') collectVars(n.e, out);
  else if (n.t === 'bin') { collectVars(n.l, out); collectVars(n.r, out); }
  return out;
}

function lookup(ctx: Record<string, unknown>, path: string): unknown {
  // Tam anahtar önce (ör. "settings.expense.autoApproveLimit" düz anahtar olarak verilmiş olabilir)
  if (Object.prototype.hasOwnProperty.call(ctx, path)) return ctx[path];
  let cur: unknown = ctx;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : NaN);

export function evaluate(n: Node, ctx: Record<string, unknown>): unknown {
  switch (n.t) {
    case 'lit': return n.v;
    case 'var': return lookup(ctx, n.path);
    case 'not': return !evaluate(n.e, ctx);
    case 'neg': return -num(evaluate(n.e, ctx));
    case 'bin': {
      if (n.op === '&&') return !!evaluate(n.l, ctx) && !!evaluate(n.r, ctx);
      if (n.op === '||') return !!evaluate(n.l, ctx) || !!evaluate(n.r, ctx);
      const a = evaluate(n.l, ctx);
      const b = evaluate(n.r, ctx);
      switch (n.op) {
        case '==': return a == null || b == null ? a === b : typeof a === 'number' || typeof b === 'number' ? num(a) === num(b) : String(a) === String(b);
        case '!=': return !(a == null || b == null ? a === b : typeof a === 'number' || typeof b === 'number' ? num(a) === num(b) : String(a) === String(b));
        case '<': return num(a) < num(b);
        case '<=': return num(a) <= num(b);
        case '>': return num(a) > num(b);
        case '>=': return num(a) >= num(b);
        case '+': return typeof a === 'string' || typeof b === 'string' ? `${a ?? ''}${b ?? ''}` : num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': return num(a) / num(b);
      }
    }
  }
  throw new Error('Geçersiz ifade');
}
