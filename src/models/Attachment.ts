import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { Camp } from './Camp';
import { Visit } from './Visit';
import { Consultation } from './Consultation';

export enum AttachmentType {
  LAB_REPORT = 'LAB_REPORT',
  PRESCRIPTION = 'PRESCRIPTION',
  DOCUMENT = 'DOCUMENT',
  IMAGE = 'IMAGE'
}

/**
 * Attachment entity - stores uploaded files (reports, images, etc.)
 * Scoped by camp_id
 */
@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Camp)
  camp!: Camp;

  @Column()
  campId!: string;

  @ManyToOne(() => Visit)
  visit!: Visit;

  @Column()
  visitId!: string;

  @ManyToOne(() => Consultation, consultation => consultation.attachments)
  consultation!: Consultation;

  @Column({ nullable: true })
  consultationId!: string;

  @Column()
  fileUrl!: string;

  @Column()
  fileName!: string;

  @Column({ type: 'enum', enum: AttachmentType })
  type!: AttachmentType;

  @Column({ type: 'bigint' })
  fileSize!: number;

  @Column()
  mimeType!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
