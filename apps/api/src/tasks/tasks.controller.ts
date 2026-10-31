import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { TasksService } from './tasks.service';
import { ProjectsService } from './projects.service';
import {
  CommentDto, CreateTaskDto, MoveTaskDto, ProjectDto, SubtaskDto, UpdateProjectDto, UpdateSubtaskDto, UpdateTaskDto,
} from './tasks.dto';

const optInt = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService, private readonly projects: ProjectsService) {}

  @Get('task-statuses')
  @RequirePermission('task.read')
  statuses() {
    return this.tasks.statuses();
  }

  @Get('projects')
  @RequirePermission('task.read')
  listProjects(@CurrentUser() u: AuthUser) {
    return this.projects.list(u);
  }

  @Post('projects')
  @RequirePermission('task.write')
  createProject(@CurrentUser() u: AuthUser, @Body() dto: ProjectDto) {
    return this.projects.create(u, dto);
  }

  @Patch('projects/:id')
  @RequirePermission('task.write')
  updateProject(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.projects.update(u, id, dto);
  }

  @Get('tasks')
  @RequirePermission('task.read')
  list(
    @CurrentUser() u: AuthUser,
    @Query('projectId') projectId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('mine') mine?: string,
    @Query('q') q?: string,
  ) {
    return this.tasks.list(u, {
      projectId: optInt(projectId),
      assigneeId: optInt(assigneeId),
      mine: mine === '1',
      q: q?.trim() || undefined,
    });
  }

  @Get('tasks/summary')
  @RequirePermission('task.read')
  summary(@CurrentUser() u: AuthUser, @Query('mine') mine?: string) {
    return this.tasks.summary(u, mine === '1');
  }

  @Get('tasks/:id')
  @RequirePermission('task.read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.get(u, id);
  }

  @Post('tasks')
  @RequirePermission('task.write')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(u, dto);
  }

  @Patch('tasks/:id')
  @RequirePermission('task.write')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(u, id, dto);
  }

  @Post('tasks/:id/move')
  @HttpCode(200)
  @RequirePermission('task.write')
  move(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MoveTaskDto) {
    return this.tasks.move(u, id, dto);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @RequirePermission('task.write')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.remove(u, id);
  }

  @Post('tasks/:id/subtasks')
  @RequirePermission('task.write')
  addSubtask(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SubtaskDto) {
    return this.tasks.addSubtask(u, id, dto.title);
  }

  @Patch('subtasks/:id')
  @RequirePermission('task.write')
  updateSubtask(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubtaskDto) {
    return this.tasks.updateSubtask(u, id, dto);
  }

  @Delete('subtasks/:id')
  @HttpCode(204)
  @RequirePermission('task.write')
  removeSubtask(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.removeSubtask(u, id);
  }

  @Post('tasks/:id/comments')
  @RequirePermission('task.read')
  addComment(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CommentDto) {
    return this.tasks.addComment(u, id, dto.body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @RequirePermission('task.read')
  removeComment(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.removeComment(u, id);
  }
}
