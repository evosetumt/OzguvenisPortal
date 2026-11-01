// Web lib/types-erp.ts karşılığı (API /erp/*). JSON alan adları aynen korunur.

double _d(dynamic v) => v is num ? v.toDouble() : (v is String ? double.tryParse(v) ?? 0 : 0);
double? _dn(dynamic v) => v == null ? null : _d(v);
int _i(dynamic v) => v is num ? v.toInt() : (v is String ? int.tryParse(v) ?? 0 : 0);
String? _s(dynamic v) => v?.toString();
List<T> _l<T>(dynamic v, T Function(Map<String, dynamic>) f) =>
    v is List ? v.whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList() : <T>[];

const orderStatusLabel = {'open': 'Açık', 'partial': 'Kısmi sevk', 'shipped': 'Sevk edildi', 'closed': 'Kapandı'};
const quoteStatusLabel = {'open': 'Açık', 'closed': 'Kapandı'};
const shipTypeLabel = {'invoice': 'Fatura', 'waybill': 'İrsaliye'};

class Customer {
  Customer.fromJson(Map<String, dynamic> j)
      : code = j['code']?.toString() ?? '',
        name = j['name']?.toString() ?? '',
        type = _s(j['type']),
        taxOffice = _s(j['taxOffice']),
        taxNo = _s(j['taxNo']),
        phone = _s(j['phone']),
        email = _s(j['email']),
        city = _s(j['city']),
        address = _s(j['address']),
        repCode = _s(j['repCode']),
        debit = _d(j['debit']),
        credit = _d(j['credit']),
        balance = _d(j['balance']),
        syncedAt = _s(j['syncedAt']);
  final String code, name;
  final String? type, taxOffice, taxNo, phone, email, city, address, repCode, syncedAt;
  final double debit, credit, balance;
}

class AccountTx {
  AccountTx.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        date = _s(j['date']),
        dueDate = _s(j['dueDate']),
        docNo = _s(j['docNo']),
        description = _s(j['description']),
        txType = _s(j['txType']),
        debit = _d(j['debit']),
        credit = _d(j['credit']),
        balance = _d(j['balance']),
        eDoc = j['eDoc'] == true;
  final int id;
  final String? date, dueDate, docNo, description, txType;
  final double debit, credit, balance;
  /// Netsis'te e-Fatura / e-Arşiv XML'i var (önizlenebilir)
  final bool eDoc;
}

class DocItem {
  DocItem.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        lineNo = _i(j['lineNo']),
        stockCode = j['stockCode']?.toString() ?? '',
        stockName = _s(j['stockName']),
        unit = _s(j['unit']),
        qty = _d(j['qty']),
        shippedQty = _dn(j['shippedQty']),
        unitPrice = _d(j['unitPrice']),
        vatRate = _d(j['vatRate']);
  final int id, lineNo;
  final String stockCode;
  final String? stockName, unit;
  final double qty, unitPrice, vatRate;
  final double? shippedQty;
}

/// Order / Quote ortak alanları (web DocBase).
class Order {
  Order.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        docNo = j['docNo']?.toString() ?? '',
        customerCode = j['customerCode']?.toString() ?? '',
        customerName = _s(j['customerName']),
        date = _s(j['date']),
        description = _s(j['description']),
        gross = _d(j['gross']),
        vat = _d(j['vat']),
        total = _d(j['total']),
        currency = _s(j['currency']) ?? 'TRY',
        repCode = _s(j['repCode']),
        kind = j['kind']?.toString() ?? 'sales',
        dueDate = _s(j['dueDate']),
        status = j['status']?.toString() ?? 'open',
        totalQty = _d(j['totalQty']),
        shippedQty = _d(j['shippedQty']);
  final int id;
  final String docNo, customerCode, currency, kind, status;
  final String? customerName, date, description, repCode, dueDate;
  final double gross, vat, total, totalQty, shippedQty;
}

class Quote {
  Quote.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        docNo = j['docNo']?.toString() ?? '',
        customerCode = j['customerCode']?.toString() ?? '',
        customerName = _s(j['customerName']),
        date = _s(j['date']),
        description = _s(j['description']),
        gross = _d(j['gross']),
        vat = _d(j['vat']),
        total = _d(j['total']),
        currency = _s(j['currency']) ?? 'TRY',
        repCode = _s(j['repCode']),
        status = j['status']?.toString() ?? 'open';
  final int id;
  final String docNo, customerCode, currency, status;
  final String? customerName, date, description, repCode;
  final double gross, vat, total;
}

