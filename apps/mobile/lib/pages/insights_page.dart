import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/live.dart';
import '../core/theme.dart';
import '../models/insights.dart';
import '../widgets/glass.dart';
import 'insights/cards_a.dart';
import 'insights/cards_b.dart';
import 'insights/insights_ui.dart';
import 'orders/erp_ui.dart';

const _scopeLabel = {'all': '', 'department': ' · departmanım', 'own': ' · yalnızca benim görevlerim'};

/// Görev analizi (web InsightsPage). Grafikler CustomPainter ile çizilir.
class InsightsPage extends StatefulWidget {
  const InsightsPage({super.key});
  @override
  State<InsightsPage> createState() => _InsightsPageState();
}

class _InsightsPageState extends State<InsightsPage> {
  int days = 30;

  /// Mobilde dosya kaydetme paketi yok: CSV (Excel için ; ayraçlı) panoya kopyalanır.
  void _copyCsv(TaskReport r) {
    final lines = [
      ['Tarih', 'Tamamlanan', 'Açılan', 'Önceki dönem tamamlanan'],
      ...r.daily.map((d) => [d.date, d.completed, d.created, d.prevCompleted]),
    ];
    Clipboard.setData(ClipboardData(text: lines.map((l) => l.join(';')).join('\r\n')));
    showToast(context, 'CSV panoya kopyalandı');
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    return ApiView<TaskReport>(
      path: '/reports/tasks?days=$days',
      decode: (j) => TaskReport.fromJson(Map<String, dynamic>.from(j as Map)),
      builder: (c, r, reload) => RefreshIndicator(
        onRefresh: reload,
        child: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
          PageHead(title: 'Analiz', sub: 'Ekibin son $days günde nasıl çalıştığı${_scopeLabel[r.scope] ?? ''}'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              Expanded(
                child: Seg<int>(items: [for (final d in const [7, 30, 90]) (d, '${d}G', null)], value: days, onChanged: (v) => setState(() => days = v)),
              ),
              const SizedBox(width: 10),
              PillButton(label: 'CSV kopyala', icon: Icons.download, onPressed: () => _copyCsv(r)),
            ]),
          ),
          const SizedBox(height: 12),
          StatRow([
            _stat('Tamamlanan', nf(r.current.completed), delta: Delta(cur: r.current.completed.toDouble(), prev: r.previous.completed.toDouble())),
            _stat('Zamanında', r.current.onTimeRate == null ? '–' : '${nf(r.current.onTimeRate!)}%', delta: Delta(cur: r.current.onTimeRate, prev: r.previous.onTimeRate, diff: true, unit: ' puan')),
            _stat('Açık iş', nf(r.open), extra: r.overdue > 0 ? Text('${nf(r.overdue)} geciken', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: t.down)) : null),
            _stat('Ort. tamamlanma', r.current.avgCycleDays == null ? '–' : '${nf(r.current.avgCycleDays!)}g', delta: Delta(cur: r.current.avgCycleDays, prev: r.previous.avgCycleDays, diff: true, unit: 'g', lowerIsBetter: true)),
          ]),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(children: [
              ThroughputCard(r),
              ByProjectCard(r),
              NewWorkCard(r),
              WorkloadCard(r),
              OnTimeCard(r),
              if (r.erp.open > 0 || r.erp.autoClosed + r.erp.manualClosed > 0) ErpTasksCard(r),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _stat(String label, String value, {Widget? delta, Widget? extra}) => Builder(builder: (c) {
        final t = c.tk;
        return Glass(
          radius: 18, padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 12.5, color: t.text2)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: t.text)),
            ?delta,
            ?extra,
          ]),
        );
      });
}
