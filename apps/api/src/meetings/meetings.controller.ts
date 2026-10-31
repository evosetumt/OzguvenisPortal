import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MeetingsService } from './meetings.service';
import { MeetingDto, MeetingNoteDto, MeetingTaskDto } from './meetings.dto';

@Controller('meetings')
@UseGuards(AuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('when') when?: string) {
    return this.meetings.list(u, when === 'past' ? 'past' : 'upcoming');
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: MeetingDto) {
    return this.meetings.create(u, dto);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.get(u, id);
  }

  @Delete(':id')
  @HttpCode(204)
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.cancel(u, id);
  }

  @Post(':id/join')
  @HttpCode(200)
  join(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.join(u, id);
  }

  @Get(':id/attendance')
  attendance(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.attendance(u, id);
  }

  @Get(':id/note')
  note(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.note(u, id);
  }

  @Put(':id/note')
  saveNote(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MeetingNoteDto) {
    return this.meetings.saveNote(u, id, dto.body);
  }

  @Get(':id/tasks')
  tasks(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.meetings.meetingTasks(u, id);
  }

  @Post(':id/tasks')
  createTask(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MeetingTaskDto) {
    return this.meetings.createTask(u, id, dto);
  }
}
