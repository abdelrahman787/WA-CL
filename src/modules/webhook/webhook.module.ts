import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhooksListController } from './webhooks-list.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook], 'data'),
    ...(process.env.QUEUE_ENABLED === 'true' ? [QueueModule] : []),
  ],
  controllers: [WebhookController, WebhooksListController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
