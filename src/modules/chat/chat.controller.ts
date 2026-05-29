import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { Public } from '../auth/decorators/auth.decorators';

type AuthedReq = Request & { user: { id: string } };

@ApiTags('chat')
@Public()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get('chats')
  @ApiOperation({ summary: 'List my chats with last message + unread count' })
  async myChats(@Req() req: AuthedReq) {
    return this.chat.listChatsForUser(req.user.id);
  }

  @Post('chats')
  @ApiOperation({ summary: 'Create a direct or group chat' })
  async create(@Req() req: AuthedReq, @Body() dto: CreateChatDto) {
    return this.chat.createChat(req.user.id, dto);
  }

  @Get('chats/:chatId')
  async getChat(@Req() req: AuthedReq, @Param('chatId') chatId: string) {
    await this.chat.assertMember(chatId, req.user.id);
    const chat = await this.chat.findChat(chatId);
    const participants = await this.chat.listParticipants(chatId);
    return { ...chat, participants };
  }

  @Get('chats/:chatId/messages')
  @ApiOperation({ summary: 'Paginated message history' })
  async messages(
    @Req() req: AuthedReq,
    @Param('chatId') chatId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    await this.chat.assertMember(chatId, req.user.id);
    return this.chat.listMessages(chatId, page ?? 1, pageSize ?? 50);
  }

  @Post('chats/:chatId/messages')
  @ApiOperation({ summary: 'Send a message; also broadcast over WebSocket' })
  async send(
    @Req() req: AuthedReq,
    @Param('chatId') chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    const msg = await this.chat.sendMessage(chatId, req.user.id, dto);
    this.gateway.emitNewMessage(chatId, msg);
    return msg;
  }

  @Post('chats/:chatId/read')
  @ApiOperation({ summary: 'Mark all messages up to now as read' })
  async read(@Req() req: AuthedReq, @Param('chatId') chatId: string) {
    await this.chat.assertMember(chatId, req.user.id);
    await this.chat.markRead(chatId, req.user.id);
    this.gateway.emitRead(chatId, req.user.id);
    return { ok: true };
  }
}
