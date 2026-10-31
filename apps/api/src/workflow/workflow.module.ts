import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { ProcessEngine } from './process-engine.service';

/** Faz 3: BPMN motoru. Diğer modüller ProcessEngine.registerHandler ile servis görevi işleyicisi ekler. */
@Module({
  imports: [AuthModule],
  controllers: [WorkflowController],
  providers: [WorkflowService, ProcessEngine],
  exports: [ProcessEngine],
})
export class WorkflowModule {}
