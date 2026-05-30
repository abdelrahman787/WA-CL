import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

type AuthedReq = Request & { user: { id: string; role: string } };

const requireAdmin = (req: AuthedReq) => {
  if (req.user.role !== 'admin') throw new ForbiddenException('admin only');
};

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
    await this.chat.assertMemberOrAdmin(chatId, req.user.id, req.user.role);
    const chat = await this.chat.findChat(chatId);
    const participants = await this.chat.listParticipants(chatId);
    return { ...chat, participants };
  }

  @Get('chats/:chatId/messages')
  @ApiOperation({ summary: 'Paginated message history (admins can read any chat)' })
  async messages(
    @Req() req: AuthedReq,
    @Param('chatId') chatId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    await this.chat.assertMemberOrAdmin(chatId, req.user.id, req.user.role);
    return this.chat.listMessages(chatId, page ?? 1, pageSize ?? 50);
  }

  // ───── Admin-only endpoints ─────

  @Get('admin/chats')
  @ApiOperation({ summary: 'List every chat in the system (admin only)' })
  adminListAllChats(@Req() req: AuthedReq) {
    requireAdmin(req);
    return this.chat.listAllChats();
  }

  @Post('admin/chats/:chatId/participants')
  @ApiOperation({ summary: 'Add participants to a group chat (admin only)' })
  async adminAddParticipants(
    @Req() req: AuthedReq,
    @Param('chatId') chatId: string,
    @Body() body: { userIds: string[] },
  ) {
    requireAdmin(req);
    return this.chat.addParticipants(chatId, body.userIds ?? []);
  }

  @Delete('admin/chats/:chatId/participants/:userId')
  @ApiOperation({ summary: 'Remove a participant from a group (admin only)' })
  async adminRemoveParticipant(
    @Req() req: AuthedReq,
    @Param('chatId') chatId: string,
    @Param('userId') userId: string,
  ) {
    requireAdmin(req);
    await this.chat.removeParticipant(chatId, userId);
    return { ok: true };
  }

  @Delete('admin/chats/:chatId')
  @ApiOperation({ summary: 'Delete a chat and all its messages (admin only)' })
  async adminDeleteChat(@Req() req: AuthedReq, @Param('chatId') chatId: string) {
    requireAdmin(req);
    await this.chat.deleteChat(chatId);
    return { ok: true };
  }

  @Delete('admin/messages/:messageId')
  @ApiOperation({ summary: 'Soft-delete any message (admin only)' })
  async adminDeleteMessage(@Req() req: AuthedReq, @Param('messageId') messageId: string) {
    requireAdmin(req);
    await this.chat.deleteMessage(messageId);
    return { ok: true };
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
