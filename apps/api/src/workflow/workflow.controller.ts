import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { WorkflowService } from './workflow.service';
import { ProcessEngine } from './process-engine.service';

const MAX_XML = 2_000_000;

class CreateDefinitionDto {
  @Matches(/^[a-z][a-z0-9_]{1,59}$/, { message: 'Anahtar küçük harf, rakam ve _ içermeli (örn. izin_talebi)' }) key: string;
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(MAX_XML) bpmnXml?: string;
}

class SaveDefinitionDto {
  @IsString() @MinLength(20) @MaxLength(MAX_XML) bpmnXml: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
}

class ValidateDto {
  @IsString() @MaxLength(MAX_XML) bpmnXml: string;
}

class CompleteTaskDto {
  @IsString() @MaxLength(30) decision: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class WorkflowController {
  constructor(private readonly svc: WorkflowService, private readonly engine: ProcessEngine) {}

  @Get('process-definitions')
  @RequirePermission('workflow.design')
  list() {
    return this.svc.listDefinitions();
  }

  @Get('process-definitions/:id')
  @RequirePermission('workflow.design')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDefinition(id);
  }

  @Post('process-definitions')
  @RequirePermission('workflow.design')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateDefinitionDto) {
    return this.svc.createDefinition(u, dto.key, dto.name, dto.bpmnXml);
  }

  @Put('process-definitions/:id')
  @RequirePermission('workflow.design')
  save(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveDefinitionDto) {
    return this.svc.saveDraft(u, id, dto.bpmnXml, dto.name);
  }

  @Post('process-definitions/validate')
  @HttpCode(200)
  @RequirePermission('workflow.design')
  validate(@Body() dto: ValidateDto) {
    return this.svc.validate(dto.bpmnXml);
  }

  @Post('process-definitions/:id/publish')
  @HttpCode(200)
  @RequirePermission('workflow.design')
  publish(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(u, id);
  }

  @Post('process-definitions/:id/archive')
  @HttpCode(200)
  @RequirePermission('workflow.design')
  archive(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(u, id);
  }

  /** Tasarımcı seçicileri: servis işleyicileri ve rol adları. */
  @Get('process-meta')
  @RequirePermission('workflow.design')
  async meta() {
    return { handlers: this.engine.handlerList(), roles: await this.svc.roles(), departments: await this.svc.departments() };
  }

  @Get('process-instances')
  instances(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('key') key?: string) {
    return this.svc.listInstances(u, { status: status || undefined, definitionKey: key || undefined });
  }

  @Get('process-instances/:id')
  instance(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getInstance(u, id);
  }

  @Get('process-tasks/mine')
  myTasks(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.svc.myTasks(u, status === 'done');
  }

  @Post('process-tasks/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CompleteTaskDto) {
    return this.svc.complete(u, id, dto.decision, dto.comment);
  }
}
