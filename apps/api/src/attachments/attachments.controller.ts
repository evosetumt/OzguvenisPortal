import {
  Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, AuthUser } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AttachmentsService, MAX_UPLOAD_BYTES } from './attachments.service';

@Controller('attachments')
@UseGuards(AuthGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  /** multipart/form-data, alan adı "file". Dönen id ilgili kayda (masraf, sözleşme, mesaj) bağlanır. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.save(u.id, file);
  }

  @Get(':id')
  async download(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Res({ passthrough: true }) res: Response) {
    const a = await this.svc.get(id);
    if (!(await this.svc.canAccess(u, id, a.uploadedById))) throw new ForbiddenException();
    res.set({
      'Content-Type': a.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(this.svc.stream(a.storageKey));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeOrphan(u.id, id);
  }
}
