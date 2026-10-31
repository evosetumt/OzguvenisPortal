import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ProjectsService } from './projects.service';
import { TaskReminderService } from './task-reminder.service';

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, ProjectsService, TaskReminderService],
  exports: [TasksService],
})
export class TasksModule {}
