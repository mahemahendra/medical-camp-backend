import { Router } from 'express';
import { param, query } from 'express-validator';
import { authenticate, requireRole, enforceCampIsolation } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import * as campHeadController from '../controllers/campHeadController';

const router = Router();

// All camp head routes require authentication and CAMP_HEAD role
router.use(authenticate, requireRole(UserRole.CAMP_HEAD));

// Camp ID validation - reusable
const validateCampId = param('campId')
  .isUUID().withMessage('Invalid camp ID format');

/**
 * GET /api/camp-head/:campId/analytics
 * Get camp analytics (visitor counts, demographics, etc.)
 */
router.get('/:campId/analytics', 
  validateCampId,
  enforceCampIsolation, 
  asyncHandler(campHeadController.getAnalytics)
);

/**
 * GET /api/camp-head/:campId/doctors
 * List all doctors in the camp with pagination
 */
router.get('/:campId/doctors', 
  validateCampId,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  enforceCampIsolation, 
  asyncHandler(campHeadController.listDoctors)
);

/**
 * GET /api/camp-head/:campId/visitors
 * List all visitors in the camp with pagination and search
 */
router.get('/:campId/visitors', 
  validateCampId,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search query too long')
  ],
  enforceCampIsolation, 
  asyncHandler(campHeadController.listVisitors)
);

/**
 * GET /api/camp-head/:campId/reports
 * Get detailed reports for the camp
 */
router.get('/:campId/reports', 
  validateCampId,
  enforceCampIsolation, 
  asyncHandler(campHeadController.getReports)
);

/**
 * GET /api/camp-head/:campId/export/csv
 * Export camp data as CSV
 */
router.get('/:campId/export/csv', 
  validateCampId,
  enforceCampIsolation, 
  asyncHandler(campHeadController.exportCSV)
);

/**
 * GET /api/camp-head/:campId/export/pdf
 * Export camp summary as PDF
 */
router.get('/:campId/export/pdf', 
  validateCampId,
  enforceCampIsolation, 
  asyncHandler(campHeadController.exportPDF)
);

export default router;
