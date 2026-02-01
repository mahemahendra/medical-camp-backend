import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from 'typeorm';
import { Camp } from './Camp';
import { Visit } from './Visit';

/**
 * Visitor entity - represents someone registered for a medical camp
 * Scoped by camp_id - same person can register for multiple camps
 */
@Entity('visitors')
export class Visitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Camp, camp => camp.visitors)
  camp: Camp;

  @Column()
  campId: string;

  // Unique patient ID within this camp (e.g., "MC2024-0001")
  @Column()
  patientIdPerCamp: string;

  @Column()
  name: string;

  @Column()
  phone: string;

  @Column({ type: 'int' })
  age: number;

  @Column()
  gender: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'text', nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  district: string;

  @Column({ type: 'text', nullable: true })
  symptoms: string;

  @Column({ type: 'text', nullable: true })
  existingConditions: string;

  @Column({ type: 'text', nullable: true })
  allergies: string;

  // QR code data (base64 or URL)
  @Column({ type: 'text', nullable: true })
  qrCode: string;

  // Telegram chat ID for sending notifications
  // Users must message the bot first to get their chat ID
  @Column({ type: 'text', nullable: true, name: 'telegram_chat_id' })
  telegramChatId: string;

  @OneToMany(() => Visit, visit => visit.visitor)
  visits: Visit[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
