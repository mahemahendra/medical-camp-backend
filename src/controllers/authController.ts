import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../database';
import { User } from '../models/User';
import { Camp } from '../models/Camp';

/**
 * Auth controller - handles login and authentication
 */

/**
 * Get JWT secret with fallback for development
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

export const login = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, campSlug } = req.body;

  const userRepo = AppDataSource.getRepository(User);

  // Admin login (no campSlug required)
  if (!campSlug) {
    const user = await userRepo.findOne({
      where: { email, isActive: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    console.log(`Admin login attempt for ${email}:`);
    console.log(`- User found: ${!!user}`);
    console.log(`- Password provided: ${password}`);
    console.log(`- Stored hash: ${user.passwordHash}`);
    console.log(`- Password valid: ${isPasswordValid}`);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const jwtSecret: string = getJwtSecret();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        campId: user.campId
      },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        campId: user.campId
      }
    });
  }

  // Camp staff login (requires campSlug)
  const campRepo = AppDataSource.getRepository(Camp);
  const camp = await campRepo.findOne({ where: { uniqueSlug: campSlug } });

  if (!camp) {
    return res.status(404).json({ error: 'Camp not found' });
  }

  // Find user by email and campId
  const user = await userRepo.findOne({
    where: { email, campId: camp.id, isActive: true }
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  console.log(`Login attempt for ${email}:`);
  console.log(`- User found: ${!!user}`);
  console.log(`- Password provided: ${password}`);
  console.log(`- Stored hash: ${user.passwordHash}`);
  console.log(`- Password valid: ${isPasswordValid}`);
  
  if (!isPasswordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT token
  const jwtSecret: string = getJwtSecret();
  const token = jwt.sign(
    {
      id: user.id,
      role: user.role,
      campId: user.campId
    },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      campId: user.campId
    }
  });
};

export const refreshToken = async (req: Request, res: Response) => {
  // TODO: Implement token refresh logic
  res.status(501).json({ error: 'Not implemented' });
};

export const changePassword = async (req: Request, res: Response) => {
  // TODO: Implement password change logic
  res.status(501).json({ error: 'Not implemented' });
};
