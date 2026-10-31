// Faz 2: Netsis önbelleği tipleri (API /erp/*)

export type OrderStatus = 'open' | 'partial' | 'shipped' | 'closed';

export interface CustomerLookup { code: string; name: string; city: string | null }

export interface Customer {
  code: string;
  name: string;
  type: string | null;
  taxOffice: string | null;
  taxNo: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  repCode: string | null;
  debit: number;
  credit: number;
  balance: number;
  syncedAt: string;
}

export interface AccountTx {
  id: number;
  date: string;
  dueDate: string | null;
  docNo: string | null;
  description: string | null;
  txType: string | null;
  debit: number;
  credit: number;
  balance: number;
  /** Netsis'te e-Fatura / e-Arşiv XML'i var (önizlenebilir) */
  eDoc?: boolean;
}

interface DocBase {
  id: number;
  docNo: string;
  customerCode: string;
  customerName: string | null;
  date: string;
  description: string | null;
  gross: number;
  vat: number;
  total: number;
  currency: string;
  repCode: string | null;
}

export interface Order extends DocBase {
  kind: 'sales' | 'purchase';
  dueDate: string | null;
  status: OrderStatus;
  totalQty: number;
  shippedQty: number;
}

export interface Quote extends DocBase { status: 'open' | 'closed' }

export interface DocItem {
  id: number;
  lineNo: number;
  stockCode: string;
  stockName: string | null;
  unit: string | null;
  qty: number;
  shippedQty?: number;
  unitPrice: number;
  vatRate: number;
}

export interface Shipment {
  id: number;
  docType: 'invoice' | 'waybill';
  docNo: string;
  customerCode: string;
  customerName: string | null;
  date: string;
  orderNos: string | null;
  total: number;
  repCode: string | null;
}

export interface OrderDetail extends Order { items: DocItem[]; shipments: Shipment[]; tasks: { id: number; title: string }[] }
export interface QuoteDetail extends Quote { items: DocItem[]; tasks: { id: number; title: string }[] }

export interface CustomerDetail extends Customer {
  opening: number;
  statement: AccountTx[];
  orders: Order[];
  quotes: Quote[];
}

export interface SyncRun { id: number; entity: string; trigger: string; startedAt: string; finishedAt: string | null; status: 'running' | 'ok' | 'failed'; rows: number; error: string | null }

export interface ErpStatus {
  configured: boolean;
  connection: { server: string; port: number; database: string; user: string } | null;
  intervalMinutes: number;
  windowDays: number;
  running: boolean;
  lastSync: Record<string, string | null>;
  counts: { customers: number; orders: number; quotes: number; shipments: number; accountTx: number };
  runs: SyncRun[];
}

export interface ErpSummary {
  openOrders: { count: number; total: number };
  monthOrders: { count: number; total: number };
  monthShipments: number;
  openQuotes: { count: number; total: number };
  receivables: number;
  topCustomers: { code: string; name: string; balance: number }[];
  overdueTotal: number;
  overdue: { code: string; name: string; amount: number }[];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { open: 'Açık', partial: 'Kısmi sevk', shipped: 'Sevk edildi', closed: 'Kapandı' };
export const QUOTE_STATUS_LABEL: Record<Quote['status'], string> = { open: 'Açık', closed: 'Kapandı' };
export const SHIP_TYPE_LABEL: Record<Shipment['docType'], string> = { invoice: 'Fatura', waybill: 'İrsaliye' };
export const ENTITY_LABEL: Record<string, string> = { customers: 'Cariler', account_tx: 'Cari hareketler', orders: 'Siparişler', quotes: 'Teklifler', shipments: 'Sevkiyatlar' };

const tl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number | null | undefined) => (n == null ? '—' : `${tl.format(n)} ₺`);
export const qty = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
export const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('tr-TR') : '—');
