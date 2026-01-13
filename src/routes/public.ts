import { Router } from 'express';
import { body, param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler';
import * as publicController from '../controllers/publicController';

const router = Router();

// Rate limiting for public registration endpoint
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 registrations per IP per 15 minutes
  message: { error: 'Too many registration attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Sanitization helper - strips HTML and limits length
const sanitizeString = (maxLength: number) => 
  body().trim().escape().isLength({ max: maxLength });

/**
 * GET /api/public/:campSlug
 * Get camp details for public registration page
 */
router.get('/:campSlug', [
  param('campSlug')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Invalid camp identifier')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid camp identifier format')
], asyncHandler(publicController.getCampInfo));

/**
 * POST /api/public/:campSlug/register
 * Register a new visitor for the camp
 */
router.post('/:campSlug/register', registrationLimiter, [
  param('campSlug')
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('Invalid camp identifier')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid camp identifier format'),
  body('name')
    .notEmpty().withMessage('Name is required')
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
  body('phone')
    .notEmpty().withMessage('Phone is required')
    .trim()
    .matches(/^[0-9+\-\s()]{6,20}$/).withMessage('Invalid phone number format'),
  body('age')
    .isInt({ min: 0, max: 150 }).withMessage('Age must be between 0 and 150'),
  body('gender')
    .notEmpty()
    .isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
  body('address')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('city')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 100 }).withMessage('City name too long'),
  body('district')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 100 }).withMessage('District name too long'),
  body('symptoms')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 1000 }).withMessage('Symptoms description too long'),
  body('existingConditions')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 1000 }).withMessage('Existing conditions description too long'),
  body('allergies')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 500 }).withMessage('Allergies description too long')
], asyncHandler(publicController.registerVisitor));

/**
 * GET /api/public/visit/:token
 * Get visit summary (secure tokenized URL sent via WhatsApp)
 */
router.get('/visit/:token', asyncHandler(publicController.getVisitSummary));

export default router;
