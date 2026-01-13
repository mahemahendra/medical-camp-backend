import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import * as adminController from '../controllers/adminController';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate, requireRole(UserRole.ADMIN));

/**
 * POST /api/admin/camps
 * Create a new medical camp with Camp Head and Doctors
 */
router.post('/camps', [
  body('hospitalName')
    .notEmpty().withMessage('Hospital name is required')
    .trim()
    .escape()
    .isLength({ max: 200 }).withMessage('Hospital name too long'),
  body('hospitalAddress')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('hospitalPhone')
    .optional()
    .trim()
    .matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone format'),
  body('hospitalEmail')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('name')
    .notEmpty().withMessage('Camp name is required')
    .trim()
    .escape()
    .isLength({ max: 200 }).withMessage('Camp name too long'),
  body('description')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 2000 }).withMessage('Description too long'),
  body('venue')
    .notEmpty().withMessage('Venue is required')
    .trim()
    .escape()
    .isLength({ max: 500 }).withMessage('Venue too long'),
  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .isISO8601().withMessage('Invalid start time format'),
  body('endTime')
    .notEmpty().withMessage('End time is required')
    .isISO8601().withMessage('Invalid end time format'),
  body('campHead')
    .isObject().withMessage('Camp head details are required'),
  body('campHead.name')
    .notEmpty().withMessage('Camp head name is required')
    .trim()
    .escape()
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('campHead.email')
    .notEmpty().withMessage('Camp head email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('campHead.phone')
    .optional()
    .trim()
    .matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone format'),
  body('doctors')
    .isArray().withMessage('Doctors must be an array'),
  body('doctors.*.name')
    .notEmpty().withMessage('Doctor name is required')
    .trim()
    .escape()
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('doctors.*.email')
    .notEmpty().withMessage('Doctor email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('doctors.*.specialty')
    .optional()
    .trim()
    .escape()
    .isLength({ max: 100 }).withMessage('Specialty too long')
], asyncHandler(adminController.createCamp));

/**
 * GET /api/admin/camps
 * List all camps (with optional filters)
 */
router.get('/camps', asyncHandler(adminController.listCamps));

/**
 * GET /api/admin/camps/:campId
 * Get camp details
 */
router.get('/camps/:campId', [
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.getCampDetails));

/**
 * PUT /api/admin/camps/:campId
 * Update camp details
 */
router.put('/camps/:campId', [
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.updateCamp));

/**
 * GET /api/admin/users
 * List all users (with optional filters by role, camp)
 */
router.get('/users', asyncHandler(adminController.listUsers));

/**
 * GET /api/admin/camps/:campId/doctors
 * Get doctors for a specific camp
 */
router.get('/camps/:campId/doctors', [
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.getCampDoctors));

/**
 * POST /api/admin/doctors/:doctorId/reset-password
 * Reset password for a doctor
 */
router.post('/doctors/:doctorId/reset-password', [
  param('doctorId')
    .isUUID().withMessage('Invalid doctor ID format')
], asyncHandler(adminController.resetDoctorPassword));

export default router;
