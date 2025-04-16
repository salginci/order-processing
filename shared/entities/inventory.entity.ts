import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  product_id: string;

  @Column('int')
  quantity: number;

  @Column('varchar')
  status: string;

  @UpdateDateColumn()
  last_updated: Date;
} 