import { Router } from 'express';
import { param, query, body } from 'express-validator';
import { authenticate, requireRole, enforceCampIsolation } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import { FollowUpStatus } from '../models/FollowUp';
import * as followUpController from '../controllers/followUpController';

const router = Router();

// All sales/follow-up routes require authentication and SALES role
router.use(authenticate, requireRole(UserRole.SALES));

// Camp ID validation middleware
const validateCampId = param('campId')
  .isUUID().withMessage('Invalid camp ID format');

/**
 * GET /api/sales/:campId/visitors
 * List visitors with completed consultations and follow-up status
 */
router.get('/:campId/visitors',
  validateCampId,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search query too long'),
    query('status').optional().isIn([
      ...Object.values(FollowUpStatus),
      'PENDING'
    ]).withMessage('Invalid status filter')
  ],
  enforceCampIsolation,
  asyncHandler(followUpController.listVisitors)
);

/**
 * GET /api/sales/:campId/follow-up/:visitorId
 * Get follow-up record for a specific visitor
 */
router.get('/:campId/follow-up/:visitorId',
  validateCampId,
  param('visitorId').isUUID().withMessage('Invalid visitor ID format'),
  enforceCampIsolation,
  asyncHandler(followUpController.getFollowUp)
);

/**
 * PUT /api/sales/:campId/follow-up/:visitorId
 * Create or update follow-up entry for a visitor
 */
router.put('/:campId/follow-up/:visitorId',
  validateCampId,
  param('visitorId').isUUID().withMessage('Invalid visitor ID format'),
  enforceCampIsolation,
  [
    body('status')
      .notEmpty().withMessage('Status is required')
      .isIn(Object.values(FollowUpStatus)).withMessage('Invalid follow-up status'),
    body('comment')
      .optional({ values: 'falsy' })
      .trim()
      .isLength({ max: 2000 }).withMessage('Comment too long')
  ],
  asyncHandler(followUpController.upsertFollowUp)
);

/**
 * GET /api/sales/:campId/stats
 * Get follow-up statistics for the camp
 */
router.get('/:campId/stats',
  validateCampId,
  enforceCampIsolation,
  asyncHandler(followUpController.getStats)
);

export default router;
