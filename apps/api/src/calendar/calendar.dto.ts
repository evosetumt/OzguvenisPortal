import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const VISIBILITIES = ['private', 'department', 'company'] as const;

export class CalendarEventDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) attendeeIds?: number[];
}

export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) attendeeIds?: number[];
}
