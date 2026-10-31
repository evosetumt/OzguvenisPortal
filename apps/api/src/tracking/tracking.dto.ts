import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';

export const CATEGORIES = ['insurance', 'vehicle_inspection', 'vehicle_maintenance', 'commitment', 'contract', 'rent', 'other'] as const;
export const ITEM_STATUSES = ['active', 'renewed', 'cancelled', 'expired'] as const;
export const RENEWAL_PERIODS = ['none', 'monthly', 'quarterly', 'semiannual', 'yearly', 'biennial'] as const;

// null gönderilen alanlar temizlenir; undefined olanlar değişmez.
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);
const REMINDER_DAYS = /^\s*\d{1,3}(\s*,\s*\d{1,3}){0,9}\s*$/;

export class TrackedItemDto {
  @IsIn(CATEGORIES) category: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @Nullable() @IsString() @MaxLength(200) counterparty?: string | null;
  @Nullable() @IsInt() vehicleId?: number | null;
  @Nullable() @IsDateString() startDate?: string | null;
  @IsDateString() endDate: string;
  @Nullable() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number | null;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsIn(RENEWAL_PERIODS) renewalPeriod?: string;
  @Nullable() @IsInt() ownerId?: number | null;
  @IsOptional() @Matches(REMINDER_DAYS, { message: 'Hatırlatma günleri virgülle ayrılmış sayılar olmalı (örn. 60,30,7,1)' }) reminderDays?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) notifyUserIds?: number[];
  @Nullable() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) attachmentIds?: number[];
}

export class UpdateTrackedItemDto {
  @IsOptional() @IsIn(CATEGORIES) category?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @Nullable() @IsString() @MaxLength(200) counterparty?: string | null;
  @Nullable() @IsInt() vehicleId?: number | null;
  @Nullable() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() endDate?: string;
  @Nullable() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number | null;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsIn(RENEWAL_PERIODS) renewalPeriod?: string;
  @IsOptional() @IsInt() ownerId?: number;
  @IsOptional() @IsIn(['active', 'cancelled']) status?: string;
  @IsOptional() @Matches(REMINDER_DAYS, { message: 'Hatırlatma günleri virgülle ayrılmış sayılar olmalı (örn. 60,30,7,1)' }) reminderDays?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) notifyUserIds?: number[];
  @Nullable() @IsString() @MaxLength(2000) notes?: string | null;
}

export class RenewDto {
  /** Verilmezse yenileme periyoduna göre hesaplanır. */
  @IsOptional() @IsDateString() endDate?: string;
  @Nullable() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number | null;
  @Nullable() @IsString() @MaxLength(2000) notes?: string | null;
}

export class AttachFileDto {
  @IsInt() attachmentId: number;
}

export class VehicleDto {
  @IsString() @MinLength(2) @MaxLength(20) plate: string;
  @Nullable() @IsString() @MaxLength(120) brandModel?: string | null;
  @Nullable() @IsInt() @Min(1950) year?: number | null;
  @Nullable() @IsInt() assignedUserId?: number | null;
  @Nullable() @IsInt() @Min(0) km?: number | null;
  @Nullable() @IsString() @MaxLength(1000) notes?: string | null;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(20) plate?: string;
  @Nullable() @IsString() @MaxLength(120) brandModel?: string | null;
  @Nullable() @IsInt() @Min(1950) year?: number | null;
  @Nullable() @IsInt() assignedUserId?: number | null;
  @Nullable() @IsInt() @Min(0) km?: number | null;
  @Nullable() @IsString() @MaxLength(1000) notes?: string | null;
}

export class VehicleServiceDto {
  @IsString() @MinLength(1) @MaxLength(60) type: string;
  @IsDateString() date: string;
  @Nullable() @IsInt() @Min(0) km?: number | null;
  @Nullable() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cost?: number | null;
  @Nullable() @IsDateString() nextDueDate?: string | null;
  @Nullable() @IsInt() @Min(0) nextDueKm?: number | null;
  @Nullable() @IsString() @MaxLength(1000) notes?: string | null;
}
