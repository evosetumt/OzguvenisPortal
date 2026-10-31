import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.guard';
import { Scope, scopeOf } from '../common/scope';

const RANK: Record<Scope, number> = { own: 1, department: 2, all: 3 };
/** Hiçbir kayıtla eşleşmeyen plasiyer kodu (kapsam boşsa). */
const NONE = '\u0000yok';

/**
 * Netsis kayıtları için kapsam: kayıtlardaki plasiyer kodu (PLASIYER_KODU / PLA_KODU) kullanıcının
 * User.erpRepCode alanıyla eşlenir.
 *   all        → tüm kayıtlar
 *   department → departmanımdaki kullanıcıların plasiyer kodları
 *   own        → yalnızca kendi plasiyer kodum (tanımlı değilse hiçbir kayıt)
 */
@Injectable()
export class ErpScope {
  constructor(private readonly prisma: PrismaService) {}

  /** Verilen izinlerden en geniş kapsamı döner (hiçbiri yoksa null). */
  widest(u: AuthUser, ...codes: string[]): Scope | null {
    let best: Scope | null = null;
    for (const c of codes) {
      const s = scopeOf(u, c);
      if (s && (!best || RANK[s] > RANK[best])) best = s;
    }
    return best;
  }

  /** Kapsamın izin verdiği plasiyer kodları; null = sınırsız. */
  async repCodes(u: AuthUser, scope: Scope | null): Promise<string[] | null> {
    if (scope === 'all') return null;
    if (!scope) return [NONE];
    const where = scope === 'department' && u.departmentId ? { departmentId: u.departmentId } : { id: u.id };
    const users = await this.prisma.user.findMany({ where: { ...where, deletedAt: null, erpRepCode: { not: null } }, select: { erpRepCode: true } });
    const codes = [...new Set(users.map((x) => x.erpRepCode!.trim()).filter(Boolean))];
    return codes.length ? codes : [NONE];
  }

  /** Prisma where parçası: { repCode: { in: [...] } } veya {} */
  async where(u: AuthUser, ...perms: string[]): Promise<{ repCode?: { in: string[] } }> {
    const codes = await this.repCodes(u, this.widest(u, ...perms));
    return codes ? { repCode: { in: codes } } : {};
  }
}
