import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.guard';

export type Scope = 'all' | 'department' | 'own';

export const scopeOf = (u: AuthUser, code: string): Scope | null => (u.permissions[code] as Scope) ?? null;

/** Bugünün başlangıcı (sunucunun yerel tarihine göre, UTC gece yarısı olarak saklanan tarihlerle karşılaştırmak için). */
export function startOfTodayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Görev görünürlüğü: kapsamı "all" olan (Yönetici, Admin rolleri) tüm görevleri görür/düzenler. Diğer herkes (department
 * kapsamı dahil) yalnızca içinde olduğu görevleri görür: atanan, oluşturan veya izleyen. Department kapsamı yalnızca
 * birimdeki kişilere görev atamayı açar (tasks.service → assertCanAssign). includeWatchers=false: düzenleme için.
 */
export function taskScopeWhere(u: AuthUser, scope: Scope | null, includeWatchers = true): Prisma.TaskWhereInput {
  return scope === 'all' ? {} : taskInvolvedWhere(u.id, includeWatchers);
}

/** Görev okuma kapsamına göre filtre (başka modüllerde görev listelerken). */
export const taskReadWhere = (u: AuthUser) => taskScopeWhere(u, scopeOf(u, 'task.read'));

export function taskInvolvedWhere(userId: number, includeWatchers = true): Prisma.TaskWhereInput {
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: userId }, { createdById: userId }];
  if (includeWatchers) or.push({ watchers: { some: { userId } } });
  return { OR: or };
}
