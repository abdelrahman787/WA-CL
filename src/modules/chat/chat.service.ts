import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Chat } from './entities/chat.entity';
import { ChatParticipant } from './entities/chat-participant.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { CreateChatDto } from './dto/create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat, 'data')
    private readonly chatRepo: Repository<Chat>,
    @InjectRepository(ChatParticipant, 'data')
    private readonly partRepo: Repository<ChatParticipant>,
    @InjectRepository(ChatMessage, 'data')
    private readonly msgRepo: Repository<ChatMessage>,
  ) {}

  async createChat(creatorId: string, dto: CreateChatDto): Promise<Chat> {
    if (dto.type === 'group' && !dto.name) {
      throw new BadRequestException('group chats need a name');
    }

    // For 1:1 chats, reuse an existing direct chat between the same pair.
    if (dto.type === 'direct') {
      if (dto.participantIds.length !== 1) {
        throw new BadRequestException('direct chats must have exactly one other participant');
      }
      const otherId = dto.participantIds[0];
      const existing = await this.findDirectBetween(creatorId, otherId);
      if (existing) return existing;
    }

    const chat = await this.chatRepo.save(
      this.chatRepo.create({
        type: dto.type,
        name: dto.name ?? null,
        createdById: creatorId,
      }),
    );

    const ids = Array.from(new Set([creatorId, ...dto.participantIds]));
    const participants = ids.map(uid =>
      this.partRepo.create({
        chatId: chat.id,
        userId: uid,
        role: uid === creatorId && dto.type === 'group' ? 'admin' : 'member',
      }),
    );
    await this.partRepo.save(participants);
    return chat;
  }

  async listChatsForUser(userId: string) {
    const rows = await this.partRepo.find({ where: { userId } });
    if (rows.length === 0) return [];
    const chatIds = rows.map(r => r.chatId);
    const chats = await this.chatRepo.findByIds(chatIds);

    // Bulk-load every participant row for this user's chats so the
    // client can resolve direct-chat titles (the "other user") without
    // an extra fetch per chat.
    const allParts = await this.partRepo.find({ where: { chatId: In(chatIds) } });
    const byChat = new Map<string, string[]>();
    for (const p of allParts) {
      const list = byChat.get(p.chatId) ?? [];
      list.push(p.userId);
      byChat.set(p.chatId, list);
    }

    // Attach last message + unread count + participant ids for each chat.
    return Promise.all(chats.map(async chat => {
      const last = await this.msgRepo.findOne({
        where: { chatId: chat.id },
        order: { createdAt: 'DESC' },
      });
      const me = rows.find(r => r.chatId === chat.id);
      const unread = me?.lastReadAt
        ? await this.msgRepo
            .createQueryBuilder('m')
            .where('m.chatId = :cid', { cid: chat.id })
            .andWhere('m.createdAt > :ts', { ts: me.lastReadAt })
            .getCount()
        : await this.msgRepo.count({ where: { chatId: chat.id } });

      return {
        ...chat,
        lastMessage: last,
        unreadCount: unread,
        participantIds: byChat.get(chat.id) ?? [],
      };
    }));
  }

  async assertMember(chatId: string, userId: string): Promise<ChatParticipant> {
    const p = await this.partRepo.findOne({ where: { chatId, userId } });
    if (!p) throw new ForbiddenException('not a member of this chat');
    return p;
  }

  /**
   * Like assertMember, but admins are always allowed through. Used by
   * read endpoints (list messages, get chat) so admins can audit any
   * chat without being a participant.
   */
  async assertMemberOrAdmin(chatId: string, userId: string, role: string): Promise<void> {
    if (role === 'admin') {
      // Verify the chat exists; we don't need a participant row.
      const chat = await this.chatRepo.findOne({ where: { id: chatId } });
      if (!chat) throw new NotFoundException('chat not found');
      return;
    }
    await this.assertMember(chatId, userId);
  }

  /** Admin-only: every chat in the system. */
  async listAllChats() {
    const chats = await this.chatRepo.find({ order: { updatedAt: 'DESC' } });
    return Promise.all(chats.map(async chat => {
      const last = await this.msgRepo.findOne({ where: { chatId: chat.id }, order: { createdAt: 'DESC' } });
      const participantCount = await this.partRepo.count({ where: { chatId: chat.id } });
      return { ...chat, lastMessage: last, participantCount };
    }));
  }

  async addParticipants(chatId: string, userIds: string[]): Promise<ChatParticipant[]> {
    const chat = await this.findChat(chatId);
    if (chat.type === 'direct') {
      throw new BadRequestException('cannot add participants to a direct chat');
    }
    const existing = await this.partRepo.find({ where: { chatId } });
    const have = new Set(existing.map(p => p.userId));
    const fresh = Array.from(new Set(userIds)).filter(id => !have.has(id));
    if (fresh.length === 0) return [];
    return this.partRepo.save(
      fresh.map(uid => this.partRepo.create({ chatId, userId: uid, role: 'member' })),
    );
  }

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const chat = await this.findChat(chatId);
    if (chat.type === 'direct') {
      throw new BadRequestException('cannot remove participants from a direct chat');
    }
    await this.partRepo.delete({ chatId, userId });
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.msgRepo.delete({ chatId });
    await this.partRepo.delete({ chatId });
    await this.chatRepo.delete({ id: chatId });
  }

  async deleteMessage(messageId: string): Promise<void> {
    // Soft-delete: keep the row so other clients see the deletion event,
    // but blank the body and stamp deletedAt.
    await this.msgRepo.update(messageId, { deletedAt: new Date(), body: null, mediaUrl: null });
  }

  async listParticipants(chatId: string) {
    return this.partRepo.find({ where: { chatId } });
  }

  async listMessages(chatId: string, page = 1, pageSize = 50) {
    const [items, total] = await this.msgRepo.findAndCount({
      where: { chatId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async sendMessage(chatId: string, senderId: string, dto: SendMessageDto): Promise<ChatMessage> {
    await this.assertMember(chatId, senderId);
    const msg = this.msgRepo.create({
      chatId,
      senderId,
      type: dto.type ?? 'text',
      body: dto.body,
      replyToId: dto.replyToId ?? null,
      mediaUrl: dto.mediaUrl ?? null,
    });
    return this.msgRepo.save(msg);
  }

  async markRead(chatId: string, userId: string, upTo?: Date): Promise<void> {
    await this.partRepo.update({ chatId, userId }, { lastReadAt: upTo ?? new Date() });
  }

  async findChat(chatId: string): Promise<Chat> {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('chat not found');
    return chat;
  }

  private async findDirectBetween(a: string, b: string): Promise<Chat | null> {
    const rows = await this.partRepo
      .createQueryBuilder('p')
      .innerJoin(Chat, 'c', 'c.id = p.chatId')
      .where('c.type = :t', { t: 'direct' })
      .andWhere('p.userId IN (:...ids)', { ids: [a, b] })
      .getMany();
    const byChat = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!byChat.has(r.chatId)) byChat.set(r.chatId, new Set());
      byChat.get(r.chatId)!.add(r.userId);
    }
    for (const [chatId, members] of byChat) {
      if (members.size === 2 && members.has(a) && members.has(b)) {
        return this.chatRepo.findOne({ where: { id: chatId } });
      }
    }
    return null;
  }
}
