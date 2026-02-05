import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { Consultation } from '../models/Consultation';
import { Attachment, AttachmentType } from '../models/Attachment';
import { Camp } from '../models/Camp';
import { Like } from 'typeorm';
import path from 'path';
import fs from 'fs';
import { sendConsultationCompleteTelegram } from '../services/telegramService';

// Get upload directory path
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

// Helper to get the backend base URL from request
const getBackendUrl = (req: AuthRequest): string => {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }
  // Construct from request headers (works with proxies like Render)
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || 'localhost:3000';
  return `${protocol}://${host}`;
};

/**
 * Doctor controller - handles visitor search and consultation
 */

export const listVisitors = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const { date, status } = req.query;

  const visitRepo = AppDataSource.getRepository(Visit);
  const where: any = { campId };

  if (status) where.status = status;

  const visits = await visitRepo.find({
    where,
    relations: ['visitor', 'doctor', 'consultation'],
    order: { createdAt: 'DESC' }
  });

  res.json({ visits });
};

/**
 * List patients treated by the current doctor with pagination
 */
export const listMyPatients = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const search = req.query.search as string;
  const skip = (page - 1) * limit;
  const doctorId = req.user!.id;

  const visitRepo = AppDataSource.getRepository(Visit);

  let queryBuilder = visitRepo
    .createQueryBuilder('visit')
    .leftJoinAndSelect('visit.visitor', 'visitor')
    .leftJoinAndSelect('visit.consultation', 'consultation')
    .where('visit.campId = :campId', { campId })
    .andWhere('visit.doctorId = :doctorId', { doctorId })
    .andWhere('visit.status = :status', { status: VisitStatus.COMPLETED });

  // Add search filter if provided
  if (search && search.trim()) {
    queryBuilder = queryBuilder.andWhere(
      '(visitor.name ILIKE :search OR visitor.phone ILIKE :search OR visitor.patientIdPerCamp ILIKE :search)',
      { search: `%${search.trim()}%` }
    );
  }

  const [visits, total] = await queryBuilder
    .orderBy('visit.consultationTime', 'DESC')
    .skip(skip)
    .take(limit)
    .getManyAndCount();

  // Transform to visitor format with status
  const visitors = visits.map(visit => ({
    ...visit.visitor,
    latestStatus: visit.status,
    consultationDate: visit.consultationTime,
    diagnosis: visit.consultation?.diagnosis
  }));

  res.json({
    visitors,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
};

export const searchVisitor = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const { query, searchBy } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Search query required' });
  }

  const visitRepo = AppDataSource.getRepository(Visit);
  
  // Search across visitor fields and return visits (same structure as listVisitors)
  const visits = await visitRepo
    .createQueryBuilder('visit')
    .leftJoinAndSelect('visit.visitor', 'visitor')
    .leftJoinAndSelect('visit.doctor', 'doctor') 
    .leftJoinAndSelect('visit.consultation', 'consultation')
    .where('visit.campId = :campId', { campId })
    .andWhere(
      '(visitor.patientIdPerCamp LIKE :query OR visitor.phone LIKE :query OR visitor.name LIKE :query)',
      { query: `%${query}%` }
    )
    .orderBy('visit.createdAt', 'DESC')
    .getMany();

  res.json({ visits });
};

/**
 * Get visitor by QR code scan - allows doctor to access any visitor in their camp
 */
export const getVisitorByQR = async (req: AuthRequest, res: Response) => {
  const { visitorId } = req.params;
  const doctorCampId = req.user!.campId;

  const visitorRepo = AppDataSource.getRepository(Visitor);
  const visitRepo = AppDataSource.getRepository(Visit);

  // Find visitor
  const visitor = await visitorRepo.findOne({
    where: { id: visitorId },
    relations: ['camp']
  });

  if (!visitor) {
    return res.status(404).json({ error: 'Visitor not found' });
  }

  // Check if visitor belongs to doctor's camp
  if (visitor.campId !== doctorCampId) {
    return res.status(403).json({ error: 'This visitor is not registered for your camp' });
  }

  // Get or create visit for this visitor
  let visit = await visitRepo.findOne({
    where: { visitorId: visitor.id, campId: doctorCampId },
    relations: ['consultation', 'attachments'],
    order: { createdAt: 'DESC' }
  });

  if (!visit) {
    // Create a new visit if none exists
    visit = visitRepo.create({
      campId: doctorCampId,
      visitorId: visitor.id,
      status: VisitStatus.REGISTERED
    });
    await visitRepo.save(visit);
  }

  // Attach visitor data to visit object for frontend
  const visitWithVisitor = {
    ...visit,
    visitor: visitor
  };

  res.json({ visitor, visit: visitWithVisitor, camp: visitor.camp });
};

export const getVisitorDetails = async (req: AuthRequest, res: Response) => {
  const { campId, visitorId } = req.params;

  const visitorRepo = AppDataSource.getRepository(Visitor);
  const visitor = await visitorRepo.findOne({
    where: { id: visitorId, campId }
  });

  if (!visitor) {
    return res.status(404).json({ error: 'Visitor not found' });
  }

  // Get visit history
  const visitRepo = AppDataSource.getRepository(Visit);
  const visits = await visitRepo.find({
    where: { visitorId, campId },
    relations: ['consultation', 'doctor'],
    order: { createdAt: 'DESC' }
  });

  res.json({ visitor, visits });
};

