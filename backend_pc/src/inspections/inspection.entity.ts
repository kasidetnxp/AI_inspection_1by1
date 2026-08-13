import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  wafer_id: string;

  @Column()
  timestamp: string;

  @Column({ default: 'PASS' })
  decision: string;

  @Column({ default: 1 })
  padsTotal: number;

  @Column({ default: 1 })
  padsDetected: number;

  @Column({ default: 0 })
  probeMarks: number;

  @Column({ default: 0 })
  grains: number;

  @Column('float', { default: 95.0 })
  confidence: number;

  @Column('float', { default: 0.0 })
  inferenceTime: number;

  @Column('float', { default: 0.0 })
  ruleTime: number;

  @Column({ default: 'CONTINUE PROCESS' })
  machineAction: string;

  @Column({ default: '-' })
  reason: string;

  @Column({ nullable: true })
  imageUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
