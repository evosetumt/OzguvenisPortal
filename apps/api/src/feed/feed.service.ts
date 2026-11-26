import { BadRequestException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { uniqIds } from '../common/format';
import { scopeOf, type Scope } from '../common/scope';
import { TasksService } from '../tasks/tasks.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { FeedActivityDto, FeedCommentDto, FeedPostDto, POST_MAX } from './feed.dto';

const userSel = { select: { id: true, fullName: true, avatarUrl: true } } as const;
const fileSel = { select: { id: true, fileName: true, mime: true, size: true } } as const;
/** Şirket panosu paylaşımı: kapsamdan bağımsız herkes görür. */
export const WALL_KIND = 'social';
const USER_KINDS = ['post', WALL_KIND];
const PAGE_SIZE = 20;
const COMMENTS_PER_POST = 50;
/** Karttan açılan görevler Task.relatedType = 'feed_post' ile karta bağlanır. */
export const FEED_TASK_RELATION = 'feed_post';

/** Kartın ilgili kaydının portal adresi (bildirimlerdeki bağlantılarla aynı biçim: erp-sync.service.ts → NOTIFY). */
function relatedLink(type: string | null, id: string | null, label: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case 'task': return `/tasks?id=${id}`;
    case 'order': return `/orders?order=${id}`;
    case 'quote': return `/orders?tab=quotes&quote=${id}`;
    case 'shipment': return label ? `/orders?tab=shipments&q=${encodeURIComponent(label)}` : '/orders?tab=shipments';
    default: return null;
  }
}

export interface FeedListQuery {
  before?: number; userId?: number; customerCode?: string; wall?: boolean;
  /** Metin araması: kart metni, firma adı/kodu, ilgili kayıt adı veya yazar adı */
  q?: string;
  /** Tarih aralığı (dahil); to günün sonuna kadar */
  from?: Date; to?: Date;
}

/** Görev kartında gösterilen güncel görev bilgisi (başlık, içerik, sorumlu, durum, alt görevler). */
export interface FeedTaskInfo {
  id: number; title: string; description: string | null; assignee: string | null; assigneeId: number | null;
  status: string; done: boolean; dueDate: Date | null; subtasks: { id: number; title: string; done: boolean }[];
}

/**
 * Haber akışı. Görünürlük feed.read kapsamına göre:
 *   own (varsayılan, izni olmayan dahil): yalnızca kendi akışındaki kartlar (yazdığı veya kendisiyle ilgili olaylar)
 *   department: kendi birimindeki kişilerin akışları · all (Yönetici, Admin): herkesin akışı.
 */
