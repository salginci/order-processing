import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  recipient: string;

  @Column('text')
  message: string;

  @Column('varchar')
  channel: string;

  @Column('varchar')
  status: string;

  @CreateDateColumn()
  created_at: Date;
} 