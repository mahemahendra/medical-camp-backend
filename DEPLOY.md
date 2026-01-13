# Backend Deployment to Render

## Prerequisites
- GitHub repository with backend code  
- Render account (free tier)
- PostgreSQL database on Render

## Quick Deploy

### 1. Create PostgreSQL Database
1. Go to Render Dashboard → New → PostgreSQL
2. Name: `medical-camp-db`
3. Database Name: `medical_camp_db`
4. Plan: Free

### 2. Deploy Backend Service
1. Go to Render Dashboard → New → Web Service
2. Connect your GitHub repository  
3. Configure:
   - **Name**: `medical-camp-backend`
   - **Root Directory**: Leave blank (since this is now the root)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

4. Add Environment Variables:
   ```
   DATABASE_URL=<Internal Database URL from step 1>
   JWT_SECRET=<Generate secure random string>
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   PORT=10000
   UPLOAD_DIR=./uploads
   MAX_FILE_SIZE=10485760
   ```

### 3. Initialize Database
The database tables will be created automatically due to TypeORM synchronization.

### 4. Create Admin User
After deployment, you can trigger admin user creation by calling:
```
GET https://your-backend-url.onrender.com/api/admin/init
```

## Environment Variables

```bash
DATABASE_URL=postgresql://user:pass@host:5432/medical_camp_db
JWT_SECRET=your-super-secure-random-string-min-32-chars
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=10000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

## API Health Check
Test deployment: `GET https://your-backend-url.onrender.com/api/health`

## Notes for Free Tier
- Service sleeps after 15 minutes of inactivity
- First request after sleep takes 30-60 seconds (cold start)
- Files uploaded to `./uploads` are not persistent between deployments
- Consider external storage (Cloudinary, AWS S3) for production