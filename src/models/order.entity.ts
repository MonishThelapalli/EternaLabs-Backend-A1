import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type OrderStatus = 'pending' | 'routing' | 'building' | 'submitted' | 'confirmed' | 'failed';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  orderType!: string;

  @Column({ type: 'text' })
  tokenIn!: string;

  @Column({ type: 'text' })
  tokenOut!: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount!: string;

  @Column({ type: 'float', default: 0 })
  slippage!: number;

  @Column({ type: 'text', default: 'pending' })
  status!: OrderStatus;

  @Column({ type: 'text', nullable: true })
  txHash?: string | null;

  @Column({ type: 'json', nullable: true })
  quotes?: any;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
