import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PRIORITIES } from '../tasks/tasks.dto';

export class MeetingDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) participantIds?: number[];
  /** Verilirse katılımcılar (ayrıca belirtilmediyse) sohbet üyeleri olur. */
  @IsOptional() @IsInt() conversationId?: number;
}

export class MeetingNoteDto {
  @IsString() @MaxLength(50000) body: string;
}

/** Toplantı sırasında açılan görev (yalnızca başka kişilere görev atayabilen yöneticiler). */
export class MeetingTaskDto {
  @IsString() @MinLength(1) @MaxLength(250) title: string;
  @IsOptional() @IsString() @MaxLength(20000) description?: string;
  @IsInt() assigneeId: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
}
