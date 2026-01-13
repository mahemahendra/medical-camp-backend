# Medical Camp Manager - Backend API

A Node.js/Express API server for the Medical Camp Management System with multi-tenant architecture.

## Architecture

**Multi-tenant Model**: Each medical camp operates as a separate tenant with isolated data, enforced by `camp_id` scoping in all database queries.

**Tech Stack**:
- Node.js + Express + TypeScript
- PostgreSQL with TypeORM
- JWT authentication with role and camp_id claims
- File upload handling with multer

## User Roles & Permissions

- **Admin** (global): Manages all hospitals, camps, and users
- **Camp Head** (per camp): Views analytics and downloads reports for their camp only  
- **Doctor** (per camp): Conducts consultations for visitors in their camp
- **Visitor**: Registers via public URL, receives WhatsApp confirmation with QR code

## API Endpoints

### Public Routes (`/api/public`)
- `GET /:campSlug` - Camp info for registration page
- `POST /:campSlug/register` - Visitor registration (rate-limited)

### Auth Routes (`/api/auth`)
- `POST /login` - Staff login (requires email, password, campSlug)

### Doctor Routes (`/api/doctor/:campId`)
- `GET /visitors` - List camp visitors
- `GET /visitors/search` - Search visitors by QR/patient ID/phone/name
- `POST /consultations` - Save consultation form
- `POST /attachments` - File upload (max 5 files, 10MB each)

### Camp Head Routes (`/api/camp-head/:campId`)
- `GET /analytics` - Camp statistics and demographics
- `GET /export/csv` - Download visitor/consultation data as CSV

### Admin Routes (`/api/admin`)
- `POST /camps` - Create new camp with generated slug
- `POST /users` - Create Camp Head/Doctor users

## Multi-Tenancy Security

**Critical**: All camp-scoped routes MUST filter by `camp_id`:

```typescript
// ✅ CORRECT - Enforces camp isolation
const visitors = await visitorRepo.find({ where: { campId: user.campId } });

// ❌ WRONG - Cross-tenant data leak
const visitors = await visitorRepo.find(); // Returns all camps!
```

**Middleware Pattern**: Routes use `enforceCampIsolation` middleware:
- Extracts `campId` from URL params, body, or query
- Validates against user's JWT `campId` claim
- Admin role bypasses this check (can access all camps)

## Database Models

- **Camp**: Has `uniqueSlug` for URL routing
- **User**: `campId` nullable for Admin, required for Camp Head/Doctor
- **Visitor**: `patientIdPerCamp` unique per camp (e.g., "ABC123-0001")
- **Visit**: Consultation session tracking
- **Consultation**: One-to-one with Visit, contains diagnosis/treatment
- **Attachment**: Uploaded files linked to visits

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your database and JWT settings
# DATABASE_URL=postgresql://user:password@localhost:5432/medical_camp_db
# JWT_SECRET=your-secure-secret

# Create database
createdb medical_camp_db

# Seed admin user (required for first login)
npm run seed:admin

# Start development server
npm run dev
# Backend runs on http://localhost:3000
```

## Environment Variables

Required variables in `.env`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/medical_camp_db
JWT_SECRET=your-secure-random-string
JWT_EXPIRES_IN=7d
NODE_ENV=development
PORT=3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## Development

```bash
# Run with auto-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database seeds
npm run seed:admin
```

## API Documentation

### Authentication
All protected routes require JWT token in Authorization header:
```
Authorization: Bearer <jwt-token>
```

JWT payload contains:
```json
{
  "id": "user-id",
  "role": "ADMIN|CAMP_HEAD|DOCTOR", 
  "campId": "camp-id-or-null-for-admin"
}
```

### File Uploads
- Maximum 5 files per request
- 10MB size limit per file
- Supported formats: PDF, images (JPG, PNG, GIF)
- Files stored in `./uploads` directory

### Error Handling
All errors return JSON format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional info
}
```

## Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Camp-level data isolation
- Rate limiting on public endpoints
- File upload validation
- SQL injection protection via TypeORM
- Password hashing with bcrypt

## Production Deployment

1. Set `NODE_ENV=production`
2. Use proper PostgreSQL connection string
3. Generate secure JWT_SECRET
4. Configure external file storage (AWS S3, etc.)
5. Set up proper CORS origins
6. Enable database migrations instead of sync

## Integration Points

- **WhatsApp API**: Placeholder functions for sending registration/consultation notifications
- **File Storage**: Currently local disk, ready for cloud storage integration
- **PDF Generation**: Placeholder for report generation