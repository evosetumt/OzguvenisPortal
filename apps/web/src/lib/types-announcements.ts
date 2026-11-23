export interface Announcement {
  id: number;
  title: string;
  body: string | null;
  important: boolean;
  allDepartments: boolean;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  author: { id: number; fullName: string };
  departments: { id: number; name: string }[];
}

/** Hedef kitle metni: "Tüm şirket" veya "Satış, Muhasebe" */
export function audienceLabel(a: Pick<Announcement, 'allDepartments' | 'departments'>): string {
  if (a.allDepartments) return 'Tüm şirket';
  return a.departments.map((d) => d.name).join(', ') || '—';
}

/** Yayın durumu: yayında / planlandı / sona erdi */
export function announcementState(a: Pick<Announcement, 'startsAt' | 'endsAt'>, now = new Date()): 'live' | 'scheduled' | 'ended' {
  if (new Date(a.startsAt) > now) return 'scheduled';
  if (a.endsAt && new Date(a.endsAt) <= now) return 'ended';
  return 'live';
}
