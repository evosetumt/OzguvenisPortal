import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PRIORITIES } from '../tasks/tasks.dto';

const Nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export const POST_MAX = 4000;
const COMMENT_MAX = 2000;

export class FeedPostDto {
  @IsString() @MinLength(1) @MaxLength(POST_MAX) body: string;
  /** Netsis cari kodu (isteğe bağlı): kartta firma adı olarak gösterilir. */
  @Nullable() @IsString() @MaxLength(35) customerCode?: string | null;
}

export class FeedCommentDto {
  @IsString() @MinLength(1) @MaxLength(COMMENT_MAX) body: string;
}

/** Karttan açılan aktivite = karta bağlı görev (cari kodu karttan gelir). */
export class FeedActivityDto {
  @IsString() @MinLength(1) @MaxLength(250) title: string;
  @Nullable() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @Nullable() @IsInt() assigneeId?: number | null;
}
