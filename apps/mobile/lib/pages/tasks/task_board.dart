import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../widgets/glass.dart';
import 'task_views.dart';

/// Web pano görünümü (.tk-board): durum kolonları yatay kayar; kartlar uzun basılıp kolonlar arası sürüklenir.
class TaskBoard extends StatefulWidget {
  const TaskBoard({super.key, required this.columns, required this.canWrite, required this.height, required this.onOpen, required this.onAdd, required this.onMove});
  final List<(TaskStatus, List<Task>)> columns;
  final bool canWrite;
  final double height;
  final void Function(int id) onOpen;
  final void Function(int statusId) onAdd;
  /// Kartı hedef kolonun [index]. sırasına taşı (iyimser güncelleme + sunucu çağrısı sayfada).
  final void Function(Task t, TaskStatus to, int index) onMove;
  @override
  State<TaskBoard> createState() => _TaskBoardState();
}

class _TaskBoardState extends State<TaskBoard> {
  int? dragId, overCol;
  final _keys = <int, GlobalKey>{};
  GlobalKey _key(int id) => _keys.putIfAbsent(id, GlobalKey.new);

  /// Bırakma konumuna göre hedef sıra: bırakılan nokta bir kartın orta çizgisinin üstündeyse onun önüne girer.
  int _indexFor(List<Task> col, double dropY) {
    for (var i = 0; i < col.length; i++) {
      final box = _key(col[i].id).currentContext?.findRenderObject() as RenderBox?;
      if (box == null || !box.attached) continue;
      final mid = box.localToGlobal(Offset(0, box.size.height / 2)).dy;
      if (dropY < mid) return i;
    }
    return col.length;
  }

  @override
  Widget build(BuildContext context) {
    final k = context.tk;
    final all = [for (final c in widget.columns) ...c.$2];
    return SizedBox(
      height: widget.height,
      child: ListView.separated(
        scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 14),
        itemCount: widget.columns.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, ci) {
          final (status, tasks) = widget.columns[ci];
          return DragTarget<int>(
            onWillAcceptWithDetails: (_) => widget.canWrite,
            onMove: (_) { if (overCol != status.id) setState(() => overCol = status.id); },
            onLeave: (_) { if (overCol == status.id) setState(() => overCol = null); },
            onAcceptWithDetails: (d) {
              setState(() { overCol = null; dragId = null; });
              final moved = all.where((t) => t.id == d.data).firstOrNull;
              if (moved == null) return;
              final col = tasks.where((t) => t.id != d.data).toList();
              widget.onMove(moved, status, _indexFor(col, d.offset.dy + 36));
            },
            builder: (context, _, _) => SizedBox(
              width: 296,
              child: Glass(
                radius: 22, padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                child: Container(
                  decoration: overCol == status.id ? BoxDecoration(borderRadius: BorderRadius.circular(14), color: k.accentSoft) : null,
                  child: Column(children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(6, 2, 0, 8),
                      child: Row(children: [
                        StatusDot(status: status, index: ci),
                        const SizedBox(width: 9),
                        Expanded(child: Text(status.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: k.text))),
                        Text('${tasks.length}', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: k.text2)),
                        if (widget.canWrite) IconButton(tooltip: 'Bu kolona ekle', visualDensity: VisualDensity.compact, icon: const Icon(LucideIcons.plus, size: 17), onPressed: () => widget.onAdd(status.id)),
                      ]),
                    ),
                    Expanded(
                      child: tasks.isEmpty
                          ? Center(child: Text(dragId != null ? 'Buraya bırakın' : 'Görev yok', style: TextStyle(color: k.text3, fontSize: 14)))
                          : ListView.separated(
                              padding: const EdgeInsets.only(bottom: 100),
                              itemCount: tasks.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 10),
                              itemBuilder: (context, i) {
                                final t = tasks[i];
                                final card = TaskCard(key: _key(t.id), t: t, onOpen: () => widget.onOpen(t.id), dim: dragId == t.id);
                                if (!widget.canWrite) return card;
                                return LongPressDraggable<int>(
                                  data: t.id,
                                  onDragStarted: () => setState(() => dragId = t.id),
                                  onDragEnd: (_) => setState(() { dragId = null; overCol = null; }),
                                  feedback: Material(color: Colors.transparent, child: SizedBox(width: 276, child: Opacity(opacity: .92, child: TaskCard(t: t, onOpen: () {})))),
                                  child: card,
                                );
                              },
                            ),
                    ),
                  ]),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
