import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export type ChatMessageType = 'text' | 'image' | 'video' | 'audio' | 'voice' | 'document' | 'system';

@Entity('chat_messages')
@Index(['chatId', 'createdAt'])
@Index(['senderId'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  chatId: string;

  @Column({ type: 'uuid', nullable: true })
  senderId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'text' })
  type: ChatMessageType;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  mediaUrl: string | null;

  @Column({ type: 'uuid', nullable: true })
  replyToId: string | null;

  @Column({ type: 'datetime', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
