import { Injectable, BadRequestException } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import {
  SendTextMessageDto,
  SendMediaMessageDto,
  MessageResponseDto,
} from './dto';
import { MediaInput } from '../../engine/interfaces/whatsapp-engine.interface';

@Injectable()
export class MessageService {
  constructor(private readonly sessionService: SessionService) {}

  async sendText(
    sessionId: string,
    dto: SendTextMessageDto,
  ): Promise<MessageResponseDto> {
    const engine = this.getEngine(sessionId);
    const result = await engine.sendTextMessage(dto.chatId, dto.text);

    return {
      messageId: result.id,
      timestamp: result.timestamp,
    };
  }

  async sendImage(
    sessionId: string,
    dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    const engine = this.getEngine(sessionId);
    const media = this.buildMediaInput(dto);
    const result = await engine.sendImageMessage(dto.chatId, media);

    return {
      messageId: result.id,
      timestamp: result.timestamp,
    };
  }

  async sendVideo(
    sessionId: string,
    dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    const engine = this.getEngine(sessionId);
    const media = this.buildMediaInput(dto);
    const result = await engine.sendVideoMessage(dto.chatId, media);

    return {
      messageId: result.id,
      timestamp: result.timestamp,
    };
  }

  async sendAudio(
    sessionId: string,
    dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    const engine = this.getEngine(sessionId);
    const media = this.buildMediaInput(dto);
    const result = await engine.sendAudioMessage(dto.chatId, media);

    return {
      messageId: result.id,
      timestamp: result.timestamp,
    };
  }

  async sendDocument(
    sessionId: string,
    dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    const engine = this.getEngine(sessionId);
    const media = this.buildMediaInput(dto);
    const result = await engine.sendDocumentMessage(dto.chatId, media);

    return {
      messageId: result.id,
      timestamp: result.timestamp,
    };
  }

  private getEngine(sessionId: string) {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new BadRequestException(
        `Session '${sessionId}' is not active. Start the session first.`,
      );
    }
    return engine;
  }

  private buildMediaInput(dto: SendMediaMessageDto): MediaInput {
    if (!dto.url && !dto.base64) {
      throw new BadRequestException('Either url or base64 must be provided');
    }

    if (dto.base64 && !dto.mimetype) {
      throw new BadRequestException(
        'mimetype is required when using base64 data',
      );
    }

    return {
      mimetype: dto.mimetype || 'application/octet-stream',
      data: dto.url || dto.base64!,
      filename: dto.filename,
      caption: dto.caption,
    };
  }
}
