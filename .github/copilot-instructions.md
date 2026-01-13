# Medical Camp Manager - Backend API - AI Coding Instructions

## Project Overview

This is the **backend API server** for a multi-tenant medical camp management system. Each medical camp operates as an isolated tenant with strict data scoping by `camp_id`.

**Key Concept**: All data is strictly scoped by `camp_id` to enforce tenant isolation. Never allow cross-tenant data access.

## Architecture & Tech Stack

- **Backend**: Node.js + Express + TypeScript + TypeORM + PostgreSQL
- **Auth**: JWT tokens with `{id, role, campId}` claims
- **Database**: PostgreSQL with `camp_id` column on all tenant-scoped tables
- **File Storage**: Local uploads with cloud storage ready

### Project Structure
```
medical-camp-backend/
├── src/
│   ├── models/        # TypeORM entities
│   ├── controllers/   # Route handlers  
│   ├── routes/        # Express routers
│   ├── middleware/    # Auth, errors, validation
│   ├── database.ts    # Database connection
│   ├── index.ts       # Server entry point
│   └── seed-admin.ts  # Admin user creation
├── uploads/           # File storage directory
├── Dockerfile         # Container configuration
└── package.json       # Dependencies and scripts
```

## Multi-Tenancy Rules (CRITICAL)

**Every query for non-admin users MUST filter by `camp_id`:**

```typescript
// ✅ CORRECT - Enforces camp isolation
const visitors = await visitorRepo.find({ where: { campId: user.campId } });

// ❌ WRONG - Cross-tenant data leak
const visitors = await visitorRepo.find(); // Returns all camps!
```

**Middleware Pattern**: Use `enforceCampIsolation` middleware on all camp-scoped routes:
- Extracts `campId` from URL params, body, or query
- Validates against user's JWT `campId` claim
- Admin role bypasses this check (can access all camps)

**Example**: All routes in `src/routes/doctor.ts` use `enforceCampIsolation`

## Data Model Key Points

All entities in `src/models/`:

- **Camp** (`camps` table): Has `uniqueSlug` for URL routing. One-to-many with Users, Visitors, Visits.
- **User** (`users` table): `campId` is **nullable for Admin**, required for Camp Head/Doctor. Enum role: `ADMIN | CAMP_HEAD | DOCTOR`.
- **Visitor** (`visitors` table): `patientIdPerCamp` is unique per camp (e.g., `"ABC123-0001"`). Same person can register for multiple camps.
- **Visit** (`visits` table): Tracks consultation session. Status: `REGISTERED | IN_PROGRESS | COMPLETED | CANCELLED`.
- **Consultation** (`consultations` table): One-to-one with Visit. Contains diagnosis, treatment plan, prescriptions (JSONB).
- **Attachment** (`attachments` table): Uploaded files (lab reports, images). Linked to Visit and Consultation.

## API Routes Structure

### Public Routes (`/api/public`)
- `GET /:campSlug` - Camp info for registration page
- `POST /:campSlug/register` - Visitor registration (rate-limited)

### Auth Routes (`/api/auth`)
- `POST /login` - Requires `{email, password, campSlug}`. Returns JWT with `campId` claim.

### Doctor Routes (`/api/doctor/:campId`)
- All routes protected by `authenticate` + `requireRole(DOCTOR)` + `enforceCampIsolation`
- `GET /visitors` - List camp visitors
- `GET /visitors/search?query=...` - Search by QR/patient ID/phone/name
- `POST /consultations` - Save consultation form
- `POST /attachments` - File upload (multer, max 5 files, 10MB each)

### Camp Head Routes (`/api/camp-head/:campId`)
- Protected by `authenticate` + `requireRole(CAMP_HEAD)` + `enforceCampIsolation`
- `GET /analytics` - Camp statistics (visitors, demographics, doctor stats)
- `GET /export/csv` - Download visitor/consultation data as CSV

