import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const HOUR = 60 * 60 * 1000;

/**
 * Bitiş tarihine 24 saatten az kalan (veya geçmiş) açık görevler için atanana bir kez hatırlatma olayı üretir.
 * Tek sunuculu kurulum için saatlik zamanlayıcı yeterli; reminderSentAt tekrar gönderimi engeller.
 */
@Injectable()
export class TaskReminderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  onApplicationBootstrap() {
    setTimeout(() => this.run(), 15_000).unref();
    this.timer = setInterval(() => this.run(), HOUR);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async run() {
    try {
      const due = await this.prisma.task.findMany({
        where: {
          deletedAt: null,
          reminderSentAt: null,
          assigneeId: { not: null },
          dueDate: { lte: new Date(Date.now() + 24 * HOUR) },
          status: { isDone: false },
        },
        select: { id: true, title: true, assigneeId: true, dueDate: true },
        take: 500,
      });
      for (const t of due) {
        await this.prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: new Date() } });
        this.events.emit('task.due_soon', null, { taskId: t.id, title: t.title, assigneeId: t.assigneeId, dueDate: t.dueDate });
      }
    } catch (e) {
      console.error('Görev hatırlatma çalışması başarısız', e);
    }
  }
}
