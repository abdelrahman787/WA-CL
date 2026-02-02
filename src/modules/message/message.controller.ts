import { Controller, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MessageService } from './message.service';
import {
  SendTextMessageDto,
  SendMediaMessageDto,
  MessageResponseDto,
} from './dto';

@ApiTags('messages')
@Controller('sessions/:sessionId/messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post('send-text')
  @ApiOperation({ summary: 'Send a text message' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 201,
    description: 'Message sent',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session not active or invalid request',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async sendText(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendTextMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messageService.sendText(sessionId, dto);
  }

  @Post('send-image')
  @ApiOperation({ summary: 'Send an image message' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 201,
    description: 'Image sent',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session not active or invalid request',
  })
  async sendImage(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messageService.sendImage(sessionId, dto);
  }

  @Post('send-video')
  @ApiOperation({ summary: 'Send a video message' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 201,
    description: 'Video sent',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session not active or invalid request',
  })
  async sendVideo(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messageService.sendVideo(sessionId, dto);
  }

  @Post('send-audio')
  @ApiOperation({ summary: 'Send an audio/voice message' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 201,
    description: 'Audio sent',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session not active or invalid request',
  })
  async sendAudio(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messageService.sendAudio(sessionId, dto);
  }

  @Post('send-document')
  @ApiOperation({ summary: 'Send a document/file' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 201,
    description: 'Document sent',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Session not active or invalid request',
  })
  async sendDocument(
    @Param('sessionId') sessionId: string,
    @Body() dto: SendMediaMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messageService.sendDocument(sessionId, dto);
  }
}
