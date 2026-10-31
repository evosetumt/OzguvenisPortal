import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TASK_TYPES = ['general', 'erp_order', 'erp_quote'] as const;

// null gönderilen alanlar temizlenir (ör. atananı kaldırmak); undefined olanlar değişmez.
const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(250) title: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @Nullable() @IsInt() projectId?: number | null;
  @IsOptional() @IsInt() statusId?: number;
  @Nullable() @IsInt() assigneeId?: number | null;
  @Nullable() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsIn(TASK_TYPES) taskType?: string;
  @Nullable() @IsString() @MaxLength(60) customerRef?: string | null;
  @Nullable() @IsString() @MaxLength(60) erpDocNo?: string | null;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(250) title?: string;
  @Nullable() @IsString() @MaxLength(20000) description?: string | null;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @Nullable() @IsInt() projectId?: number | null;
  @IsOptional() @IsInt() statusId?: number;
  @Nullable() @IsInt() assigneeId?: number | null;
  @Nullable() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsIn(TASK_TYPES) taskType?: string;
  @Nullable() @IsString() @MaxLength(60) customerRef?: string | null;
  @Nullable() @IsString() @MaxLength(60) erpDocNo?: string | null;
}

export class MoveTaskDto {
  @IsInt() statusId: number;
  @IsInt() @Min(0) index: number;
}

export class SubtaskDto {
  @IsString() @MinLength(1) @MaxLength(250) title: string;
}

export class UpdateSubtaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(250) title?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(5000) body: string;
}

export class ProjectDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
}
