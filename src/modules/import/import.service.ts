import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ImportJob } from './entities/import-job.entity';
import { ImportedMessage } from './entities/imported-message.entity';
import { ChatParserService } from './parsers/chat-parser.service';
import { MediaMatcherService } from './parsers/media-matcher.service';
import { ZipExtractorService } from './extractors/zip-extractor.service';
import { RarExtractorService } from './extractors/rar-extractor.service';
import { ImportGateway } from './import.gateway';
import { MapUsersDto } from './dto/user-mapping.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import type { ImportStage } from './interfaces/import-progress.interface';
import type { ParsedMessage } from './interfaces/parsed-message.interface';

interface UploadedFile {
  originalname: string;
  path: string;          // absolute path on disk
  size: number;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(ImportJob, 'data')
    private readonly jobRepo: Repository<ImportJob>,
    @InjectRepository(ImportedMessage, 'data')
    private readonly messageRepo: Repository<ImportedMessage>,
    private readonly chatParser: ChatParserService,
    private readonly mediaMatcher: MediaMatcherService,
    private readonly zip: ZipExtractorService,
    private readonly rar: RarExtractorService,
    private readonly gateway: ImportGateway,
  ) {}

  async createJob(file: UploadedFile, sessionId?: string): Promise<ImportJob> {
    const job = this.jobRepo.create({
      originalFileName: file.originalname,
      status: 'extracting' as ImportStage,
      sessionId: sessionId ?? null,
      tempExtractPath: path.join(os.tmpdir(), `openwa-imports-${uuidv4()}`),
    });
    const saved = await this.jobRepo.save(job);
    // Fire-and-forget background processing.
    void this.processJob(saved.id, file).catch(err => {
      this.logger.error(`job ${saved.id} failed`, err.stack || err.message);
      void this.markFailed(saved.id, err.message);
    });
    return saved;
  }

  async processJob(jobId: string, file: UploadedFile): Promise<void> {
    const job = await this.findJob(jobId);
    if (!job.tempExtractPath) throw new Error('tempExtractPath missing');

    this.emitProgress(jobId, 'extracting', 5, 'detecting archive type', job);
    const type = await this.rar.detectArchiveType(file.path);

    this.emitProgress(jobId, 'extracting', 15, 'extracting archive', job);
    let files: string[];
    if (type === 'rar') files = await this.rar.extract(file.path, job.tempExtractPath);
    else if (type === 'zip') files = await this.zip.extract(file.path, job.tempExtractPath);
    else throw new Error(`unsupported archive type for ${file.originalname}`);

    this.emitProgress(jobId, 'parsing', 50, 'parsing _chat.txt', job);
    const chatTxt = files.find(f => path.basename(f).toLowerCase() === '_chat.txt');
    if (!chatTxt) throw new Error('no _chat.txt found in archive');

    const messages = await this.chatParser.parseChat(chatTxt);
    const summary = this.chatParser.summarize(messages);

    this.emitProgress(jobId, 'matching_media', 80, 'matching media files', job);
    const mediaFiles = files.filter(f => f !== chatTxt);
    const report = this.mediaMatcher.matchAllMedia(messages, mediaFiles);

    job.totalMessages = messages.length;
    job.totalMediaFiles = report.totalMediaMessages;
    job.matchedMediaFiles = report.exactMatches + report.fuzzyMatches;
    job.unmatchedMediaFiles = report.unmatched;
    job.chatName = summary.groupName;
    job.detectedParticipants = summary.participants.map(p => p.name);
    job.status = 'preview' as ImportStage;
    await this.jobRepo.save(job);

    await this.persistParsedMessages(job.id, messages, report.perMessage);

    this.emitProgress(jobId, 'preview', 100, 'ready for review', job);
  }

  private async persistParsedMessages(
    jobId: string,
    messages: ParsedMessage[],
    matches: Map<number, { filePath: string | null }>,
  ): Promise<void> {
    const chunkSize = 100;
    for (let i = 0; i < messages.length; i += chunkSize) {
      const slice = messages.slice(i, i + chunkSize).map(m => {
        const match = matches.get(m.index);
        return this.messageRepo.create({
          importJobId: jobId,
          originalSenderName: m.senderName,
          originalTimestamp: m.timestamp,
          messageType: m.messageType,
          textContent: m.textContent ?? null,
          mediaFileName: m.attachedFileName ?? null,
          mediaStoragePath: match?.filePath ?? null,
          mediaMatched: !!match?.filePath,
          sequenceIndex: m.index,
          isSystemMessage: m.isSystemMessage,
        });
      });
      await this.messageRepo.save(slice);
    }
  }

  async findJob(jobId: string): Promise<ImportJob> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`import job ${jobId} not found`);
    return job;
  }

  async listJobs(): Promise<ImportJob[]> {
    return this.jobRepo.find({ order: { createdAt: 'DESC' } });
  }

  async preview(jobId: string, page = 1, pageSize = 50) {
    const [items, total] = await this.messageRepo.findAndCount({
      where: { importJobId: jobId },
      order: { sequenceIndex: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getParticipants(jobId: string) {
    const job = await this.findJob(jobId);
    const counts = new Map<string, number>();
    const all = await this.messageRepo.find({
      where: { importJobId: jobId },
      select: ['originalSenderName', 'isSystemMessage'],
    });
    for (const m of all) {
      if (m.isSystemMessage) continue;
      counts.set(m.originalSenderName, (counts.get(m.originalSenderName) ?? 0) + 1);
    }
    return {
      detected: job.detectedParticipants ?? [],
      counts: Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    };
  }

  async mapUsers(jobId: string, dto: MapUsersDto): Promise<ImportJob> {
    const job = await this.findJob(jobId);
    const mapping: Record<string, string> = {};
    for (const m of dto.mappings) {
      if (m.action === 'map_existing' && m.existingUserId) {
        mapping[m.senderName] = m.existingUserId;
      } else if (m.action === 'create_new') {
        // TODO: create user via auth module, capture new id
        mapping[m.senderName] = `pending:${m.senderName}`;
      } else {
        mapping[m.senderName] = 'anonymous';
      }
    }
    job.userMapping = mapping;
    job.status = 'mapping_users' as ImportStage;
    return this.jobRepo.save(job);
  }

  async confirm(jobId: string, dto: ConfirmImportDto): Promise<ImportJob> {
    const job = await this.findJob(jobId);
    job.status = 'importing' as ImportStage;
    if (dto.chatTitle) job.chatName = dto.chatTitle;
    if (dto.sessionId) job.sessionId = dto.sessionId;
    await this.jobRepo.save(job);

    // TODO: write messages to the live chat tables under the target
    // session, copy media into permanent storage, link to mapped users.
    // For now we just mark the job complete.
    job.status = 'complete' as ImportStage;
    const saved = await this.jobRepo.save(job);

    this.gateway.emitComplete({
      jobId,
      chatId: null,
      summary: {
        totalMessages: job.totalMessages,
        mediaImported: job.matchedMediaFiles,
        mediaOmitted: job.unmatchedMediaFiles,
        participantsCreated: 0,
        participantsMapped: Object.keys(job.userMapping ?? {}).length,
        durationMs: Date.now() - new Date(job.createdAt).getTime(),
      },
    });
    return saved;
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.findJob(jobId);
    if (job.tempExtractPath) {
      await fs.rm(job.tempExtractPath, { recursive: true, force: true });
    }
    await this.messageRepo.delete({ importJobId: jobId });
    await this.jobRepo.delete({ id: jobId });
  }

  private async markFailed(jobId: string, error: string): Promise<void> {
    await this.jobRepo.update(jobId, {
      status: 'failed' as ImportStage,
      errorDetails: { message: error },
    });
    this.gateway.emitError({
      jobId,
      error,
      stage: 'failed',
      recoverable: /unavailable|not installed/i.test(error),
    });
  }

  private emitProgress(
    jobId: string,
    stage: ImportStage,
    progress: number,
    step: string,
    job: ImportJob,
  ): void {
    this.gateway.emitProgress({
      jobId,
      stage,
      progress,
      currentStep: step,
      stats: {
        totalMessages: job.totalMessages,
        processedMessages: job.processedMessages,
        matchedMedia: job.matchedMediaFiles,
        totalMedia: job.totalMediaFiles,
        errors: 0,
      },
    });
  }
}
