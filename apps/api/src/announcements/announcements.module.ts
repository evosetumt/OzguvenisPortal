import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

/** Duyurular: birimlere hedefli, üst çubukta kayan yazı. */
@Module({
  imports: [AuthModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
