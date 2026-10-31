import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const MAX_MESSAGE = 4000;

export class DirectDto {
  @IsInt() userId: number;
}

export class GroupDto {
  @IsString() @MinLength(1) @MaxLength(150) title: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) memberIds: number[];
}

export class UpdateGroupDto {
  @IsString() @MinLength(1) @MaxLength(150) title: string;
}

export class MembersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) userIds: number[];
}

export class SendMessageDto {
  // Ek varsa metin boş olabilir.
  @ValidateIf((o) => !o.attachmentId) @IsString() @MinLength(1) @MaxLength(MAX_MESSAGE) body: string;
  @IsOptional() @IsInt() attachmentId?: number;
}

export class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(MAX_MESSAGE) body: string;
}

export class ReadDto {
  @IsOptional() @IsInt() messageId?: number;
}
