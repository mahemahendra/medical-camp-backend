import { Response } from 'express';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { Consultation } from '../models/Consultation';
import { Attachment, AttachmentType } from '../models/Attachment';
import { Like } from 'typeorm';
import path from 'path';
import fs from 'fs';

// Get upload directory path
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

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

  const visitorRepo = AppDataSource.getRepository(Visitor);
  let where: any = { campId };

  switch (searchBy) {
    case 'patientId':
      where.patientIdPerCamp = Like(`%${query}%`);
      break;
    case 'phone':
      where.phone = Like(`%${query}%`);
      break;
    case 'name':
      where.name = Like(`%${query}%`);
      break;
    default:
      // Search across multiple fields
      const visitors = await visitorRepo
        .createQueryBuilder('visitor')
        .where('visitor.campId = :campId', { campId })
        .andWhere(
          '(visitor.patientIdPerCamp LIKE :query OR visitor.phone LIKE :query OR visitor.name LIKE :query)',
          { query: `%${query}%` }
        )
        .getMany();
      
      return res.json({ visitors });
  }

  const visitors = await visitorRepo.find({ where });
  res.json({ visitors });
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
    followUpAdvice
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
      followUpAdvice
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
      followUpAdvice
    });
    await consultationRepo.save(consultation);
  }

  // Update visit status
  visit.status = VisitStatus.COMPLETED;
  visit.doctorId = req.user!.id;
  visit.consultationTime = new Date();
  await visitRepo.save(visit);

  // TODO: Send WhatsApp message to visitor with consultation summary
  // await sendConsultationWhatsApp(visit.visitor, consultation);

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

  // Ensure all attachment URLs are absolute static URLs
  const normalizedAttachments = attachments.map(attachment => {
    let fileUrl = attachment.fileUrl;
    
    // If it's a relative URL starting with /uploads/, make it absolute
    if (fileUrl.startsWith('/uploads/')) {
      fileUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}${fileUrl}`;
    }
    // If it's an API URL, convert back to static URL
    else if (fileUrl.includes('/api/doctor/') && fileUrl.includes('/attachments/')) {
      const filename = path.basename(fileUrl);
      fileUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${filename}`;
    }
    // If it doesn't start with http, make it absolute
    else if (!fileUrl.startsWith('http')) {
      fileUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}${fileUrl}`;
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

  const attachmentRepo = AppDataSource.getRepository(Attachment);
  const attachments = await Promise.all(
    files.map(async (file) => {
      const attachment = attachmentRepo.create({
        campId,
        visitId,
        fileName: file.originalname,
        fileUrl: `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${file.filename}`,
        type: type || AttachmentType.DOCUMENT,
        fileSize: file.size,
        mimeType: file.mimetype
      });
      return await attachmentRepo.save(attachment);
    })
  );

  res.json({ attachments, message: 'Files uploaded successfully' });
};
