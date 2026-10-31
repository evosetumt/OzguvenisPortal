import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Yazma işlemlerini audit_logs tablosuna kaydeder; hata ana işlemi bozmaz. */
  async log(userId: number, action: string, entity: string, entityId: number | string, diff?: unknown) {
    try {
      await this.prisma.auditLog.create({
        data: { userId, action, entity, entityId: String(entityId), diff: diff === undefined ? null : JSON.stringify(diff) },
      });
    } catch (e) {
      console.error('Denetim kaydı yazılamadı', e);
    }
  }
}
