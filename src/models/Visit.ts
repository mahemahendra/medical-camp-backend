import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToOne, OneToMany } from 'typeorm';
import { Camp } from './Camp';
import { Visitor } from './Visitor';
import { User } from './User';
import { Consultation } from './Consultation';
import { Attachment } from './Attachment';

export enum VisitStatus {
  REGISTERED = 'REGISTERED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

/**
 * Visit entity - represents a visitor's consultation session
 * Scoped by camp_id
 */
@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Camp)
  camp: Camp;

  @Column()
  campId: string;

  @ManyToOne(() => Visitor, visitor => visitor.visits)
  visitor: Visitor;

  @Column()
  visitorId: string;

  @ManyToOne(() => User)
  doctor: User;

  @Column({ nullable: true })
  doctorId: string;

  @Column({ type: 'enum', enum: VisitStatus, default: VisitStatus.REGISTERED })
  status: VisitStatus;

  @Column({ type: 'timestamp', nullable: true })
  consultationTime: Date;

  @OneToOne(() => Consultation, consultation => consultation.visit)
  consultation: Consultation;

  @OneToMany(() => Attachment, attachment => attachment.visit)
  attachments: Attachment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
