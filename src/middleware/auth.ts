import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    campId?: string;
  };
}

/**
 * Verify JWT secret is configured
 */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your-secret-key-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be configured in production');
    }
    console.warn('WARNING: Using default JWT secret. Set JWT_SECRET in environment variables.');
    return 'development-only-secret-key';
  }
  return secret;
};

/**
 * Middleware to verify JWT token and attach user info to request
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  
  // Basic token format validation
  if (!token || token.length < 10 || token.length > 2000) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    
    // Validate decoded payload structure
    if (!decoded.id || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }
    
    // Validate role is a valid enum value
    if (!Object.values(UserRole).includes(decoded.role)) {
      return res.status(401).json({ error: 'Invalid user role' });
    }
    
    req.user = {
      id: decoded.id,
      role: decoded.role,
      campId: decoded.campId
    };
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Middleware to enforce camp isolation for non-admin users
 * Validates that campId in request matches user's assigned camp
 */
export const enforceCampIsolation = (req: AuthRequest, res: Response, next: NextFunction) => {
  const { user } = req;
  
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Admin can access any camp
  if (user.role === UserRole.ADMIN) {
    return next();
  }

  // Extract campId from URL params, body, or query
  const requestedCampId = req.params.campId || req.body?.campId || req.query?.campId;

  if (!requestedCampId) {
    return res.status(400).json({ error: 'Camp ID is required' });
  }
  
  // Validate UUID format to prevent injection
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(requestedCampId)) {
    return res.status(400).json({ error: 'Invalid camp ID format' });
  }

  // For Camp Head and Doctor, ensure they can only access their assigned camp
  if (user.campId !== requestedCampId) {
    return res.status(403).json({ error: 'Access denied to this camp' });
  }

  next();
};
