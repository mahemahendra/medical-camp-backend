import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Unique } from 'typeorm';
import { Camp } from './Camp';
import { Visitor } from './Visitor';
import { User } from './User';

export enum FollowUpStatus {
  INTERESTED = 'INTERESTED',
  NOT_INTERESTED = 'NOT_INTERESTED',
  FOLLOW_UP_REQUIRED = 'FOLLOW_UP_REQUIRED',
  FOLLOW_UP_NOT_REQUIRED = 'FOLLOW_UP_NOT_REQUIRED',
  COMPLETED = 'COMPLETED',
  NO_RESPONSE = 'NO_RESPONSE'
}

/**
 * FollowUp entity - tracks post-consultation follow-up calls by Sales users
 * One entry per visitor per camp (upserted on subsequent calls)
 * Scoped by camp_id for tenant isolation
 */
@Entity('follow_ups')
@Unique(['campId', 'visitorId'])
export class FollowUp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Camp)
  camp: Camp;

  @Column()
  campId: string;

  @ManyToOne(() => Visitor)
  visitor: Visitor;

  @Column()
  visitorId: string;

  @ManyToOne(() => User)
  salesUser: User;

  @Column()
  salesUserId: string;

  @Column({ type: 'enum', enum: FollowUpStatus })
  status: FollowUpStatus;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({ type: 'timestamp', nullable: true })
  calledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