class Shipment {
  Shipment.fromJson(Map<String, dynamic> j)
      : id = _i(j['id']),
        docType = j['docType']?.toString() ?? 'waybill',
        docNo = j['docNo']?.toString() ?? '',
        customerCode = j['customerCode']?.toString() ?? '',
        customerName = _s(j['customerName']),
        date = _s(j['date']),
        orderNos = _s(j['orderNos']),
        total = _d(j['total']),
        repCode = _s(j['repCode']);
  final int id;
  final String docType, docNo, customerCode;
  final String? customerName, date, orderNos, repCode;
  final double total;
}

class LinkedTask {
  LinkedTask.fromJson(Map<String, dynamic> j) : id = _i(j['id']), title = j['title']?.toString() ?? '';
  final int id;
  final String title;
}

class OrderDetail {
  OrderDetail.fromJson(Map<String, dynamic> j)
      : order = Order.fromJson(j),
        items = _l(j['items'], DocItem.fromJson),
        shipments = _l(j['shipments'], Shipment.fromJson),
        tasks = _l(j['tasks'], LinkedTask.fromJson);
  final Order order;
  final List<DocItem> items;
  final List<Shipment> shipments;
  final List<LinkedTask> tasks;
}

class QuoteDetail {
  QuoteDetail.fromJson(Map<String, dynamic> j)
      : quote = Quote.fromJson(j),
        items = _l(j['items'], DocItem.fromJson),
        tasks = _l(j['tasks'], LinkedTask.fromJson);
  final Quote quote;
  final List<DocItem> items;
  final List<LinkedTask> tasks;
}

class CustomerDetail {
  CustomerDetail.fromJson(Map<String, dynamic> j)
      : customer = Customer.fromJson(j),
        opening = _d(j['opening']),
        statement = _l(j['statement'], AccountTx.fromJson),
        orders = _l(j['orders'], Order.fromJson),
        quotes = _l(j['quotes'], Quote.fromJson);
  final Customer customer;
  final double opening;
  final List<AccountTx> statement;
  final List<Order> orders;
  final List<Quote> quotes;
}

class CountTotal {
  CountTotal.fromJson(dynamic j)
      : count = j is Map ? _i(j['count']) : 0,
        total = j is Map ? _d(j['total']) : 0;
  final int count;
  final double total;
}

class TopCustomer {
  TopCustomer.fromJson(Map<String, dynamic> j)
      : code = j['code']?.toString() ?? '',
        name = j['name']?.toString() ?? '',
        amount = _d(j['balance'] ?? j['amount']);
  final String code, name;
  final double amount;
}

class ErpSummary {
  ErpSummary.fromJson(Map<String, dynamic> j)
      : openOrders = CountTotal.fromJson(j['openOrders']),
        monthOrders = CountTotal.fromJson(j['monthOrders']),
        monthShipments = _i(j['monthShipments']),
        openQuotes = CountTotal.fromJson(j['openQuotes']),
        receivables = _d(j['receivables']),
        topCustomers = _l(j['topCustomers'], TopCustomer.fromJson),
        overdueTotal = _d(j['overdueTotal']),
        overdue = _l(j['overdue'], TopCustomer.fromJson);
  final CountTotal openOrders, monthOrders, openQuotes;
  final int monthShipments;
  final double receivables, overdueTotal;
  final List<TopCustomer> topCustomers, overdue;
}

class EDocument {
  EDocument.fromJson(Map<String, dynamic> j)
      : source = j['source']?.toString() ?? 'efatura',
        direction = j['direction']?.toString() ?? 'sales',
        gibNo = _s(j['gibNo']),
        uuid = _s(j['uuid']),
        date = _s(j['date']),
        docNo = j['docNo']?.toString() ?? '',
        customerName = j['customerName']?.toString() ?? '',
        xml = j['xml']?.toString() ?? '';
  final String source, direction, docNo, customerName, xml;
  final String? gibNo, uuid, date;
}