### Admin Routes (`/api/admin`)
- All routes require `authenticate` + `requireRole(ADMIN)`
- `POST /camps` - Create camp + generate `uniqueSlug` + create Camp Head/Doctor users
- Admin routes do NOT enforce `campId` isolation (can access all)

## Security Checklist

- [ ] All camp-scoped routes use `enforceCampIsolation` middleware
- [ ] JWT tokens contain `campId` claim (except Admin)
- [ ] Public registration endpoint has rate limiting (`src/routes/public.ts`)
- [ ] File uploads validated for type and size (`src/routes/doctor.ts`)
- [ ] Passwords hashed with bcrypt (see `src/controllers/adminController.ts`)
- [ ] Input validation with `express-validator` on all POST/PUT routes

## Common Tasks

### Adding a New API Endpoint

1. Add route in `src/routes/` - Use appropriate auth middleware
2. Implement controller in `src/controllers/`
3. **Always filter by `campId`** for non-admin endpoints
4. **Wrap async handlers**: Use `asyncHandler()` to catch errors automatically (`src/middleware/errorHandler.ts`)

```typescript
// Example route pattern
router.get('/:campId/visitors', 
  authenticate,                     // JWT validation
  requireRole(UserRole.DOCTOR),     // Role check
  enforceCampIsolation,             // Camp access control
  asyncHandler(doctorController.listVisitors)  // Auto error handling
);
```

### Accessing Database in Controllers

```typescript
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';

const visitorRepo = AppDataSource.getRepository(Visitor);
const visitors = await visitorRepo.find({
  where: { campId: user.campId },  // ✅ Always scope by campId
  relations: ['visits']
});
```

## Environment Variables

Required variables in `.env`:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - **Must change in production**
- `UPLOAD_DIR` - File storage path (default `./uploads`)
- `WHATSAPP_API_KEY` - Placeholder for WhatsApp integration
- `NODE_ENV` - development/production
- `PORT` - Server port (default 3000)

## Development Workflow

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with required values:
# - DATABASE_URL=postgresql://user:password@localhost:5432/medical_camp_db
# - JWT_SECRET=<generate secure random string>
# - NODE_ENV=development

# Start PostgreSQL and create database
createdb medical_camp_db

# Seed admin user (REQUIRED for first login)
npm run seed:admin
# Creates: admin@medical-camp.com / admin123

# Start development server
npm run dev
# Backend: http://localhost:3000
```

**Database Setup**: TypeORM auto-syncs in development (`src/database.ts`). For production, use migrations.

**First Time Setup**: After starting server, test with `/api/health` endpoint. Admin login: `admin@medical-camp.com / admin123` (created by `src/seed-admin.ts`).

## Integration Points (Placeholders)

**WhatsApp Sending**: 
- After visitor registration: `src/controllers/publicController.ts` - `sendRegistrationWhatsApp()`
- After consultation: `src/controllers/doctorController.ts` - TODO comment marked
- Replace with real WhatsApp API (Twilio, MessageBird, etc.)

**File Storage**: Currently local disk (`./uploads`). For production, integrate AWS S3, Azure Blob, or Cloudinary. Update `src/routes/doctor.ts` multer config.

## Testing & Debugging

**Backend Logs**: Express logs all requests in development. Check terminal for errors.

**Database Queries**: Set `logging: true` in `src/database.ts` to see SQL queries.

**Health Check**: `GET /api/health` - Verify server and database connection

## Production Deployment

1. Set `NODE_ENV=production` 
2. Use proper PostgreSQL connection string
3. Generate secure JWT_SECRET
4. Disable TypeORM sync, use migrations
5. Configure external file storage
6. Set up proper CORS origins
7. Add error monitoring (Sentry, etc.)

## Next Steps (TODO)

- Implement refresh token logic
- Add real WhatsApp API integration  
- Create database migrations for production
- Add automated tests (Jest)
- Implement PDF export for reports
- Add push notifications for consultation completion