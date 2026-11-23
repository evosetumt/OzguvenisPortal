import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RequirePermission } from '../common/permissions.decorator';
import { REQUIRED_CATALOG, RequiredFieldsService } from './required-fields.service';

@Controller('required-fields')
@UseGuards(AuthGuard)
export class RequiredFieldsController {
  constructor(private readonly svc: RequiredFieldsService) {}

  /** Herkes: formlar hangi alanların zorunlu olduğunu buradan okur. */
  @Get()
  async get() {
    return { catalog: REQUIRED_CATALOG, required: await this.svc.get() };
  }

  @Put()
  @RequirePermission('user.manage')
  async save(@Body() body: { required?: unknown }) {
    return { catalog: REQUIRED_CATALOG, required: await this.svc.save(body?.required) };
  }
}