export const saveConsultation = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campId } = req.params;
  const {
    visitId,
    chiefComplaints,
    clinicalNotes,
    diagnosis,
    treatmentPlan,
    prescriptions,
    followUpAdvice,
    isInsured
  } = req.body;

  // Filter out empty prescription entries (where name is empty)
  const filteredPrescriptions = Array.isArray(prescriptions)
    ? prescriptions.filter((rx: any) => rx.name && rx.name.trim() !== '')
    : [];

  // Verify visit belongs to this camp
  const visitRepo = AppDataSource.getRepository(Visit);
  const visit = await visitRepo.findOne({
    where: { id: visitId, campId },
    relations: ['visitor']
  });

  if (!visit) {
    return res.status(404).json({ error: 'Visit not found' });
  }

  const consultationRepo = AppDataSource.getRepository(Consultation);

  // Check if consultation already exists
  let consultation = await consultationRepo.findOne({ where: { visitId } });

  if (consultation) {
    // Update existing consultation
    await consultationRepo.update(consultation.id, {
      chiefComplaints,
      clinicalNotes,
      diagnosis,
      treatmentPlan,
      prescriptions: filteredPrescriptions,
      followUpAdvice,
      isInsured
    });
    consultation = await consultationRepo.findOne({ where: { id: consultation.id } });
  } else {
    // Create new consultation
    consultation = consultationRepo.create({
      visitId,
      chiefComplaints,
      clinicalNotes,
      diagnosis,
      treatmentPlan,
      prescriptions: filteredPrescriptions,
      followUpAdvice,
      isInsured
    });
    await consultationRepo.save(consultation);
  }

  // Update visit status
  visit.status = VisitStatus.COMPLETED;
  visit.doctorId = req.user!.id;
  visit.consultationTime = new Date();
  await visitRepo.save(visit);

  // Send Telegram message to visitor with consultation summary
  if (consultation) {
    await sendConsultationNotification(campId, visit.visitor, consultation);
  }

  res.json({ consultation, message: 'Consultation saved successfully' });
};

export const getVisitWithAttachments = async (req: AuthRequest, res: Response) => {
  const { campId, visitId } = req.params;

  const visitRepo = AppDataSource.getRepository(Visit);
  const visit = await visitRepo.findOne({
    where: { id: visitId, campId },
    relations: ['visitor', 'doctor', 'consultation']
  });

  if (!visit) {
    return res.status(404).json({ error: 'Visit not found' });
  }

  // Get attachments separately
  const attachmentRepo = AppDataSource.getRepository(Attachment);
  const attachments = await attachmentRepo.find({
    where: { visitId, campId },
    order: { createdAt: 'DESC' }
  });

  const backendUrl = getBackendUrl(req);

  // Ensure all attachment URLs are absolute static URLs
  const normalizedAttachments = attachments.map(attachment => {
    let fileUrl = attachment.fileUrl;

    // If it's a relative URL starting with /uploads/, make it absolute
    if (fileUrl.startsWith('/uploads/')) {
      fileUrl = `${backendUrl}${fileUrl}`;
    }
    // If it's an API URL, convert back to static URL
    else if (fileUrl.includes('/api/doctor/') && fileUrl.includes('/attachments/')) {
      const filename = path.basename(fileUrl);
      fileUrl = `${backendUrl}/uploads/${filename}`;
    }
    // If it doesn't start with http, make it absolute
    else if (!fileUrl.startsWith('http')) {
      fileUrl = `${backendUrl}${fileUrl}`;
    }

    return {
      ...attachment,
      fileUrl
    };
  });

  res.json({ visit: { ...visit, attachments: normalizedAttachments } });
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
  const { campId, attachmentId } = req.params;

  const attachmentRepo = AppDataSource.getRepository(Attachment);
  const attachment = await attachmentRepo.findOne({
    where: { id: attachmentId, campId }
  });

  if (!attachment) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  // Delete file from filesystem
  const filename = path.basename(attachment.fileUrl);
  const filePath = path.resolve(uploadDir, filename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue with database deletion even if file deletion fails
    }
  }

  // Delete from database
  await attachmentRepo.remove(attachment);

  res.json({ message: 'Attachment deleted successfully' });
};

export const uploadAttachments = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const { visitId, type } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const backendUrl = getBackendUrl(req);
  const attachmentRepo = AppDataSource.getRepository(Attachment);
  const attachments = await Promise.all(
    files.map(async (file) => {
      const attachment = attachmentRepo.create({
        campId,
        visitId,
        fileName: file.originalname,
        fileUrl: `${backendUrl}/uploads/${file.filename}`,
        type: type || AttachmentType.DOCUMENT,
        fileSize: file.size,
        mimeType: file.mimetype
      });
      return await attachmentRepo.save(attachment);
    })
  );

  res.json({ attachments, message: 'Files uploaded successfully' });
};

/**
 * Helper function to send consultation completion notification via Telegram
 */
async function sendConsultationNotification(
  campId: string, 
  visitor: Visitor, 
  consultation: Consultation
) {
  try {
    // Get camp details
    const campRepo = AppDataSource.getRepository(Camp);
    const camp = await campRepo.findOne({ where: { id: campId } });

    if (!camp) {
      console.error('[Notification] Camp not found:', campId);
      return;
    }

    // Build consultation summary
    const summary = `
Diagnosis: ${consultation.diagnosis || 'Not specified'}
Treatment Plan: ${consultation.treatmentPlan || 'Not specified'}
Follow-up: ${consultation.followUpAdvice || 'Not specified'}
    `.trim();

    // Send Telegram notification
    await sendConsultationCompleteTelegram(camp, visitor, summary);
  } catch (error: any) {
    console.error('[Notification] Failed to send consultation notification:', error.message);
    // Don't fail the consultation save if messaging fails
  }
}
