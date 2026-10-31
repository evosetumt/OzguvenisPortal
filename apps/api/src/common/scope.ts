import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/auth.guard';

export type Scope = 'all' | 'department' | 'own';

export const scopeOf = (u: AuthUser, code: string): Scope | null => (u.permissions[code] as Scope) ?? null;

/** Bugünün başlangıcı (sunucunun yerel tarihine göre, UTC gece yarısı olarak saklanan tarihlerle karşılaştırmak için). */
export function startOfTodayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * Kapsama göre görev filtresi. Yetkisiz kayıtlar sorguya hiç girmez.
 * own: atanan, oluşturan veya izleyen; department: ek olarak atananı/oluşturanı aynı departmanda olanlar.
 */
export function taskScopeWhere(u: AuthUser, scope: Scope, includeWatchers = true): Prisma.TaskWhereInput {
  if (scope === 'all') return {};
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: u.id }, { createdById: u.id }];
  if (includeWatchers) or.push({ watchers: { some: { userId: u.id } } });
  if (scope === 'department' && u.departmentId) {
    or.push({ assignee: { departmentId: u.departmentId } }, { createdBy: { departmentId: u.departmentId } });
  }
  return { OR: or };
}
