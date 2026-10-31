import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
const money = { maxDecimalPlaces: 2 };

export class ExpenseDto {
  @IsInt() categoryId: number;
  @IsNumber(money) @Min(0.01) @Max(10_000_000) amount: number;
  @IsOptional() @IsIn(CURRENCIES) currency?: string;
  /** Döviz masraflarında TL karşılığı (TL'de tutarla aynıdır, gönderilmesi gerekmez). */
  @IsOptional() @IsNumber(money) @Min(0.01) @Max(100_000_000) amountTry?: number;
  @IsDateString() expenseDate: string;
  @IsString() @MinLength(2) @MaxLength(500) description: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) receiptIds?: number[];
}

export class UpdateExpenseDto {
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsNumber(money) @Min(0.01) @Max(10_000_000) amount?: number;
  @IsOptional() @IsIn(CURRENCIES) currency?: string;
  @IsOptional() @IsNumber(money) @Min(0.01) @Max(100_000_000) amountTry?: number;
  @IsOptional() @IsDateString() expenseDate?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) receiptIds?: number[];
}

export class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class ExpenseSettingsDto {
  @IsOptional() @IsNumber(money) @Min(0) @Max(1_000_000) autoApproveLimit?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) approvalReminderHours?: number;
  @IsOptional() @IsBoolean() aiCategorySuggest?: boolean;
}

export class SuggestCategoryDto {
  @IsString() @MinLength(2) @MaxLength(500) description: string;
  @IsOptional() @IsNumber() amount?: number;
}
