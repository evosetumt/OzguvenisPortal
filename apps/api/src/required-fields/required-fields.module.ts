import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequiredFieldsController } from './required-fields.controller';
import { RequiredFieldsService } from './required-fields.service';

/** Zorunlu alan yönetimi (parametrik): her modül RequiredFieldsService.assert ile uygular. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RequiredFieldsController],
  providers: [RequiredFieldsService],
  exports: [RequiredFieldsService],
})
export class RequiredFieldsModule {}
