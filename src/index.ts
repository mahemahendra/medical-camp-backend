import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { AppDataSource } from './database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { uploadDir } from './middleware/upload';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import doctorRoutes from './routes/doctor';
import campHeadRoutes from './routes/campHead';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required when behind reverse proxy (Render, Heroku, Nginx, etc.)
// This enables rate limiting and IP detection to work correctly
app.set('trust proxy', 1);

// Security Middleware - Helmet adds security headers
// In development, disable CSP to avoid blocking localhost requests
const isDevelopment = process.env.NODE_ENV !== 'production';

app.use(helmet({
  contentSecurityPolicy: isDevelopment ? false : {
    directives: {
      defaultSrc: ["'self'", "http://localhost:*"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http://localhost:*", "blob:"],
      scriptSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://medical-camp-frontend.onrender.com',
  process.env.FRONTEND_URL
].filter((origin): origin is string => Boolean(origin));

// Log allowed origins in production for debugging
if (!isDevelopment) {
  console.log('Allowed CORS origins:', allowedOrigins);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // Cache preflight requests for 10 minutes
}));

// Request size limits to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve uploaded files with security headers and CORS
// This is critical for allowing frontend to load images without ERR_BLOCKED_BY_ORB
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  
  // Set CORS headers explicitly for all requests
  // Allow requests from known origins or all origins for images (less strict for static assets)
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!isDevelopment && origin) {
    // In production, log unknown origins but still allow for debugging
    console.warn(`Upload request from unlisted origin: ${origin}`);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    // Fallback to wildcard (allows images to load from anywhere)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
  
  // Critical headers to prevent ORB (Opaque Response Blocking)
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  
  // Cache control for better performance
  res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
}, express.static(uploadDir, {
  // Express static options for better serving
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, path) => {
    // Set correct MIME types
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (path.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (path.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: AppDataSource.isInitialized ? 'connected' : 'disconnected'
  });
});

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/camp-head', campHeadRoutes);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Error handling
app.use(errorHandler);

// Initialize database and start server
AppDataSource.initialize()
  .then(() => {
    console.log('Database connected successfully');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });

export default app;
