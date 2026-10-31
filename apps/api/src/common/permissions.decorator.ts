import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
/** Uç noktayı belirtilen izinlerden en az birine bağlar (örn. @RequirePermission('task.read')). */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);
