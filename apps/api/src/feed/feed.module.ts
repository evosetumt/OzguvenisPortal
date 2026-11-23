import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedEventsService } from './feed-events.service';

/** Haber akışı: paylaşımlar, beğeni/yorum, karttan aktivite (görev) ve modül olaylarından otomatik kartlar. */
@Module({
  imports: [AuthModule, TasksModule],
  controllers: [FeedController],
  providers: [FeedService, FeedEventsService],
})
export class FeedModule {}
