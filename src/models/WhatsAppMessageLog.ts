import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Camp } from './Camp';
import { Visitor } from './Visitor';

export enum MessageType {
  REGISTRATION = 'REGISTRATION',
  POST_CONSULTATION = 'POST_CONSULTATION',
  CONSULTATION_COMPLETE = 'CONSULTATION_COMPLETE',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  CUSTOM = 'CUSTOM'
}

export enum MessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED'
}

/**
 * WhatsAppMessageLog entity - tracks WhatsApp messages sent to visitors
 * Scoped by camp_id
 */
@Entity('whatsapp_message_logs')
export class WhatsAppMessageLog {
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

  @Column({ type: 'enum', enum: MessageType })
  type: MessageType;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: MessageStatus, default: MessageStatus.PENDING })
  status: MessageStatus;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
