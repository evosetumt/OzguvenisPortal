import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermission } from '../common/permissions.decorator';
import { ChatService } from './chat.service';
import { DirectDto, EditMessageDto, GroupDto, MembersDto, ReadDto, SendMessageDto, UpdateGroupDto } from './chat.dto';

const optInt = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/** Mesajlaşma tüm giriş yapmış kullanıcılara açıktır; sohbete yalnızca üyeleri erişir. */
@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(@CurrentUser() u: AuthUser) {
    return this.chat.list(u);
  }

  @Get('unread')
  unread(@CurrentUser() u: AuthUser) {
    return this.chat.unreadTotal(u);
  }

  @Post('direct')
  @HttpCode(200)
  direct(@CurrentUser() u: AuthUser, @Body() dto: DirectDto) {
    return this.chat.direct(u, dto.userId);
  }

  @Post('groups')
  createGroup(@CurrentUser() u: AuthUser, @Body() dto: GroupDto) {
    return this.chat.createGroup(u, dto);
  }

  @Get('conversations/:id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.get(u, id);
  }

  @Patch('conversations/:id')
  rename(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGroupDto) {
    return this.chat.renameGroup(u, id, dto.title);
  }

  @Post('conversations/:id/members')
  addMembers(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MembersDto) {
    return this.chat.addMembers(u, id, dto.userIds);
  }

  @Delete('conversations/:id/members/:userId')
  @HttpCode(204)
  removeMember(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.chat.removeMember(u, id, userId);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Query('before') before?: string, @Query('take') take?: string) {
    return this.chat.messages(u, id, optInt(before), optInt(take));
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {
    return this.chat.send(u, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReadDto) {
    return this.chat.markRead(u, id, dto.messageId);
  }

  @Patch('messages/:id')
  edit(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: EditMessageDto) {
    return this.chat.edit(u, id, dto.body);
  }

  @Delete('messages/:id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.remove(u, id);
  }

  // Sohbet arşivi: yönetici tüm sohbetleri, silinen mesajları ve düzenleme geçmişini görür, silineni geri getirir.
  @Get('admin/conversations')
  @RequirePermission('chat.audit')
  archiveList(@Query('q') q?: string, @Query('userId') userId?: string) {
    return this.chat.archiveList(q, optInt(userId));
  }

  @Get('admin/conversations/:id/messages')
  @RequirePermission('chat.audit')
  archiveMessages(@Param('id', ParseIntPipe) id: number, @Query('before') before?: string, @Query('take') take?: string) {
    return this.chat.archiveMessages(id, optInt(before), optInt(take));
  }

  @Post('admin/messages/:id/restore')
  @HttpCode(200)
  @RequirePermission('chat.audit')
  restore(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.restore(u, id);
  }
}
