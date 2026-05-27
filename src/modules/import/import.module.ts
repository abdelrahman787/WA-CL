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
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob, ImportedMessage, Message, Session], 'data'),
    AuthModule,
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