@Injectable()
export class FeedService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tasks: TasksService,
    private readonly attachments: AttachmentsService,
  ) {}

  onModuleInit() {
    // Paylaşımdaki fotoğrafı/dosyayı paylaşımı görebilen herkes açabilir.
    this.attachments.registerAccessCheck(async (u, attachmentId) =>
      (await this.prisma.feedPostAttachment.count({ where: { attachmentId, post: this.visibleWhere(u) } })) > 0,
    );
  }

  scope(u: AuthUser): Scope {
    return scopeOf(u, 'feed.read') ?? 'own';
  }

  private visibleWhere(u: AuthUser): Prisma.FeedPostWhereInput {
    const scope = this.scope(u);
    if (scope === 'all') return { deletedAt: null };
    const or: Prisma.FeedPostWhereInput[] = [{ kind: WALL_KIND }, { audience: { some: { userId: u.id } } }];
    if (scope === 'department' && u.departmentId) or.push({ audience: { some: { user: { departmentId: u.departmentId } } } });
    return { deletedAt: null, OR: or };
  }

  private async findVisible(u: AuthUser, id: number) {
    const post = await this.prisma.feedPost.findFirst({ where: { id, ...this.visibleWhere(u) } });
    if (!post) throw new NotFoundException('Kart bulunamadı');
    return post;
  }

  async list(u: AuthUser, q: FeedListQuery) {
    const scope = this.scope(u);
    const and: Prisma.FeedPostWhereInput[] = [this.visibleWhere(u)];
    if (q.before) and.push({ id: { lt: q.before } });
    // Kişi filtresi yalnızca başkalarının akışını görebilenler için anlamlı; "own" kapsamda zaten kendisi.
    if (q.userId && scope !== 'own') and.push({ audience: { some: { userId: q.userId } } });
    if (q.customerCode) and.push({ customerCode: q.customerCode });
    // wall=1 yalnız eski pano (sosyal) paylaşımlarını döner; iş akışı hepsini gösterir (pano ana sayfadan kaldırıldı).
    if (q.wall) and.push({ kind: WALL_KIND });
    if (q.from) and.push({ createdAt: { gte: q.from } });
    if (q.to) and.push({ createdAt: { lte: q.to } });
    if (q.q) {
      const text = q.q;
      and.push({ OR: [
        { body: { contains: text } }, { customerName: { contains: text } }, { customerCode: { contains: text } },
        { relatedLabel: { contains: text } }, { author: { fullName: { contains: text } } },
      ] });
    }

    const rows = await this.prisma.feedPost.findMany({
      where: { AND: and },
      orderBy: { id: 'desc' },
      take: PAGE_SIZE + 1,
      include: {
        author: userSel,
        _count: { select: { likes: true } },
        // Beğenenlerden ilk 10'u (ipucu metni) ve kullanıcının kendi beğenisi ayrı ayrı; tüm satırlar çekilmez.
        likes: { select: { userId: true, user: { select: { fullName: true } } }, orderBy: { createdAt: 'asc' }, take: 10 },
        comments: {
          where: { deletedAt: null }, orderBy: { id: 'asc' }, take: COMMENTS_PER_POST,
          select: { id: true, body: true, createdAt: true, user: userSel },
        },
        audience: { select: { user: userSel }, take: 5 },
        files: { include: { attachment: fileSel }, orderBy: { sortOrder: 'asc' } },
      },
    });
    const page = rows.slice(0, PAGE_SIZE);
    const postIds = page.map((p) => p.id);
    const taskIds = page.filter((p) => p.relatedType === 'task').map((p) => Number(p.relatedId)).filter(Number.isInteger);
    const [activities, myLikes, tasks] = await Promise.all([
      this.activitiesOf(postIds),
      postIds.length ? this.prisma.feedLike.findMany({ where: { userId: u.id, postId: { in: postIds } }, select: { postId: true } }) : [],
      this.tasksOf(taskIds),
    ]);
    const likedIds = new Set(myLikes.map((l) => l.postId));

    return {
      scope,
      hasMore: rows.length > PAGE_SIZE,
      items: page.map((p) => ({
        id: p.id,
        kind: p.kind,
        body: p.body,
        createdAt: p.createdAt,
        author: p.author,
        // Sistem kartında yazar yoksa kartın sahibi (plasiyer) gösterilir.
        owner: p.author ?? p.audience[0]?.user ?? null,
        customerCode: p.customerCode,
        customerName: p.customerName,
        relatedLabel: p.relatedLabel,
        link: relatedLink(p.relatedType, p.relatedId, p.relatedLabel),
        likeCount: p._count.likes,
        likedByMe: likedIds.has(p.id),
        likers: p.likes.map((l) => l.user.fullName),
        comments: p.comments,
        activities: activities.get(p.id) ?? [],
        task: p.relatedType === 'task' ? tasks.get(Number(p.relatedId)) ?? null : null,
        files: p.files.map((f) => f.attachment),
        canDelete: USER_KINDS.includes(p.kind) && (p.authorId === u.id || scope === 'all'),
      })),
    };
  }

  /** Kartlara bağlı görevlerin özeti (kartı görebilen, karttan açılan aktivitenin başlığını ve durumunu da görür). */
  private async activitiesOf(postIds: number[]) {
    const map = new Map<number, { id: number; title: string; done: boolean; assignee: string | null; dueDate: Date | null }[]>();
    if (!postIds.length) return map;
    const tasks = await this.prisma.task.findMany({
      where: { relatedType: FEED_TASK_RELATION, relatedId: { in: postIds.map(String) }, deletedAt: null },
      select: { id: true, title: true, relatedId: true, dueDate: true, status: { select: { isDone: true } }, assignee: { select: { fullName: true } } },
      orderBy: { id: 'asc' },
    });
    for (const t of tasks) {
      const key = Number(t.relatedId);
      map.set(key, [...(map.get(key) ?? []), { id: t.id, title: t.title, done: t.status.isDone, assignee: t.assignee?.fullName ?? null, dueDate: t.dueDate }]);
    }
    return map;
  }

  /** Görev kartlarının güncel görev bilgisi: kartı görebilen, kartın anlattığı görevin durumunu ve alt görevlerini de görür. */
  private async tasksOf(ids: number[]) {
    const map = new Map<number, FeedTaskInfo>();
    if (!ids.length) return map;
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: [...new Set(ids)] }, deletedAt: null },
      select: {
        id: true, title: true, description: true, dueDate: true, assigneeId: true,
        status: { select: { name: true, isDone: true } }, assignee: { select: { fullName: true } },
        subtasks: { select: { id: true, title: true, done: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });
    for (const t of tasks) {
      map.set(t.id, {
        id: t.id, title: t.title, description: t.description, assignee: t.assignee?.fullName ?? null, assigneeId: t.assigneeId,
        status: t.status.name, done: t.status.isDone, dueDate: t.dueDate, subtasks: t.subtasks,
      });
    }
    return map;
  }

  async create(u: AuthUser, dto: FeedPostDto) {
    const fileIds = await this.attachments.assertOwn(u.id, dto.attachmentIds ?? []);
    if (!dto.body.trim() && !fileIds.length) throw new BadRequestException('Bir şey yazın veya fotoğraf ekleyin');
    const customer = await this.customer(dto.customerCode);
    const post = await this.prisma.feedPost.create({
      data: {
        kind: dto.wall ? WALL_KIND : 'post',
        files: { create: fileIds.map((attachmentId, sortOrder) => ({ attachmentId, sortOrder })) },
        authorId: u.id,
        body: dto.body.trim(),
        customerCode: customer?.code ?? null,
        customerName: customer?.name ?? null,
        audience: { create: [{ userId: u.id }] },
      },
    });
    await this.audit.log(u.id, 'feed.post', 'feed_post', post.id);
    return { id: post.id };
  }

  async remove(u: AuthUser, id: number) {
    const post = await this.findVisible(u, id);
    if (!USER_KINDS.includes(post.kind) || (post.authorId !== u.id && this.scope(u) !== 'all')) throw new ForbiddenException('Bu kartı silemezsiniz');
    await Promise.all([
      this.prisma.feedPost.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.audit.log(u.id, 'feed.delete', 'feed_post', id),
    ]);
  }

  async toggleLike(u: AuthUser, id: number) {
    await this.findVisible(u, id);
    const { count } = await this.prisma.feedLike.deleteMany({ where: { postId: id, userId: u.id } });
    if (!count) await this.prisma.feedLike.create({ data: { postId: id, userId: u.id } });
    return { liked: !count };
  }

  async addComment(u: AuthUser, id: number, dto: FeedCommentDto) {
    await this.findVisible(u, id);
    return this.prisma.feedComment.create({
      data: { postId: id, userId: u.id, body: dto.body.trim() },
      select: { id: true, body: true, createdAt: true, user: userSel },
    });
  }

  async removeComment(u: AuthUser, postId: number, commentId: number) {
    await this.findVisible(u, postId);
    const c = await this.prisma.feedComment.findFirst({ where: { id: commentId, postId, deletedAt: null } });
    if (!c) throw new NotFoundException('Yorum bulunamadı');
    if (c.userId !== u.id && this.scope(u) !== 'all') throw new ForbiddenException('Bu yorumu silemezsiniz');
    await this.prisma.feedComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
  }

  /** "Aktivite ekle": karta bağlı görev açar (görev yazma yetkisi ve atama kuralları TasksService'te denetlenir). */
  async addActivity(u: AuthUser, id: number, dto: FeedActivityDto) {
    const post = await this.findVisible(u, id);
    return this.tasks.create(u, {
      title: dto.title,
      dueDate: dto.dueDate ?? null,
      priority: dto.priority,
      assigneeId: dto.assigneeId ?? u.id,
      customerRef: post.customerCode,
      description: post.kind === 'post' ? post.body.slice(0, 2000) : undefined,
    }, { type: FEED_TASK_RELATION, id });
  }

  /** Aynı kayıt için aynı türde (silinmemiş) kart var mı? */
  async hasCard(kind: string, relatedType: string, relatedId: number | string) {
    return (await this.prisma.feedPost.count({ where: { kind, relatedType, relatedId: String(relatedId), deletedAt: null } })) > 0;
  }

  /** Silinen kayda ait sistem kartlarını (ör. "Yeni görev açıldı") akıştan kaldırır; kullanıcı paylaşımlarına dokunmaz. */
  async hideRelated(relatedType: string, relatedId: number | string) {
    await this.prisma.feedPost.updateMany({
      where: { relatedType, relatedId: String(relatedId), kind: { notIn: USER_KINDS }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /** Kartı günceller (canlı yenileme "feed" konusunu tetikler); karta bağlı aktivite değişince kullanılır. */
  async touch(postId: number) {
    if (postId) await this.prisma.feedPost.updateMany({ where: { id: postId }, data: { updatedAt: new Date() } });
  }

  private async customer(code?: string | null) {
    const c = code?.trim();
    if (!c) return null;
    const found = await this.prisma.erpCustomer.findUnique({ where: { code: c }, select: { code: true, name: true } });
    return found ?? { code: c, name: null };
  }

  /** Modül olaylarından sistem kartı (FeedEventsService kullanır). */
  async system(card: {
    kind: string; authorId: number | null; audience: (number | null | undefined)[]; body: string;
    customerCode?: string | null; customerName?: string | null; relatedType?: string; relatedId?: string | number; relatedLabel?: string | null;
  }) {
    const userIds = uniqIds(card.authorId, ...card.audience);
    if (!userIds.length) return; // kimsenin akışına düşmeyen kart (ör. plasiyeri eşlenmemiş Netsis kaydı) üretilmez
    const customer = card.customerName ? null : await this.customer(card.customerCode);
    await this.prisma.feedPost.create({
      data: {
        kind: card.kind,
        authorId: card.authorId,
        body: card.body.slice(0, POST_MAX),
        customerCode: card.customerCode?.slice(0, 35) || null,
        customerName: (card.customerName ?? customer?.name ?? null)?.slice(0, 200) ?? null,
        relatedType: card.relatedType ?? null,
        relatedId: card.relatedId === undefined ? null : String(card.relatedId),
        relatedLabel: card.relatedLabel?.slice(0, 200) ?? null,
        audience: { create: userIds.map((userId) => ({ userId })) },
      },
    });
  }
}
