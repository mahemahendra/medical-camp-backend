import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './User';
import { Visitor } from './Visitor';

/**
 * Camp entity - represents a medical camp (tenant)
 * Each camp has a unique slug for URL access and isolated data
 */
@Entity('camps')
export class Camp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'unique_slug' })
  uniqueSlug: string; // UNIQUE_MEDICAL_ID for URL

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true, name: 'logo_url' })
  logoUrl: string;

  @Column({ nullable: true, name: 'background_image_url' })
  backgroundImageUrl: string;

  @Column()
  venue: string;

  @Column({ type: 'timestamp', name: 'start_time' })
  startTime: Date;

  @Column({ type: 'timestamp', name: 'end_time' })
  endTime: Date;

  @Column({ type: 'text', nullable: true, name: 'contact_info' })
  contactInfo: string;

  // Hospital/Medical Institute details (embedded in camp)
  @Column({ name: 'hospital_name' })
  hospitalName: string;

  @Column({ type: 'text', nullable: true, name: 'hospital_address' })
  hospitalAddress: string;

  @Column({ nullable: true, name: 'hospital_phone' })
  hospitalPhone: string;

  @Column({ nullable: true, name: 'hospital_email' })
  hospitalEmail: string;

  @OneToMany(() => User, user => user.camp)
  users: User[];

  @OneToMany(() => Visitor, visitor => visitor.camp)
  visitors: Visitor[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
