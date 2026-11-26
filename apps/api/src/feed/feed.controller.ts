import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { FeedService } from './feed.service';
import { RequiredFieldsService } from '../required-fields/required-fields.service';
import { FeedActivityDto, FeedCommentDto, FeedPostDto } from './feed.dto';

const optInt = (v?: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** "YYYY-MM-DD" → gün başı (veya endOfDay ile gün sonu); geçersizse yok sayılır. */
const optDay = (v?: string, endOfDay = false) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Haber akışı. İzin denetimi yok: herkesin en az kendi akışı vardır; kapsam FeedService'te uygulanır. */
@Controller('feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feed: FeedService, private readonly required: RequiredFieldsService) {}

  @Get()
  list(
    @CurrentUser() u: AuthUser, @Query('before') before?: string, @Query('userId') userId?: string, @Query('customer') customer?: string,
    @Query('wall') wall?: string, @Query('q') q?: string, @Query('from') from?: string, @Query('to') to?: string,
  ) {
    return this.feed.list(u, {
      before: optInt(before), userId: optInt(userId), customerCode: customer?.trim().slice(0, 35) || undefined, wall: wall === '1',
      q: q?.trim().slice(0, 100) || undefined, from: optDay(from), to: optDay(to, true),
    });
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() dto: FeedPostDto) {
    if (!dto.wall) await this.required.assert('feedPost', { customerCode: dto.customerCode });
    return this.feed.create(u, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.feed.remove(u, id);
  }

  @Post(':id/like')
  @HttpCode(200)
  like(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.feed.toggleLike(u, id);
  }

  @Post(':id/comments')
  comment(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: FeedCommentDto) {
    return this.feed.addComment(u, id, dto);
  }

  @Delete(':id/comments/:commentId')
  @HttpCode(204)
  removeComment(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Param('commentId', ParseIntPipe) commentId: number) {
    return this.feed.removeComment(u, id, commentId);
  }

  @Post(':id/activities')
  activity(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: FeedActivityDto) {
    return this.feed.addActivity(u, id, dto);
  }
}
