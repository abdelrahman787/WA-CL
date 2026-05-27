import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import type { ImportedMessageType } from '../interfaces/parsed-message.interface';

@Entity('imported_messages')
@Index(['importJobId', 'sequenceIndex'])
export class ImportedMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  importJobId: string;

  @Column({ type: 'varchar', length: 256 })
  originalSenderName: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mappedUserId: string | null;

  @Column({ type: 'datetime' })
  originalTimestamp: Date;

  @Column({ type: 'varchar', length: 16 })
  messageType: ImportedMessageType;

  @Column({ type: 'text', nullable: true })
  textContent: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  mediaFileName: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  mediaStoragePath: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mediaMimeType: string | null;

  @Column({ type: 'int', nullable: true })
  mediaFileSize: number | null;

  @Column({ type: 'boolean', default: false })
  mediaMatched: boolean;

  @Column({ type: 'int' })
  sequenceIndex: number;

  @Column({ type: 'boolean', default: false })
  isSystemMessage: boolean;

  @Column({ type: 'int', nullable: true })
  replyToIndex: number | null;

  @Column({ type: 'boolean', default: false })
  isImported: boolean;
}
