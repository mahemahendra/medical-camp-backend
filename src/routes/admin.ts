import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import * as adminController from '../controllers/adminController';
import { upload } from '../middleware/upload';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate, requireRole(UserRole.ADMIN));

/**
 * POST /api/admin/camps
 * Create a new medical camp with Camp Head and Doctors
 */
const parseMultipartJson = (req: any, res: any, next: any) => {
  try {
    if (req.body.campHead && typeof req.body.campHead === 'string') {
      req.body.campHead = JSON.parse(req.body.campHead);
    }
    if (req.body.doctors && typeof req.body.doctors === 'string') {
      req.body.doctors = JSON.parse(req.body.doctors);
    }
    if (req.body.passwordSettings && typeof req.body.passwordSettings === 'string') {
      req.body.passwordSettings = JSON.parse(req.body.passwordSettings);
    }

    // Remove file fields from body - they're in req.files, not database columns
    // This prevents TypeORM errors like "Property 'logo' not found in 'Camp'"
    delete req.body.logo;
    delete req.body.backgroundImage;

    next();
  } catch (err) {
    console.error('JSON Parse Error:', err);
    return res.status(400).json({ message: 'Invalid JSON format in multipart data' });
  }
};

router.post('/camps', [
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'backgroundImage', maxCount: 1 }
  ]),
  parseMultipartJson,
  body('hospitalName')
    .notEmpty().withMessage('Hospital name is required')
    .trim()
    .isLength({ max: 200 }).withMessage('Hospital name too long'),
  body('hospitalAddress')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('hospitalPhone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone format'),
  body('hospitalEmail')
    .optional({ values: 'falsy' })
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('name')
    .notEmpty().withMessage('Camp name is required')
    .trim()
    .isLength({ max: 200 }).withMessage('Camp name too long'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 2000 }).withMessage('Description too long'),
  body('venue')
    .notEmpty().withMessage('Venue is required')
    .trim()
    .isLength({ max: 500 }).withMessage('Venue too long'),
  body('startTime')
    .notEmpty().withMessage('Start time is required')
    .isISO8601().withMessage('Invalid start time format'),
  body('endTime')
    .notEmpty().withMessage('End time is required')
    .isISO8601().withMessage('Invalid end time format'),
  body('contactInfo')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Contact info too long'),
  body('campHead')
    .isObject().withMessage('Camp head details are required'),
  body('campHead.name')
    .notEmpty().withMessage('Camp head name is required')
    .trim()
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('campHead.email')
    .notEmpty().withMessage('Camp head email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('campHead.phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone format'),
  body('doctors')
    .isArray().withMessage('Doctors must be an array'),
  body('doctors.*.name')
    .notEmpty().withMessage('Doctor name is required')
    .trim()
    .isLength({ max: 100 }).withMessage('Name too long'),
  body('doctors.*.email')
    .notEmpty().withMessage('Doctor email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('doctors.*.specialty')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Specialty too long'),
  body('doctors.*.phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9+\-\s()]*$/).withMessage('Invalid phone format')
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
 * Update camp details (supports file uploads)
 */
router.put('/camps/:campId', [
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'backgroundImage', maxCount: 1 }
  ]),
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.updateCamp));

/**
 * DELETE /api/admin/camps/:campId
 * Delete a medical camp
 */
router.delete('/camps/:campId', [
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.deleteCamp));

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
 * GET /api/admin/camps/:campId/camp-head
 * Get camp head for a specific camp
 */
router.get('/camps/:campId/camp-head', [
  param('campId')
    .isUUID().withMessage('Invalid camp ID format')
], asyncHandler(adminController.getCampHead));

/**
 * POST /api/admin/doctors/:doctorId/reset-password
 * Reset password for a doctor
 */
router.post('/doctors/:doctorId/reset-password', [
  param('doctorId')
    .isUUID().withMessage('Invalid doctor ID format')
], asyncHandler(adminController.resetDoctorPassword));

/**
 * POST /api/admin/camp-heads/:campHeadId/reset-password
 * Reset password for a camp head
 */
router.post('/camp-heads/:campHeadId/reset-password', [
  param('campHeadId')
    .isUUID().withMessage('Invalid camp head ID format')
], asyncHandler(adminController.resetCampHeadPassword));

export default router;
