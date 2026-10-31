import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CategoryDto, ExpenseDto, ExpenseSettingsDto, SuggestCategoryDto, UpdateCategoryDto, UpdateExpenseDto } from './expenses.dto';

const STATUSES = ['draft', 'submitted', 'manager_approved', 'accounting_approved', 'rejected', 'paid'];
/** Kategori ve eşik ayarlarını muhasebe veya kullanıcı yöneticisi değiştirebilir. */
const canManage = (u: AuthUser) => 'expense.accounting' in u.permissions || 'user.manage' in u.permissions;

@Controller()
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @Get('expense-categories')
  categories(@CurrentUser() u: AuthUser, @Query('all') all?: string) {
    return this.svc.categories(all === '1' && canManage(u));
  }

  @Post('expense-categories')
  createCategory(@CurrentUser() u: AuthUser, @Body() dto: CategoryDto) {
    if (!canManage(u)) throw new ForbiddenException();
    return this.svc.createCategory(u, dto);
  }

  @Patch('expense-categories/:id')
  updateCategory(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    if (!canManage(u)) throw new ForbiddenException();
    return this.svc.updateCategory(u, id, dto);
  }

  @Get('expense-settings')
  getSettings() {
    return this.svc.getSettings();
  }

  @Put('expense-settings')
  saveSettings(@CurrentUser() u: AuthUser, @Body() dto: ExpenseSettingsDto) {
    if (!canManage(u)) throw new ForbiddenException();
    return this.svc.saveSettings(u, dto);
  }

  @Post('expenses/suggest-category')
  @HttpCode(200)
  @RequirePermission('expense.create')
  suggest(@Body() dto: SuggestCategoryDto) {
    return this.svc.suggestCategory(dto.description, dto.amount);
  }

  /** view: mine (varsayılan) | team (expense.approve) | all (expense.accounting/approve kapsamı all) */
  @Get('expenses')
  @RequirePermission('expense.create', 'expense.approve', 'expense.accounting')
  list(@CurrentUser() u: AuthUser, @Query('view') view = 'mine', @Query('status') status?: string) {
    return this.svc.list(u, view, status && STATUSES.includes(status) ? status : undefined);
  }

  @Get('expenses/:id')
  @RequirePermission('expense.create', 'expense.approve', 'expense.accounting')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(u, id);
  }

  @Post('expenses')
  @RequirePermission('expense.create')
  create(@CurrentUser() u: AuthUser, @Body() dto: ExpenseDto) {
    return this.svc.create(u, dto);
  }

  @Patch('expenses/:id')
  @RequirePermission('expense.create')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExpenseDto) {
    return this.svc.update(u, id, dto);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  @RequirePermission('expense.create')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(u, id);
  }

  @Post('expenses/:id/submit')
  @HttpCode(200)
  @RequirePermission('expense.create')
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.submit(u, id);
  }
}
