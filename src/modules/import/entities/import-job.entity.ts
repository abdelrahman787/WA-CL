import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';
import type { ImportStage } from '../interfaces/import-progress.interface';

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 512 })
  originalFileName: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  chatName: string | null;

  @Column({ type: 'int', default: 0 })
  totalMessages: number;

  @Column({ type: 'int', default: 0 })
  processedMessages: number;

  @Column({ type: 'int', default: 0 })
  totalMediaFiles: number;

  @Column({ type: 'int', default: 0 })
  matchedMediaFiles: number;

  @Column({ type: 'int', default: 0 })
  unmatchedMediaFiles: number;

  @Column({ type: 'varchar', length: 32 })
  status: ImportStage;

  @Column({ type: jsonColumnType(), nullable: true })
  detectedParticipants: string[] | null;

  @Column({ type: jsonColumnType(), nullable: true })
  userMapping: Record<string, string> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  errorDetails: unknown | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  tempExtractPath: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sessionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
