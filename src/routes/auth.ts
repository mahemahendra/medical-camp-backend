import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler';
import * as authController from '../controllers/authController';

const router = Router();

// Rate limiting for login endpoint - prevent brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per IP per 15 minutes
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

/**
 * POST /api/auth/login
 * Login for Camp Head, Doctor, or Admin
 * Requires email/password. campSlug is optional (not needed for admin)
 */
router.post('/login', loginLimiter, [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1, max: 128 }).withMessage('Password must be between 1 and 128 characters'),
  body('campSlug')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Invalid camp slug')
    .matches(/^[a-zA-Z0-9_-]*$/).withMessage('Invalid camp slug format')
], asyncHandler(authController.login));

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', asyncHandler(authController.refreshToken));

/**
 * POST /api/auth/change-password
 * Change user password (requires authentication)
 */
router.post('/change-password', [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
], asyncHandler(authController.changePassword));

export default router;
