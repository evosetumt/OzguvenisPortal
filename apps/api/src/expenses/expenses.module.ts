import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AiModule } from '../ai/ai.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

/** Faz 3: masraf kaydı ve onayı (onay adımları BPMN süreci "expense_approval" ile yürür). */
@Module({
  imports: [AuthModule, WorkflowModule, AiModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
