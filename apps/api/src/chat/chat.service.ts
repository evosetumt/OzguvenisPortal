import { Prisma } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttachmentsService } from '../attachments/attachments.service';
import type { AuthUser } from '../auth/auth.guard';
import { scopeOf } from '../common/scope';
import { RealtimeGateway } from './realtime.gateway';
import { GroupDto, MAX_MESSAGE, SendMessageDto } from './chat.dto';

const userSel = { select: { id: true, fullName: true, avatarUrl: true } } as const;
const attachmentSel = { select: { id: true, fileName: true, mime: true, size: true } } as const;
const messageInclude = { sender: userSel, attachment: attachmentSel } as const;

type MessageRow = {
  id: number; conversationId: number; senderId: number; body: string; createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
  sender: { id: number; fullName: string; avatarUrl: string | null };
  attachment: { id: number; fileName: string; mime: string; size: number } | null;
};

/** Silinen mesajın içeriği istemciye gönderilmez. */
const present = (m: MessageRow) => (m.deletedAt ? { ...m, body: '', attachment: null } : m);

const directKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const excerpt = (s: string) => (s.length > 120 ? s.slice(0, 117) + '…' : s);

@Injectable()
export class ChatService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly attachments: AttachmentsService,
    private readonly rt: RealtimeGateway,
  ) {}

  onModuleInit() {
    // Mesaj bildirimi yalnızca push kanalından ve yalnızca o an portala bakmayan alıcılara gider
    // (ekranda açıkken mesaj zaten anında görünür; sekme arka planda / telefon cepteyse bildirim düşer).
    this.notifications.registerRule('message.received', {
      label: 'Yeni mesaj',
      defaultChannels: ['push'],
      rule: ({ payload: p }) => ({
        userIds: (p.recipientIds as number[]).filter((id) => !this.rt.isActive(id)),
        n: { type: 'message.received', title: p.title, body: p.excerpt, link: `/messages?c=${p.conversationId}`, delivery: { tag: `chat-${p.conversationId}` } },
      }),
    });
    // Mesaja eklenen dosyayı sohbetin üyeleri görebilir.
    this.attachments.registerAccessCheck(async (u, attachmentId) =>
      (await this.prisma.message.count({
        where: { attachmentId, deletedAt: null, conversation: { members: { some: { userId: u.id } } } },
      })) > 0,
    );
    // Sohbet arşivi yetkilisi silinmiş mesajlardakiler dahil tüm sohbet dosyalarını açabilir.
    this.attachments.registerAccessCheck(async (u, attachmentId) =>
      !!scopeOf(u, 'chat.audit') && (await this.prisma.message.count({ where: { attachmentId } })) > 0,
    );
  }

  /** Üye değilse kayıt yokmuş gibi davranır (404). */
  private async membership(u: AuthUser, conversationId: number) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, members: { some: { userId: u.id } } },
      include: { members: { select: { userId: true, lastReadMessageId: true } } },
    });
    if (!conv) throw new NotFoundException('Sohbet bulunamadı');
    return conv;
  }

  private async summary(u: AuthUser, conversationId: number) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        members: { include: { user: userSel }, orderBy: { joinedAt: 'asc' } },
        messages: { orderBy: { id: 'desc' }, take: 1, include: messageInclude },
      },
    });
    const me = conv.members.find((m) => m.userId === u.id);
    const unread = me
      ? await this.prisma.message.count({
        where: { conversationId, deletedAt: null, senderId: { not: u.id }, id: { gt: me.lastReadMessageId ?? 0 } },
      })
      : 0;
    const { messages, members, ...rest } = conv;
    return {
      ...rest,
      members: members.map((m) => ({ ...m.user, lastReadMessageId: m.lastReadMessageId })),
      lastMessage: messages[0] ? present(messages[0]) : null,
      unread,
    };
  }

  async list(u: AuthUser) {
    const convs = await this.prisma.conversation.findMany({
      where: { members: { some: { userId: u.id } } },
      select: { id: true },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(convs.map((c) => this.summary(u, c.id)));
  }

  async get(u: AuthUser, id: number) {
    await this.membership(u, id);
    return this.summary(u, id);
  }

  async unreadTotal(u: AuthUser) {
    const members = await this.prisma.conversationMember.findMany({ where: { userId: u.id } });
    let total = 0;
    for (const m of members) {
      total += await this.prisma.message.count({
        where: { conversationId: m.conversationId, deletedAt: null, senderId: { not: u.id }, id: { gt: m.lastReadMessageId ?? 0 } },
      });
    }
    return { unread: total };
  }

  private async activeUsers(ids: number[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null, status: 'active' }, select: { id: true } });
    if (users.length !== new Set(ids).size) throw new BadRequestException('Geçersiz kullanıcı');
  }

  /** Birebir sohbeti bulur, yoksa oluşturur (kullanıcı çifti başına tek sohbet). */
  async direct(u: AuthUser, otherId: number) {
    if (otherId === u.id) throw new BadRequestException('Kendinizle sohbet başlatamazsınız');
    await this.activeUsers([otherId]);
    const key = directKey(u.id, otherId);
    const existing = await this.prisma.conversation.findFirst({ where: { type: 'direct', directKey: key } });
    if (existing) return this.summary(u, existing.id);
    const conv = await this.prisma.conversation.create({
      data: {
        type: 'direct', directKey: key, createdById: u.id,
        members: { create: [{ userId: u.id }, { userId: otherId }] },
      },
    });
    return this.summary(u, conv.id);
  }

  async createGroup(u: AuthUser, dto: GroupDto) {
    const ids = [...new Set([u.id, ...dto.memberIds])];
    await this.activeUsers(ids);
    const conv = await this.prisma.conversation.create({
      data: {
        type: 'group', title: dto.title.trim(), createdById: u.id,
        members: { create: ids.map((userId) => ({ userId })) },
      },
    });
    await this.audit.log(u.id, 'chat.group_create', 'conversation', conv.id, { title: dto.title, memberIds: ids });
    const s = await this.summary(u, conv.id);
    this.rt.toUsers(ids, 'conversation:updated', { conversationId: conv.id });
    return s;
  }

  private async ownGroup(u: AuthUser, id: number) {
    const conv = await this.membership(u, id);
    if (conv.type !== 'group') throw new BadRequestException('Birebir sohbet düzenlenemez');
    if (conv.createdById !== u.id) throw new ForbiddenException('Yalnızca grubu oluşturan düzenleyebilir');
    return conv;
  }

  async renameGroup(u: AuthUser, id: number, title: string) {
    const conv = await this.ownGroup(u, id);
    await this.prisma.conversation.update({ where: { id }, data: { title: title.trim() } });
    await this.audit.log(u.id, 'chat.group_rename', 'conversation', id, { title });
    this.rt.toUsers(conv.members.map((m) => m.userId), 'conversation:updated', { conversationId: id });
    return this.summary(u, id);
  }

  async addMembers(u: AuthUser, id: number, userIds: number[]) {
    const conv = await this.ownGroup(u, id);
    const existing = new Set(conv.members.map((m) => m.userId));
    const add = [...new Set(userIds)].filter((x) => !existing.has(x));
    if (add.length) {
      await this.activeUsers(add);
      // Yeni üye eski mesajları okunmuş sayılır.
      const last = await this.prisma.message.findFirst({ where: { conversationId: id }, orderBy: { id: 'desc' }, select: { id: true } });
      await this.prisma.conversationMember.createMany({ data: add.map((userId) => ({ conversationId: id, userId, lastReadMessageId: last?.id ?? null })) });
      await this.audit.log(u.id, 'chat.member_add', 'conversation', id, { userIds: add });
    }
    this.rt.toUsers([...existing, ...add], 'conversation:updated', { conversationId: id });
    return this.summary(u, id);
  }

  /** Grubu oluşturan üye çıkarabilir; herkes kendisi ayrılabilir. */
  async removeMember(u: AuthUser, id: number, userId: number) {
    const conv = await this.membership(u, id);
    if (conv.type !== 'group') throw new BadRequestException('Birebir sohbetten ayrılınamaz');
    if (userId !== u.id && conv.createdById !== u.id) throw new ForbiddenException('Yalnızca grubu oluşturan üye çıkarabilir');
    if (!conv.members.some((m) => m.userId === userId)) throw new NotFoundException('Üye bulunamadı');
    await this.prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId: id, userId } } });
    await this.audit.log(u.id, 'chat.member_remove', 'conversation', id, { userId });
    this.rt.toUsers(conv.members.map((m) => m.userId), 'conversation:updated', { conversationId: id, removedUserId: userId });
  }

  /** Mesajlar en yeniden eskiye; `before` imleciyle daha eskileri yüklenir. */
  async messages(u: AuthUser, id: number, before?: number, take = 40) {
    await this.membership(u, id);
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(take, 1), 100),
      include: messageInclude,
    });
    return rows.map(present);
  }

  async send(u: AuthUser, id: number, dto: SendMessageDto) {
    const conv = await this.membership(u, id);
    const body = (dto.body ?? '').trim();
    if (!body && !dto.attachmentId) throw new BadRequestException('Mesaj boş olamaz');
    if (body.length > MAX_MESSAGE) throw new BadRequestException(`Mesaj en fazla ${MAX_MESSAGE} karakter olabilir`);
    if (dto.attachmentId) {
      const a = await this.prisma.attachment.findFirst({ where: { id: dto.attachmentId, uploadedById: u.id } });
      if (!a) throw new BadRequestException('Dosya bulunamadı');
    }
    const msg = await this.prisma.message.create({
      data: { conversationId: id, senderId: u.id, body, attachmentId: dto.attachmentId },
      include: messageInclude,
    });
    await this.prisma.$transaction([
      this.prisma.conversation.update({ where: { id }, data: { lastMessageAt: msg.createdAt } }),
      this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId: u.id } }, data: { lastReadMessageId: msg.id } }),
    ]);
    const memberIds = conv.members.map((m) => m.userId);
    this.rt.toUsers(memberIds, 'message:new', msg);

    const sender = msg.sender.fullName;
    this.events.emit('message.received', u.id, {
      conversationId: id,
      recipientIds: memberIds.filter((x) => x !== u.id),
      title: conv.type === 'group' ? `${sender} · ${conv.title ?? 'Grup'}` : sender,
      excerpt: body ? excerpt(body) : '📎 Dosya',
    });
    return msg;
  }

  private async ownMessage(u: AuthUser, messageId: number) {
    const m = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId: u.id } } } },
      include: { conversation: { include: { members: { select: { userId: true } } } } },
    });
    if (!m) throw new NotFoundException('Mesaj bulunamadı');
    if (m.senderId !== u.id) throw new ForbiddenException('Yalnızca kendi mesajınızı değiştirebilirsiniz');
    if (m.deletedAt) throw new BadRequestException('Mesaj silinmiş');
    return m;
  }

  async edit(u: AuthUser, messageId: number, body: string) {
    const m = await this.ownMessage(u, messageId);
    // Önceki metin saklanır; yönetici arşivde düzenleme geçmişini görür.
    const [, updated] = await this.prisma.$transaction([
      this.prisma.messageRevision.create({ data: { messageId, body: m.body, editedById: u.id } }),
      this.prisma.message.update({ where: { id: messageId }, data: { body: body.trim(), editedAt: new Date() }, include: messageInclude }),
    ]);
    await this.audit.log(u.id, 'chat.message_edit', 'message', messageId);
    this.rt.toUsers(m.conversation.members.map((x) => x.userId), 'message:updated', updated);
    return updated;
  }

  async remove(u: AuthUser, messageId: number) {
    const m = await this.ownMessage(u, messageId);
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include: messageInclude });
    await this.audit.log(u.id, 'chat.message_delete', 'message', messageId);
    this.rt.toUsers(m.conversation.members.map((x) => x.userId), 'message:updated', present(updated));
  }

  /** Okundu imleci yalnızca ileri gider; messageId verilmezse son mesaja kadar okundu sayılır. */
  async markRead(u: AuthUser, id: number, messageId?: number) {
    const conv = await this.membership(u, id);
    const last = await this.prisma.message.findFirst({
      where: { conversationId: id, ...(messageId ? { id: { lte: messageId } } : {}) },
      orderBy: { id: 'desc' }, select: { id: true },
    });
    const me = conv.members.find((m) => m.userId === u.id)!;
    if (!last || (me.lastReadMessageId ?? 0) >= last.id) return { lastReadMessageId: me.lastReadMessageId };
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: u.id } }, data: { lastReadMessageId: last.id },
    });
    this.rt.toUsers(conv.members.map((m) => m.userId), 'read', { conversationId: id, userId: u.id, messageId: last.id });
    return { lastReadMessageId: last.id };
  }

  // --- Sohbet arşivi (chat.audit): tüm sohbetler, silinen mesajların içeriği, düzenleme geçmişi, geri getirme ---

  /** Tüm sohbetler; userId verilirse o kişinin üye olduğu (veya mesaj yazdığı) sohbetler. */
  async archiveList(q?: string, userId?: number) {
    const and: Prisma.ConversationWhereInput[] = [];
    // Gruptan çıkarılan kişinin eski sohbetleri de bulunsun diye mesaj yazdığı sohbetler de dahil.
    if (userId) and.push({ OR: [{ members: { some: { userId } } }, { messages: { some: { senderId: userId } } }] });
    const text = q?.trim();
    if (text) and.push({ OR: [{ title: { contains: text } }, { members: { some: { user: { fullName: { contains: text } } } } }] });
    const where: Prisma.ConversationWhereInput = { AND: and };
    const rows = await this.prisma.conversation.findMany({
      where,
      include: {
        members: { include: { user: userSel } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const deleted = await this.prisma.message.groupBy({
      by: ['conversationId'], where: { conversationId: { in: rows.map((r) => r.id) }, deletedAt: { not: null } }, _count: true,
    });
    const delBy = new Map(deleted.map((d) => [d.conversationId, d._count]));
    return rows.map(({ members, _count, ...c }) => ({
      ...c, members: members.map((m) => m.user), messageCount: _count.messages, deletedCount: delBy.get(c.id) ?? 0,
    }));
  }

  /** Arşiv görünümü: silinenler dahil tüm mesajlar, içerik ve düzenleme geçmişiyle. */
  async archiveMessages(id: number, before?: number, take = 50) {
    const conv = await this.prisma.conversation.findUnique({ where: { id }, include: { members: { include: { user: userSel } } } });
    if (!conv) throw new NotFoundException('Sohbet bulunamadı');
    const messages = await this.prisma.message.findMany({
      where: { conversationId: id, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      include: { ...messageInclude, revisions: { orderBy: { id: 'asc' }, select: { id: true, body: true, createdAt: true } } },
    });
    return { conversation: { ...conv, members: conv.members.map((m) => m.user) }, messages };
  }

  /** Silinen mesajı geri getirir; sohbet üyelerinde de yeniden görünür. */
  async restore(u: AuthUser, messageId: number) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: { include: { members: { select: { userId: true } } } } } });
    if (!m) throw new NotFoundException('Mesaj bulunamadı');
    if (!m.deletedAt) throw new BadRequestException('Mesaj silinmemiş');
    const updated = await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: null }, include: messageInclude });
    await this.audit.log(u.id, 'chat.message_restore', 'message', messageId, { deletedAt: m.deletedAt });
    this.rt.toUsers(m.conversation.members.map((x) => x.userId), 'message:updated', updated);
    return updated;
  }

  /** Arama bitince sohbete özet mesajı ("📞 Sesli arama · 3 dk", "Cevapsız arama"); bildirim gönderilmez. */
  async postCallMessage(conversationId: number, senderId: number, body: string, callId: number) {
    const msg = await this.prisma.message.create({ data: { conversationId, senderId, body, callId }, include: messageInclude });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: msg.createdAt } });
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } });
    this.rt.toUsers(members.map((m) => m.userId), 'message:new', msg);
    return msg;
  }

  /** Toplantı ve arama modülleri için: sohbet üyelerini döner (üyelik denetimiyle). */
  async memberIds(u: AuthUser, id: number) {
    const conv = await this.membership(u, id);
    return { conv, ids: conv.members.map((m) => m.userId) };
  }
}
