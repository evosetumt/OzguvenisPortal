import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'realtime.dart';

/// Adresin ilk parçası → sunucunun "data:changed" konuları (web lib/data.ts → LIVE ile aynı).
const _live = <String, List<String>>{
  'tasks': ['tasks'], 'task-statuses': ['tasks'], 'projects': ['tasks'],
  'meetings': ['meetings', 'tasks'],
  'calendar': ['calendar', 'meetings', 'tasks'],
  'reports': ['tasks', 'payments', 'expenses', 'process', 'calendar', 'meetings', 'tracking'],
  'team': ['users', 'tasks', 'meetings'],
  'users': ['users'], 'departments': ['users'], 'roles': ['users'], 'permissions': ['users'],
  'erp': ['erp'],
  'expenses': ['expenses', 'process'], 'expense-categories': ['expenses'], 'expense-settings': ['settings'],
  'payments': ['payments', 'tasks', 'settings'],
  'process-tasks': ['process', 'expenses'], 'process-instances': ['process', 'expenses'], 'process-definitions': ['process'],
  'tracking': ['tracking'],
  'whatsapp': ['whatsapp', 'users', 'settings'],
  'notifications': ['settings'],
};
List<String> topicsFor(String path) => _live[path.replaceFirst(RegExp(r'^/'), '').split(RegExp(r'[/?]')).first] ?? const [];

/// Web'deki useApi kancası: yükle, hata göster, elle yenile; başka yerde değişen veriyi kendiliğinden tazeler.
/// path null ise yüklenmez. T'yi decode ile üretir (varsayılan: ham JSON).
class ApiData<T> extends ChangeNotifier {
  ApiData(this._path, {T Function(dynamic json)? decode, this.live = true}) : _decode = decode ?? ((j) => j as T) {
    if (_path != null) reload();
    if (live && _path != null) _hook();
  }

  String? _path;
  final T Function(dynamic) _decode;
  final bool live;
  T? data;
  String error = '';
  bool loading = false;
  Timer? _debounce;
  void Function(dynamic)? _fn;
  bool _disposed = false;

  Future<void> reload({bool silent = false}) async {
    final p = _path;
    if (p == null) return;
    if (!silent) { loading = true; notifyListeners(); }
    try {
      final next = _decode(await Api.i.get(p));
      if (_disposed) return;
      data = next;
      error = '';
    } catch (e) {
      if (!silent) error = e is ApiError ? e.message : 'Yüklenemedi';
    }
    if (_disposed) return;
    loading = false;
    notifyListeners();
  }

  /// Yolu değiştirir (filtre) ve yeniden yükler.
  void setPath(String? p) {
    if (p == _path) return;
    _path = p;
    reload();
  }

  void _hook() {
    final topics = topicsFor(_path!);
    if (topics.isEmpty) return;
    _fn = (e) {
      final t = e is Map ? (e['topics'] as List?)?.cast<String>() : null;
      if (t == null || !t.any(topics.contains)) return;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 250), () => reload(silent: true));
    };
    Realtime.socket.on('data:changed', _fn!);
  }

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    if (_fn != null) Realtime.socket.off('data:changed', _fn);
    super.dispose();
  }
}

/// ApiData'yı dinleyen yardımcı widget: yükleniyor / hata / veri durumlarını çizer.
class ApiView<T> extends StatefulWidget {
  const ApiView({super.key, required this.path, required this.builder, this.decode, this.empty});
  final String? path;
  final T Function(dynamic json)? decode;
  final Widget Function(BuildContext, T data, Future<void> Function() reload) builder;
  final Widget? empty;
  @override
  State<ApiView<T>> createState() => _ApiViewState<T>();
}

class _ApiViewState<T> extends State<ApiView<T>> {
  late ApiData<T> d;
  @override
  void initState() {
    super.initState();
    d = ApiData<T>(widget.path, decode: widget.decode);
  }

  @override
  void didUpdateWidget(ApiView<T> old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path) d.setPath(widget.path);
  }

  @override
  void dispose() { d.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: d,
        builder: (c, _) {
          if (d.data == null) {
            if (d.error.isNotEmpty) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(d.error, textAlign: TextAlign.center)));
            return const Center(child: CircularProgressIndicator());
          }
          return widget.builder(c, d.data as T, () => d.reload());
        },
      );
}
