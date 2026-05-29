import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export type ParticipantRole = 'admin' | 'member';

@Entity('chat_participants')
@Index(['chatId', 'userId'], { unique: true })
@Index(['userId'])
export class ChatParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  chatId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'member' })
  role: ParticipantRole;

  @Column({ type: 'datetime', nullable: true })
  lastReadAt: Date | null;

  @CreateDateColumn()
  joinedAt: Date;
}
