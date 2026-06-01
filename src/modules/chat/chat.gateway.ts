import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { ChatMessage } from './entities/chat-message.entity';

const roomFor = (chatId: string) => `chat:${chatId}`;
const COOKIE_NAME = 'owa_jwt';

interface SocketWithUser extends Socket {
  data: { userId?: string; username?: string };
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  /** userId -> Set of socket ids currently connected for that user. */
  private readonly online = new Map<string, Set<string>>();

  constructor(private readonly jwt: JwtService) {}

  handleConnection(socket: SocketWithUser) {
    const token = this.extractToken(socket);
    if (!token) {
      socket.emit('error', { message: 'unauthenticated' });
      socket.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<{ sub: string; username: string }>(token);
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      const set = this.online.get(payload.sub) ?? new Set();
      const wasOffline = set.size === 0;
      set.add(socket.id);
      this.online.set(payload.sub, set);
      if (wasOffline) this.server.emit('presence', { userId: payload.sub, online: true });
    } catch {
      socket.emit('error', { message: 'invalid token' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: SocketWithUser) {
    const uid = socket.data.userId;
    if (!uid) return;
    const set = this.online.get(uid);
    if (!set) return;
    set.delete(socket.id);
    if (set.size === 0) {
      this.online.delete(uid);
      this.server.emit('presence', { userId: uid, online: false });
    }
  }

  @SubscribeMessage('subscribe')
  onSubscribe(@ConnectedSocket() socket: SocketWithUser, @MessageBody() body: { chatId: string }) {
    if (!socket.data.userId) return { ok: false };
    void socket.join(roomFor(body.chatId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(@ConnectedSocket() socket: SocketWithUser, @MessageBody() body: { chatId: string }) {
    void socket.leave(roomFor(body.chatId));
    return { ok: true };
  }

  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() socket: SocketWithUser, @MessageBody() body: { chatId: string; isTyping: boolean }) {
    if (!socket.data.userId) return;
    socket.to(roomFor(body.chatId)).emit('typing', {
      chatId: body.chatId,
      userId: socket.data.userId,
      isTyping: body.isTyping,
    });
  }

  emitNewMessage(chatId: string, message: ChatMessage): void {
    this.server.to(roomFor(chatId)).emit('message:new', { chatId, message });
  }

  /**
   * Tell every online participant of a freshly-created chat that they
   * should add it to their sidebar. We can't broadcast to the chat
   * room because nobody has subscribed to it yet — we walk the
   * presence map and emit one targeted event per online user instead.
   */
  emitChatCreated(participantIds: string[], chat: unknown): void {
    for (const uid of participantIds) {
      const sockets = this.online.get(uid);
      if (!sockets) continue;
      for (const sid of sockets) {
        this.server.to(sid).emit('chat:created', chat);
      }
    }
  }

  emitRead(chatId: string, userId: string): void {
    this.server.to(roomFor(chatId)).emit('message:read', { chatId, userId, at: new Date().toISOString() });
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  private extractToken(socket: SocketWithUser): string | null {
    const auth = socket.handshake.auth as { token?: string };
    if (auth?.token) return auth.token;
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return null;
    const m = cookie.split(/;\s*/).find(c => c.startsWith(COOKIE_NAME + '='));
    return m ? decodeURIComponent(m.slice(COOKIE_NAME.length + 1)) : null;
  }
}
