import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export const PAYMENT_TYPES = ['cheque', 'credit_card', 'loan', 'tax', 'sgk', 'rent', 'invoice', 'other'] as const;
export const RECURRENCES = ['none', 'monthly', 'quarterly', 'yearly'] as const;
export const PAYMENT_STATUSES = ['planned', 'awaiting', 'assigned', 'paid', 'cancelled'] as const;
/** Ödenmemiş (takipte) durumlar */
export const OPEN_STATUSES = ['planned', 'awaiting', 'assigned'];

// null gönderilen alanlar temizlenir; undefined olanlar değişmez.
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class PaymentDto {
  @IsIn(PAYMENT_TYPES) type: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @Nullable() @IsString() @MaxLength(200) counterparty?: string | null;
  @Nullable() @IsString() @MaxLength(60) docNo?: string | null;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsDateString() dueDate: string;
  @IsInt() departmentId: number;
  /** Vadeden kaç gün önce görev açılacağı; boşsa genel ayar (payment.defaultLeadDays). */
  @Nullable() @IsInt() @Min(0) @Max(90) leadDays?: number | null;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @Nullable() @IsString() @MaxLength(2000) notes?: string | null;
}

export class UpdatePaymentDto {
  @IsOptional() @IsIn(PAYMENT_TYPES) type?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @Nullable() @IsString() @MaxLength(200) counterparty?: string | null;
  @Nullable() @IsString() @MaxLength(60) docNo?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() departmentId?: number;
  @Nullable() @IsInt() @Min(0) @Max(90) leadDays?: number | null;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @Nullable() @IsString() @MaxLength(2000) notes?: string | null;
}

export class AssignPaymentDto {
  @IsInt() assigneeId: number;
}

export class PaymentSettingsDto {
  @IsInt() @Min(0) @Max(90) defaultLeadDays: number;
}
