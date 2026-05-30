import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportGateway } from './import.gateway';
import { ChatParserService } from './parsers/chat-parser.service';
import { MediaMatcherService } from './parsers/media-matcher.service';
import { ZipExtractorService } from './extractors/zip-extractor.service';
import { RarExtractorService } from './extractors/rar-extractor.service';
import { ImportJob } from './entities/import-job.entity';
import { ImportedMessage } from './entities/imported-message.entity';
import { Message } from '../message/entities/message.entity';
import { Session } from '../session/entities/session.entity';
import { Chat } from '../chat/entities/chat.entity';
import { ChatParticipant } from '../chat/entities/chat-participant.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [ImportJob, ImportedMessage, Message, Session, Chat, ChatParticipant, ChatMessage],
      'data',
    ),
    AuthModule,
    UsersModule,
    ChatModule,
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportGateway,
    ChatParserService,
    MediaMatcherService,
    ZipExtractorService,
    RarExtractorService,
  ],
  exports: [ImportService],
})
export class ImportModule {}
