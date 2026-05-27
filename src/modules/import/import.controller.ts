import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { ImportService } from './import.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { MapUsersDto } from './dto/user-mapping.dto';

/**
 * NOTE: the file upload endpoint expects a `multipart/form-data` body
 * with field name `file`. We rely on the host's body parser (Multer is
 * not yet wired — install + `FilesInterceptor` is on the deferred list).
 * Until then, callers must POST a JSON `{ filePath, originalName, size }`
 * pointing to a server-readable path. Marked `@deprecated` so it's clear
 * in Swagger.
 */
@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a WhatsApp chat export (RAR/ZIP)',
    description:
      'Multer is not yet wired in this skeleton — accept a JSON pointer for now. ' +
      'See docs/windows/PLAN.md for the FilesInterceptor TODO.',
  })
  async upload(@Body() body: { filePath: string; originalName: string; size: number; sessionId?: string }) {
    const job = await this.importService.createJob(
      { path: body.filePath, originalname: body.originalName, size: body.size },
      body.sessionId,
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
  cancel(@Param('jobId') jobId: string, @Req() _req: Request) {
    return this.importService.cancel(jobId);
  }
}
