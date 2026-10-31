import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.guard';

export type AccessCheck = (user: AuthUser, attachmentId: number) => Promise<boolean>;

/** İzin verilen dosya türleri: fiş fotoğrafı, poliçe/sözleşme PDF'i, ofis belgeleri. */
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel', 'text/plain', 'text/csv',
]);
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Dosya depolama katmanı: sunucu diski (STORAGE_DIR, varsayılan apps/api/uploads).
 * Ağ paylaşımına geçmek için yalnızca bu sınıf değişir.
 */
@Injectable()
export class AttachmentsService {
  private readonly root = resolve(process.env.STORAGE_DIR ?? join(process.cwd(), 'uploads'));
  private readonly accessChecks: AccessCheck[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Modüller dosyaya erişim kuralı ekler (masraf: sahibi/onaylayan, sohbet: üye ...).
   * Yükleyen her zaman erişir; aksi halde kurallardan biri true dönmelidir.
   */
  registerAccessCheck(check: AccessCheck) {
    this.accessChecks.push(check);
  }

  async canAccess(user: AuthUser, attachmentId: number, uploadedById: number) {
    if (uploadedById === user.id) return true;
    for (const check of this.accessChecks) {
      if (await check(user, attachmentId)) return true;
    }
    return false;
  }

  async save(userId: number, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    if (!file?.buffer) throw new BadRequestException('Dosya yok');
    if (!ALLOWED.has(file.mimetype)) throw new BadRequestException('Bu dosya türüne izin verilmiyor');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Dosya en fazla 15 MB olabilir');
    const now = new Date();
    const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ext = extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    const storageKey = `${dir}/${randomUUID()}${ext}`;
    await mkdir(join(this.root, dir), { recursive: true });
    await writeFile(join(this.root, storageKey), file.buffer);
    // Tarayıcılar dosya adını latin1 olarak iletebilir; Türkçe karakterleri düzelt.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
    return this.prisma.attachment.create({
      data: { storageKey, fileName, mime: file.mimetype, size: file.size, uploadedById: userId },
      select: { id: true, fileName: true, mime: true, size: true, createdAt: true },
    });
  }

  async get(id: number) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Dosya bulunamadı');
    return a;
  }

  stream(storageKey: string) {
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(this.root)) throw new NotFoundException();
    return createReadStream(path);
  }

  /** Hiçbir kayda bağlanmamış dosyayı siler (yalnızca yükleyen, yükledikten sonra vazgeçerse). */
  async removeOrphan(userId: number, id: number) {
    const a = await this.prisma.attachment.findFirst({
      where: { id, uploadedById: userId, expenseReceipts: { none: {} }, trackedItemFiles: { none: {} }, messages: { none: {} } },
    });
    if (!a) throw new NotFoundException('Dosya bulunamadı veya kullanımda');
    await this.prisma.attachment.delete({ where: { id } });
    await unlink(resolve(this.root, a.storageKey)).catch(() => undefined);
  }
}
