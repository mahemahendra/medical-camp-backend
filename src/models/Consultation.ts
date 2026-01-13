import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Visit } from './Visit';
import { Attachment } from './Attachment';

/**
 * Prescription interface for type safety
 */
export interface Prescription {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

/**
 * Medical Record interface for capturing test results and medical data
 */
export interface MedicalRecord {
  category: string;    // vitals, lab, imaging, measurement, assessment, other
  title: string;       // e.g., Blood Pressure, Hemoglobin
  value: string;       // e.g., 120/80, 12.5
  unit: string;        // e.g., mmHg, g/dL
  normalRange: string; // e.g., 90-140/60-90
  notes: string;       // Additional observations
  recordDate: string;  // Date when record was taken
}

/**
 * Consultation entity - stores doctor's notes and diagnosis for a visit
 */
@Entity('consultations')
export class Consultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Visit, visit => visit.consultation)
  @JoinColumn()
  visit: Visit;

  @Column()
  visitId: string;

  @Column({ type: 'text' })
  chiefComplaints: string;

  @Column({ type: 'text', nullable: true })
  clinicalNotes: string;

  @Column({ type: 'text' })
  diagnosis: string;

  @Column({ type: 'text' })
  treatmentPlan: string;

  // JSON array of medications: [{name, dosage, frequency, duration}]
  @Column({ type: 'jsonb', nullable: true, default: [] })
  prescriptions: Prescription[];

  // TODO: Add medical records field after proper migration
  // @Column({ type: 'jsonb', nullable: true, default: [] })
  // medicalRecords: MedicalRecord[];

  @Column({ type: 'text', nullable: true })
  followUpAdvice: string;

  @OneToMany(() => Attachment, attachment => attachment.consultation)
  attachments: Attachment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
