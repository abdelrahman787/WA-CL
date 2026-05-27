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
import { Server, Socket } from 'socket.io';
import type {
  ImportCompleteEvent,
  ImportErrorEvent,
  ImportProgressEvent,
} from './interfaces/import-progress.interface';

const roomFor = (jobId: string) => `import:${jobId}`;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/import',
})
export class ImportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ImportGateway.name);

  handleConnection(socket: Socket) {
    this.logger.debug(`socket ${socket.id} connected`);
  }

  handleDisconnect(socket: Socket) {
    this.logger.debug(`socket ${socket.id} disconnected`);
  }

  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { jobId: string },
  ): { ok: true } {
    void socket.join(roomFor(body.jobId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { jobId: string },
  ): { ok: true } {
    void socket.leave(roomFor(body.jobId));
    return { ok: true };
  }

  emitProgress(event: ImportProgressEvent): void {
    this.server.to(roomFor(event.jobId)).emit('progress', event);
  }

  emitComplete(event: ImportCompleteEvent): void {
    this.server.to(roomFor(event.jobId)).emit('complete', event);
  }

  emitError(event: ImportErrorEvent): void {
    this.server.to(roomFor(event.jobId)).emit('error', event);
  }
}
