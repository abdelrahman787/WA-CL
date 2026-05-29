import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ChatType = 'direct' | 'group';

@Entity('chats')
export class Chat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  type: ChatType;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  /**
   * Optional link back to an ImportJob — used by Phase 3 so an imported
   * WhatsApp group shows up in the user's sidebar as a read-only chat.
   */
  @Column({ type: 'uuid', nullable: true })
  importJobId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
