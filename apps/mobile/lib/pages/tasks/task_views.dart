import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../core/theme.dart';
import '../../models/task.dart';
import '../../widgets/avatar.dart';
import '../../widgets/glass.dart';
import '../shared/format.dart';
import '../shared/ui.dart';

/// Kolon noktası: yapılacak (boş halka), devam (mavi), inceleme (mor), tamamlandı (yeşil).
class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.status, required this.index});
  final TaskStatus status;
  final int index;
  @override
  Widget build(BuildContext context) {
    final t = context.tk;
    if (status.isDone) return _dot(t.green, true);
    final kind = index.clamp(0, 2);
    if (kind == 0) {
      return Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: t.text3, width: 2)));
    }
    return _dot(kind == 1 ? t.blue : t.purple, false);
  }

  Widget _dot(Color c, bool _) => Container(
      width: 10, height: 10, decoration: BoxDecoration(color: c, shape: BoxShape.circle, boxShadow: [BoxShadow(color: c.withValues(alpha: .22), spreadRadius: 3)]));
}

/// Web TaskCard (.tk-card)
class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.t, required this.onOpen, this.dim = false});
  final Task t;
  final VoidCallback onOpen;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final k = context.tk;
    final overdue = isOverdue(t.dueDate, t.status.isDone);
    final today = isToday(t.dueDate);
    final tone = t.status.isDone ? k.green : switch (t.priority) { 'urgent' => k.prioUrgent, 'high' => k.prioHigh, 'normal' => k.prioNormal, _ => k.text3 };
    final pct = t.subtaskTotal > 0 ? t.subtaskDone / t.subtaskTotal : 0.0;
    return Opacity(
      opacity: dim ? .55 : 1,
      child: Glass(
        radius: 18, onTap: onOpen, padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(child: t.project != null ? ProjChip(name: t.project!.name, color: t.project!.color) : Text('#${t.id}', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: k.text3))),
            const Spacer(),
            if (t.priority != 'low') PrioChip(t.priority),
          ]),
          const SizedBox(height: 8),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (t.status.isDone)
              Container(
                width: 20, height: 20, margin: const EdgeInsets.only(right: 8), alignment: Alignment.center,
                decoration: BoxDecoration(color: k.green, shape: BoxShape.circle), child: const Icon(LucideIcons.check, size: 13, color: Colors.white)),
            Expanded(child: Text(t.title, maxLines: 3, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.32, letterSpacing: -.1, color: t.status.isDone ? k.text2 : k.text,
                    decoration: t.status.isDone ? TextDecoration.lineThrough : null))),
          ]),
          if (t.description != null && t.description!.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text(t.description!, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: k.text2))),
          if (t.taskType != 'general')
            Padding(padding: const EdgeInsets.only(top: 6), child: Text('${taskTypeLabel[t.taskType]}${t.customerRef != null && t.customerRef!.isNotEmpty ? ' · ${t.customerRef}' : ''}',
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: tone))),
          if (t.subtaskTotal > 0)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(children: [
                Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: pct, minHeight: 5, backgroundColor: k.fill2, color: tone))),
                const SizedBox(width: 9),
                Text('${t.subtaskDone}/${t.subtaskTotal}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: k.text2)),
              ]),
            ),
          const SizedBox(height: 10),
          Row(children: [
            if (t.dueDate != null) _pill(context, t.status.isDone ? LucideIcons.check : LucideIcons.calendarDays, formatDue(t.dueDate!), overdue ? k.danger : (today ? k.orange : null)),
            if (t.commentCount > 0) Padding(padding: const EdgeInsets.only(left: 6), child: _pill(context, LucideIcons.messageSquare, '${t.commentCount}', null)),
            const Spacer(),
            if (t.assignee != null) ...[
              Flexible(child: Text(t.assignee!.fullName.split(' ').first, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: k.text2))),
              const SizedBox(width: 7),
              Avatar(name: t.assignee!.fullName, src: t.assignee!.avatarUrl, size: 24),
            ],
          ]),
        ]),
      ),
    );
  }

  Widget _pill(BuildContext context, IconData icon, String s, Color? c) {
    final k = context.tk;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: c == null ? k.fill : c.withValues(alpha: .16), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: c ?? k.text2),
        const SizedBox(width: 4),
        Text(s, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c ?? k.text2)),
      ]),
    );
  }
}

/// Liste görünümünde bir görev satırı (.tk-row), telefon düzeninde kart satırı.
class TaskRow extends StatelessWidget {
  const TaskRow({super.key, required this.t, required this.canWrite, required this.onToggle, required this.onOpen});
  final Task t;
  final bool canWrite;
  final VoidCallback onToggle, onOpen;
  @override
  Widget build(BuildContext context) {
    final k = context.tk;
    final overdue = isOverdue(t.dueDate, t.status.isDone);
    final today = isToday(t.dueDate);
    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 6, 12, 6),
        child: Row(children: [
          Checkbox(value: t.status.isDone, shape: const CircleBorder(), onChanged: canWrite ? (_) => onToggle() : null),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text.rich(TextSpan(children: [
              TextSpan(text: t.title),
              if (t.taskType != 'general') TextSpan(text: ' · ${taskTypeLabel[t.taskType]}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w400, color: k.text2)),
            ]), maxLines: 2, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.status.isDone ? k.text2 : k.text, decoration: t.status.isDone ? TextDecoration.lineThrough : null)),
            const SizedBox(height: 4),
            Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
              if (t.project != null) ProjChip(name: t.project!.name, color: t.project!.color),
              if (t.dueDate != null)
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(LucideIcons.calendarDays, size: 14, color: overdue ? k.danger : (today ? k.orange : k.text2)),
                  const SizedBox(width: 4),
                  Text(formatDue(t.dueDate!), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: overdue ? k.danger : (today ? k.orange : k.text2))),
                ]),
              PrioChip(t.priority),
            ]),
          ])),
          if (t.assignee != null) Padding(padding: const EdgeInsets.only(left: 8), child: Avatar(name: t.assignee!.fullName, src: t.assignee!.avatarUrl, size: 26)),
        ]),
      ),
    );
  }
}
