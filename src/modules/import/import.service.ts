import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ImportJob } from './entities/import-job.entity';
import { ImportedMessage } from './entities/imported-message.entity';
import { Message, MessageDirection, MessageStatus } from '../message/entities/message.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { StorageService } from '../../common/storage/storage.service';
import { UsersService } from '../users/users.service';
import { ChatService } from '../chat/chat.service';
import { Chat } from '../chat/entities/chat.entity';
import { ChatParticipant } from '../chat/entities/chat-participant.entity';
import { ChatMessage } from '../chat/entities/chat-message.entity';
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
    @InjectRepository(Message, 'data')
    private readonly liveMessageRepo: Repository<Message>,
    @InjectRepository(Session, 'data')
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Chat, 'data')
    private readonly chatRepo: Repository<Chat>,
    @InjectRepository(ChatParticipant, 'data')
    private readonly chatPartRepo: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage, 'data')
    private readonly chatMsgRepo: Repository<ChatMessage>,
    private readonly chatParser: ChatParserService,
    private readonly mediaMatcher: MediaMatcherService,
    private readonly zip: ZipExtractorService,
    private readonly rar: RarExtractorService,
    private readonly gateway: ImportGateway,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * One-time-visible credentials for users we mint during an import.
   * Operators see these after confirm() and hand them out — we never
   * store the plaintext, so this is the only chance to capture them.
   */
  private readonly mintedCredentials = new Map<string, Array<{ username: string; password: string; displayName: string }>>();

  getMintedCredentials(jobId: string) {
    return this.mintedCredentials.get(jobId) ?? [];
  }

  /** For the wizard's "map to existing user" picker. */
  async listUsersForDirectory() {
    return this.usersService.list();
  }

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

    this.emitProgress(jobId, 'parsing', 50, 'locating chat transcript', job);
    // WhatsApp names the transcript differently per platform:
    //   - iOS export:     "_chat.txt"
    //   - Android export: "WhatsApp Chat with <Group Name>.txt"
    //   - Old exports:    "<chat title>.txt" at root
    // Try in priority order; fall back to "any .txt at the archive root".
    const chatTxt = this.findChatTranscript(files);
    if (!chatTxt) throw new Error('no _chat.txt (or WhatsApp Chat with *.txt) found in archive');

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
    const mapping: Record<string, string> = { ...(job.userMapping ?? {}) };
    const minted: Array<{ username: string; password: string; displayName: string }> = [];

    for (const m of dto.mappings) {
      if (m.action === 'map_existing' && m.existingUserId) {
        mapping[m.senderName] = m.existingUserId;
        continue;
      }
      if (m.action === 'create_new') {
        const displayName = m.newUserData?.displayName || m.senderName;
        const username = this.slugify(displayName) + '-' + uuidv4().slice(0, 4);
        const password = this.randomPassword();
        try {
          const user = await this.usersService.createUser({
            username,
            displayName,
            password,
            role: 'operator',
          });
          mapping[m.senderName] = user.id;
          minted.push({ username, password, displayName });
        } catch (err) {
          this.logger.warn(
            `createUser failed for ${m.senderName}: ${(err as Error).message} — anonymising`,
          );
          mapping[m.senderName] = 'anonymous';
        }
        continue;
      }
      mapping[m.senderName] = 'anonymous';
    }

    if (minted.length) this.mintedCredentials.set(jobId, minted);
    job.userMapping = mapping;
    job.status = 'mapping_users' as ImportStage;
    return this.jobRepo.save(job);
  }

  async confirm(jobId: string, dto: ConfirmImportDto): Promise<ImportJob> {
    const started = Date.now();
    const job = await this.findJob(jobId);
    job.status = 'importing' as ImportStage;
    if (dto.chatTitle) job.chatName = dto.chatTitle;
    await this.jobRepo.save(job);

    // 1. Resolve or create a synthetic Session to host the imported chat.
    const session = await this.ensureImportSession(job, dto.sessionId);
    job.sessionId = session.id;

    // 1b. Create an internal Chat (group) that maps 1:1 to this import.
    //     Every mapped user becomes a participant so the chat appears in
    //     their /chat sidebar. Anonymous senders are skipped here — their
    //     messages still get written but with senderId=null (system-like).
    const internalChat = await this.ensureInternalChatForImport(job, dto.chatTitle);

    // 2. Stream ImportedMessage rows into Message rows, copying media as we go.
    const chatId = `imported:${job.id}`;
    let mediaImported = 0;
    let processed = 0;
    const batchSize = 200;
    let cursor = 0;

    while (true) {
      const slice = await this.messageRepo.find({
        where: { importJobId: job.id },
        order: { sequenceIndex: 'ASC' },
        skip: cursor,
        take: batchSize,
      });
      if (slice.length === 0) break;

      const toInsert: Message[] = [];
      for (const im of slice) {
        const mappedUser = job.userMapping?.[im.originalSenderName] ?? 'anonymous';
        const mediaUrl = await this.persistMedia(im, job).catch(err => {
          this.logger.warn(`media copy failed for ${im.id}: ${(err as Error).message}`);
          return null;
        });
        if (mediaUrl) mediaImported++;

        toInsert.push(this.liveMessageRepo.create({
          sessionId: session.id,
          chatId,
          from: im.originalSenderName,
          to: chatId,
          body: im.textContent ?? '',
          type: im.messageType,
          direction: MessageDirection.INCOMING,
          status: MessageStatus.DELIVERED,
          timestamp: dto.preserveTimestamps !== false
            ? Math.floor(new Date(im.originalTimestamp).getTime() / 1000)
            : Math.floor(Date.now() / 1000),
          metadata: {
            imported: true,
            importJobId: job.id,
            originalSenderName: im.originalSenderName,
            mappedUserId: mappedUser,
            mediaFileName: im.mediaFileName,
            mediaStorageUrl: mediaUrl,
            mediaMatched: im.mediaMatched,
            isSystemMessage: im.isSystemMessage,
            sequenceIndex: im.sequenceIndex,
            archived: !!dto.createAsArchived,
          },
        }));
      }
      await this.liveMessageRepo.save(toInsert);

      // Mirror the same batch into the internal Chat so it appears in
      // the WhatsApp-style UI. senderId is null when the participant
      // wasn't mapped to a real user (anonymous) — those render as
      // system messages with the original name in the body.
      const chatMessages: ChatMessage[] = slice.map(im => {
        const mapped = job.userMapping?.[im.originalSenderName] ?? 'anonymous';
        const senderId = mapped !== 'anonymous' && this.isUuid(mapped) ? mapped : null;
        const ts = dto.preserveTimestamps !== false
          ? new Date(im.originalTimestamp)
          : new Date();
        // Hand the chat UI a URL it can use directly. We point at the
        // imported-message media endpoint (which streams via
        // StorageService and accepts JWT *or* API-key after the fix
        // below) so <img>/<audio>/<video> tags load without extra
        // plumbing. Only set this for matched media — unmatched ones
        // surface as placeholders client-side.
        const mediaUrl = im.mediaMatched && im.mediaStoragePath
          ? `/api/import/jobs/${im.importJobId}/media/${im.id}`
          : null;
        return this.chatMsgRepo.create({
          chatId: internalChat.id,
          senderId,
          type: this.toChatType(im.messageType),
          body: senderId
            ? (im.textContent ?? null)
            : this.renderAnonymousBody(im),
          mediaUrl,
          createdAt: ts,
        });
      });
      if (chatMessages.length) await this.chatMsgRepo.save(chatMessages);

      await this.messageRepo
        .createQueryBuilder()
        .update()
        .set({ isImported: true })
        .whereInIds(slice.map(s => s.id))
        .execute();

      processed += slice.length;
      job.processedMessages = processed;
      await this.jobRepo.save(job);

      this.emitProgress(
        jobId,
        'importing',
        Math.min(99, Math.round((processed / Math.max(1, job.totalMessages)) * 100)),
        `imported ${processed} / ${job.totalMessages}`,
        job,
      );
      cursor += slice.length;
    }

    // 3. Best-effort temp cleanup — keep on failure for retry.
    if (job.tempExtractPath) {
      await fs.rm(job.tempExtractPath, { recursive: true, force: true }).catch(() => undefined);
      job.tempExtractPath = null;
    }

    job.status = 'complete' as ImportStage;
    job.matchedMediaFiles = mediaImported;
    const saved = await this.jobRepo.save(job);

    this.gateway.emitComplete({
      jobId,
      chatId,
      summary: {
        totalMessages: job.totalMessages,
        mediaImported,
        mediaOmitted: job.unmatchedMediaFiles,
        participantsCreated: 0,
        participantsMapped: Object.keys(job.userMapping ?? {}).length,
        durationMs: Date.now() - started,
      },
    });
    return saved;
  }

  /**
   * Reuse `dto.sessionId` when supplied; otherwise create (or fetch) a
   * synthetic session that hosts all imported chats from this job. The
   * synthetic session is marked DISCONNECTED — it cannot send live
   * messages, only display imported history.
   */
  private async ensureImportSession(job: ImportJob, requestedSessionId?: string): Promise<Session> {
    if (requestedSessionId) {
      const existing = await this.sessionRepo.findOne({ where: { id: requestedSessionId } });
      if (existing) return existing;
    }
    const name = `imported-${job.id.slice(0, 8)}`;
    const existing = await this.sessionRepo.findOne({ where: { name } });
    if (existing) return existing;
    const created = this.sessionRepo.create({
      name,
      status: SessionStatus.DISCONNECTED,
      config: { imported: true, importJobId: job.id, originalFileName: job.originalFileName },
    });
    return this.sessionRepo.save(created);
  }

  /**
   * Copy a single imported message's media (if matched) into permanent
   * StorageService-backed storage. Returns the storage-relative path,
   * or null if there was nothing to copy.
   *
   * Critical side-effect: replaces `ImportedMessage.mediaStoragePath`
   * with the absolute permanent path so the
   * `GET /api/import/jobs/:id/media/:msg` endpoint keeps working AFTER
   * confirm() wipes the temp extraction dir. Before this fix the
   * column kept pointing at /tmp/openwa-imports-XXX/ which is deleted
   * at the end of confirm — every successful import then 404'd its own
   * media.
   */
  private async persistMedia(im: ImportedMessage, job: ImportJob): Promise<string | null> {
    if (!im.mediaStoragePath || !im.mediaMatched) return null;
    try {
      const data = await fs.readFile(im.mediaStoragePath);
      const ext = path.extname(im.mediaFileName ?? im.mediaStoragePath);
      const target = `imports/${job.id}/${im.id}${ext}`;
      await this.storage.putFile(target, data);

      // Repoint the row at the permanent storage location. We resolve
      // to an absolute on-disk path so the existing controller (which
      // streams from `mediaStoragePath` via createReadStream) works
      // unchanged for STORAGE_TYPE=local. For S3 the absolute path
      // doesn't exist on this box — that's a separate follow-up.
      const localRoot = this.config.get<string>('storage.localPath') || './data/media';
      const absPath = path.resolve(localRoot, target);
      await this.messageRepo.update(im.id, { mediaStoragePath: absPath });
      im.mediaStoragePath = absPath;

      return target;
    } catch (err) {
      this.logger.warn(`could not persist media ${im.mediaStoragePath}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Locate the chat transcript inside an extracted WhatsApp export.
   * WhatsApp names it differently per platform:
   *   - iOS:     `_chat.txt`
   *   - Android: `WhatsApp Chat with <Group>.txt`
   *   - Old:     `<Group>.txt`
   * We try in priority order and only fall through to "any .txt at the
   * archive root that's bigger than a handful of bytes" to avoid
   * picking up incidental notes that ship inside some exports.
   */
  private findChatTranscript(files: string[]): string | null {
    const lower = (p: string) => path.basename(p).toLowerCase();

    // 1. canonical iOS name
    let hit = files.find(f => lower(f) === '_chat.txt');
    if (hit) return hit;

    // 2. Android "WhatsApp Chat with X.txt"
    hit = files.find(f => /^whatsapp chat with .*\.txt$/i.test(path.basename(f)));
    if (hit) return hit;

    // 3. Any other .txt at the archive root that's plausibly a chat
    //    log (anything starting with the WhatsApp timestamp shape).
    const candidates = files.filter(f => lower(f).endsWith('.txt'));
    for (const f of candidates) {
      try {
        const head = require('fs').readFileSync(f, { encoding: 'utf8', flag: 'r' }).slice(0, 512) as string;
        if (/^[\s‎‏]*\[?\s*\d{1,4}[\/\-.]/.test(head)) return f;
      } catch {
        /* unreadable — skip */
      }
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Phase 3 helpers — internal Chat + Users from import
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Find-or-create the internal Chat row for this import job, with every
   * mapped (non-anonymous) user added as a participant. Re-runs are safe:
   * if the chat already exists we just back-fill any missing members.
   */
  private async ensureInternalChatForImport(job: ImportJob, chatTitleOverride?: string): Promise<Chat> {
    let chat = await this.chatRepo.findOne({ where: { importJobId: job.id } });
    if (!chat) {
      chat = await this.chatRepo.save(
        this.chatRepo.create({
          type: 'group',
          name: chatTitleOverride || job.chatName || `Imported chat ${job.id.slice(0, 8)}`,
          importJobId: job.id,
        }),
      );
    } else if (chatTitleOverride && chat.name !== chatTitleOverride) {
      chat.name = chatTitleOverride;
      await this.chatRepo.save(chat);
    }

    const mappedUserIds = Array.from(
      new Set(
        Object.values(job.userMapping ?? {})
          .filter(v => v !== 'anonymous' && this.isUuid(v)),
      ),
    );
    if (mappedUserIds.length === 0) return chat;

    const existing = await this.chatPartRepo.find({ where: { chatId: chat.id } });
    const have = new Set(existing.map(p => p.userId));
    const toAdd = mappedUserIds.filter(id => !have.has(id));
    if (toAdd.length) {
      await this.chatPartRepo.save(
        toAdd.map(uid => this.chatPartRepo.create({
          chatId: chat!.id,
          userId: uid,
          role: 'member',
        })),
      );
    }
    return chat;
  }

  private toChatType(t: string): 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'system' {
    switch (t) {
      case 'image':
      case 'video':
      case 'audio':
      case 'voice':
      case 'document':
        return t;
      case 'sticker':
      case 'gif':
        return 'image';
      case 'system':
      case 'deleted':
      case 'omitted':
        return 'system';
      default:
        return 'text';
    }
  }

  /**
   * For senders that weren't mapped to a real user, surface the
   * original WhatsApp display name so the bubble still carries context
   * (rendered as a system-style bubble client-side).
   */
  private renderAnonymousBody(im: ImportedMessage): string {
    const name = im.originalSenderName || 'unknown';
    const body = im.textContent ?? (im.mediaFileName ? `[${im.messageType}] ${im.mediaFileName}` : `[${im.messageType}]`);
    return `${name}: ${body}`;
  }

  private isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  private slugify(name: string): string {
    const ascii = name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    // Fall back to "user" if the name had no ASCII letters (e.g. pure Arabic).
    return (ascii || 'user').slice(0, 24);
  }

  private randomPassword(): string {
    // 12 chars from a URL-safe alphabet. ~71 bits of entropy.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    const buf = require('crypto').randomBytes(12) as Buffer;
    for (let i = 0; i < 12; i++) out += alphabet[buf[i] % alphabet.length];
    return out;
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
