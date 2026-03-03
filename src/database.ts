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
import { FollowUp } from './models/FollowUp';

// Pick database URL based on environment
const isProduction = process.env.NODE_ENV === 'production';
const resolvedDatabaseUrl =
  process.env.DATABASE_URL || // explicit override always wins
  (isProduction ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL_LOCAL);

// Enable SSL for external Render Postgres or when explicitly requested
// Internal Render URLs (dpg-xxx-a without .render.com) do NOT need SSL
const shouldEnableSSL = Boolean(
  process.env.DATABASE_SSL === 'true' ||
  resolvedDatabaseUrl?.includes('.render.com')
);

// Clean DATABASE_URL by removing query parameters (TypeORM doesn't handle them well)
const databaseUrl = resolvedDatabaseUrl?.split('?')[0];

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
    WhatsAppMessageLog,
    FollowUp
  ],
  migrations: ['src/migrations/**/*.ts'],
  subscribers: []
});
