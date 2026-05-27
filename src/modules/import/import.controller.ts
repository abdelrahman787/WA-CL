import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { promises as fs, createReadStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as mime from 'mime-types';

import { ImportService } from './import.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { MapUsersDto } from './dto/user-mapping.dto';
import { ImportedMessage } from './entities/imported-message.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'imports', 'uploads');
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const ACCEPTED_EXT = /\.(zip|rar)$/i;

@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    @InjectRepository(ImportedMessage, 'data')
    private readonly importedMessageRepo: Repository<ImportedMessage>,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a WhatsApp chat export (RAR/ZIP)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string', nullable: true },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdir(UPLOAD_DIR, { recursive: true })
            .then(() => cb(null, UPLOAD_DIR))
            .catch(err => cb(err, UPLOAD_DIR));
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.zip';
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ACCEPTED_EXT.test(file.originalname)) {
          cb(new Error('Only .zip or .rar archives are accepted'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('sessionId') sessionId?: string,
  ) {
    if (!file) throw new NotFoundException('no file uploaded');
    const job = await this.importService.createJob(
      { path: file.path, originalname: file.originalname, size: file.size },
      sessionId,
    );
    return { jobId: job.id, status: job.status };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List all import jobs' })
  list() {
    return this.importService.listJobs();
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get import job status + stats' })
  get(@Param('jobId') jobId: string) {
    return this.importService.findJob(jobId);
  }

  @Get('jobs/:jobId/preview')
  @ApiOperation({ summary: 'Paginated parsed-message preview' })
  preview(
    @Param('jobId') jobId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.importService.preview(jobId, page ?? 1, pageSize ?? 50);
  }

  @Get('jobs/:jobId/participants')
  @ApiOperation({ summary: 'List detected participants with counts' })
  participants(@Param('jobId') jobId: string) {
    return this.importService.getParticipants(jobId);
  }

  @Post('jobs/:jobId/map-users')
  @HttpCode(200)
  @ApiOperation({ summary: 'Map detected sender names to system users' })
  mapUsers(@Param('jobId') jobId: string, @Body() dto: MapUsersDto) {
    return this.importService.mapUsers(jobId, dto);
  }

  @Post('jobs/:jobId/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Commit the parsed chat into the live chat tables' })
  confirm(@Param('jobId') jobId: string, @Body() dto: ConfirmImportDto) {
    return this.importService.confirm(jobId, dto);
  }

  @Delete('jobs/:jobId')
  @ApiOperation({ summary: 'Cancel job and clean up temp files' })
  cancel(@Param('jobId') jobId: string) {
    return this.importService.cancel(jobId);
  }

  @Get('jobs/:jobId/media/:messageId')
  @ApiOperation({
    summary: 'Stream the matched media file for an imported message',
    description:
      'Returns the binary content of the media that was matched for this imported message. ' +
      'Used by the preview UI for inline thumbnails.',
  })
  async media(
    @Param('jobId') jobId: string,
    @Param('messageId') messageId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const row = await this.importedMessageRepo.findOne({
      where: { id: messageId, importJobId: jobId },
    });
    if (!row || !row.mediaStoragePath) {
      throw new NotFoundException('media not found for this message');
    }
    // Guard against path traversal: must live inside data/ or os.tmpdir().
    const abs = path.resolve(row.mediaStoragePath);
    const allowed = [
      path.resolve(process.cwd(), 'data'),
      path.resolve(os.tmpdir()),
    ];
    if (!allowed.some(root => abs.startsWith(root + path.sep) || abs === root)) {
      throw new NotFoundException('media path outside permitted roots');
    }
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException('media file missing on disk');
    }
    const mimeType = row.mediaMimeType
      || (mime.lookup(row.mediaFileName ?? abs) || 'application/octet-stream');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(abs).pipe(res);
  }
}
