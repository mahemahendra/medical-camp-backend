import dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Camp } from './models/Camp';
import { User } from './models/User';
import { Visitor } from './models/Visitor';
import { Visit } from './models/Visit';
import { Consultation } from './models/Consultation';
import { Attachment } from './models/Attachment';
import { WhatsAppMessageLog } from './models/WhatsAppMessageLog';

// Enable SSL for Render/external Postgres even in development
const shouldEnableSSL = Boolean(
  process.env.DATABASE_SSL === 'true' ||
  process.env.DATABASE_URL?.includes('render.com') ||
  process.env.NODE_ENV === 'production'
);

// Clean DATABASE_URL by removing query parameters (TypeORM doesn't handle them well)
const databaseUrl = process.env.DATABASE_URL?.split('?')[0];

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  synchronize: process.env.NODE_ENV === 'development', // Auto-sync in dev only
  logging: process.env.NODE_ENV === 'development',
  ssl: shouldEnableSSL ? { rejectUnauthorized: false } : false,
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
