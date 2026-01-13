import { DataSource } from 'typeorm';
import { Camp } from './models/Camp';
import { User } from './models/User';
import { Visitor } from './models/Visitor';
import { Visit } from './models/Visit';
import { Consultation } from './models/Consultation';
import { Attachment } from './models/Attachment';
import { WhatsAppMessageLog } from './models/WhatsAppMessageLog';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'admin',
  database: process.env.DATABASE_NAME || 'medical_camp_db',
  synchronize: process.env.NODE_ENV === 'development', // Auto-sync in dev only
  logging: process.env.NODE_ENV === 'development',
  entities: [
    Camp,
    User,
    Visitor,
    Visit,
    Consultation,
    Attachment,
    WhatsAppMessageLog
  ],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: []
});
