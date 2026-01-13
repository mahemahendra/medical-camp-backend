import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Camp } from './Camp';

export enum UserRole {
  ADMIN = 'ADMIN',
  CAMP_HEAD = 'CAMP_HEAD',
  DOCTOR = 'DOCTOR'
}

/**
 * User entity - represents Admin, Camp Head, or Doctor
 * camp_id is null for Admin (global access), required for Camp Head/Doctor
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column()
  passwordHash: string;

  @Column({ nullable: true })
  specialty: string; // For doctors

  // Null for Admin (can access all camps)
  // Required for Camp Head and Doctor
  @ManyToOne(() => Camp, camp => camp.users, { nullable: true })
  camp: Camp;

  @Column({ nullable: true })
  campId: string;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
