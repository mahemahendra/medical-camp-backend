import { Router } from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { authenticate, requireRole, enforceCampIsolation } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import * as doctorController from '../controllers/doctorController';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads with security hardening
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate secure random filename to prevent path traversal and guessing
    const randomName = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  }
});

// Allowed MIME types for security
const allowedMimeTypes = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

const upload = multer({
  storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: 5 // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Check file extension
    const extname = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpeg', '.jpg', '.png', '.pdf', '.doc', '.docx', '.txt'];
    
    if (!allowedExtensions.includes(extname)) {
      return cb(new Error('Invalid file extension. Only JPEG, PNG, PDF, DOC, DOCX, and TXT files are allowed.'));
    }
    
    // Check MIME type
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
    
    // Prevent dangerous file names
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Invalid file name.'));
    }
    
    cb(null, true);
  }
});

// All doctor routes require authentication and DOCTOR role
router.use(authenticate, requireRole(UserRole.DOCTOR));

// Camp ID validation middleware
const validateCampId = param('campId')
  .isUUID().withMessage('Invalid camp ID format');

/**
 * GET /api/doctor/:campId/visitors
 * List all visitors for the camp (with search/filter)
 */
router.get('/:campId/visitors', 
  validateCampId,
  enforceCampIsolation, 
  asyncHandler(doctorController.listVisitors)
);

/**
 * GET /api/doctor/:campId/my-patients
 * List visitors treated by the current doctor with pagination
 */
router.get('/:campId/my-patients', 
  validateCampId,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search query too long')
  ],
  enforceCampIsolation, 
  asyncHandler(doctorController.listMyPatients)
);

/**
 * GET /api/doctor/:campId/visitors/search
 * Search visitors by QR code, patient ID, or phone
 */
router.get('/:campId/visitors/search', 
  validateCampId,
  [
    query('query').notEmpty().trim().isLength({ max: 100 }).withMessage('Search query too long'),
    query('searchBy').optional().isIn(['patientId', 'phone', 'name']).withMessage('Invalid search type')
  ],
  enforceCampIsolation, 
  asyncHandler(doctorController.searchVisitor)
);

/**
 * GET /api/doctor/:campId/visitor-by-qr/:visitorId
 * Get visitor details for QR code scan (bypasses camp isolation since visitor ID is unique)
 */
router.get('/:campId/visitor-by-qr/:visitorId',
  validateCampId,
  [
    param('visitorId').isUUID().withMessage('Invalid visitor ID')
  ],
  asyncHandler(doctorController.getVisitorByQR)
);

/**
 * GET /api/doctor/:campId/visitors/:visitorId
 * Get visitor details and visit history
 */
router.get('/:campId/visitors/:visitorId', 
  validateCampId,
  param('visitorId').isUUID().withMessage('Invalid visitor ID format'),
  enforceCampIsolation, 
  asyncHandler(doctorController.getVisitorDetails)
);

/**
 * GET /api/doctor/:campId/visits/:visitId
 * Get visit details with attachments
 */
router.get('/:campId/visits/:visitId', 
  validateCampId,
  param('visitId').isUUID().withMessage('Invalid visit ID format'),
  enforceCampIsolation, 
  asyncHandler(doctorController.getVisitWithAttachments)
);

/**
 * POST /api/doctor/:campId/consultations
 * Create or update consultation for a visit
 */
router.post('/:campId/consultations', 
  validateCampId,
  enforceCampIsolation, 
  [
    body('visitId')
      .notEmpty().withMessage('Visit ID is required')
      .isUUID().withMessage('Invalid visit ID format'),
    body('chiefComplaints')
      .notEmpty().withMessage('Chief complaints are required')
      .trim()
      .isLength({ max: 2000 }).withMessage('Chief complaints too long'),
    body('diagnosis')
      .notEmpty().withMessage('Diagnosis is required')
      .trim()
      .isLength({ max: 2000 }).withMessage('Diagnosis too long'),
    body('treatmentPlan')
      .notEmpty().withMessage('Treatment plan is required')
      .trim()
      .isLength({ max: 5000 }).withMessage('Treatment plan too long'),
    body('clinicalNotes')
      .optional()
      .trim()
      .isLength({ max: 5000 }).withMessage('Clinical notes too long'),
    body('prescriptions')
      .optional()
      .isArray({ max: 50 }).withMessage('Too many prescriptions'),
    body('prescriptions.*.name')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Prescription name too long'),
    body('prescriptions.*.dosage')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Dosage too long'),
    body('prescriptions.*.frequency')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Frequency too long'),
    body('prescriptions.*.duration')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Duration too long'),
    body('followUpAdvice')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Follow-up advice too long')
  ], 
  asyncHandler(doctorController.saveConsultation)
);

/**
 * POST /api/doctor/:campId/attachments
 * Upload file attachments for a visit
 */
router.post('/:campId/attachments', 
  validateCampId,
  enforceCampIsolation, 
  upload.array('files', 5), // Max 5 files per request
  [
    body('visitId').isUUID().withMessage('Invalid visit ID format'),
    body('type').optional().isIn(['DOCUMENT', 'LAB_REPORT', 'IMAGE', 'OTHER']).withMessage('Invalid attachment type')
  ],
  asyncHandler(doctorController.uploadAttachments)
);

/**
 * DELETE /api/doctor/:campId/attachments/:attachmentId
 * Delete an attachment
 */
router.delete('/:campId/attachments/:attachmentId',
  validateCampId,
  enforceCampIsolation,
  param('attachmentId').isUUID().withMessage('Invalid attachment ID format'),
  asyncHandler(doctorController.deleteAttachment)
);

export default router;
