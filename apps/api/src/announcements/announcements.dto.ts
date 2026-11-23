import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class AnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @Nullable() @IsString() @MaxLength(2000) body?: string | null;
  @IsOptional() @IsBoolean() important?: boolean;
  /** true: tüm şirket; false: yalnız departmentIds birimleri */
  @IsOptional() @IsBoolean() allDepartments?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) departmentIds?: number[];
  @Nullable() @IsDateString() startsAt?: string | null;
  @Nullable() @IsDateString() endsAt?: string | null;
}
