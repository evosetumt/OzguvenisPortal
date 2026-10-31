import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CallsService } from './calls.service';

class StartCallDto {
  @IsInt() conversationId: number;
  @IsIn(['audio', 'video']) kind: 'audio' | 'video';
}

/** Sohbet aramaları (WebRTC). Toplantı araması /meetings/:id/join ile açılır. Erişim katılımcı/üye denetimiyle. */
@Controller('calls')
@UseGuards(AuthGuard)
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.calls.mine(u);
  }

  @Post()
  start(@CurrentUser() u: AuthUser, @Body() dto: StartCallDto) {
    return this.calls.startInConversation(u, dto.conversationId, dto.kind);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.calls.get(u, id);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.calls.join(u, id);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.calls.decline(u, id);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.calls.leave(u, id);
  }
}
