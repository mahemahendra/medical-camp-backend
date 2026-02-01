import { Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { User, UserRole } from '../models/User';
import { Like } from 'typeorm';

/**
 * Camp Head controller - handles analytics, doctors, visitors and reporting
 */

export const getAnalytics = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;

  const visitorRepo = AppDataSource.getRepository(Visitor);
  const visitRepo = AppDataSource.getRepository(Visit);

  // Total registered visitors
  const totalVisitors = await visitorRepo.count({ where: { campId } });

  // Total visits
  const totalVisits = await visitRepo.count({ where: { campId } });

  // Completed consultations
  const completedVisits = await visitRepo.count({
    where: { campId, status: VisitStatus.COMPLETED }
  });

  // Demographics
  const genderStats = await visitorRepo
    .createQueryBuilder('visitor')
    .select('visitor.gender', 'gender')
    .addSelect('COUNT(*)', 'count')
    .where('visitor.campId = :campId', { campId })
    .groupBy('visitor.gender')
    .getRawMany();

  const ageGroups = await visitorRepo
    .createQueryBuilder('visitor')
    .select(`
      CASE
        WHEN age < 18 THEN 'Under 18'
        WHEN age BETWEEN 18 AND 35 THEN '18-35'
        WHEN age BETWEEN 36 AND 50 THEN '36-50'
        WHEN age BETWEEN 51 AND 65 THEN '51-65'
        ELSE 'Over 65'
      END as ageGroup
    `)
    .addSelect('COUNT(*)', 'count')
    .where('visitor.campId = :campId', { campId })
    .groupBy('ageGroup')
    .getRawMany();

  // Visits per doctor
  const doctorStats = await visitRepo
    .createQueryBuilder('visit')
    .leftJoin('visit.doctor', 'doctor')
    .select('doctor.name', 'doctorName')
    .addSelect('COUNT(*)', 'visitCount')
    .where('visit.campId = :campId', { campId })
    .andWhere('doctor.id IS NOT NULL')
    .groupBy('doctor.id, doctor.name')
    .getRawMany();

  res.json({
    analytics: {
      totalVisitors,
      totalVisits,
      completedVisits,
      pendingVisits: totalVisits - completedVisits,
      genderDistribution: genderStats,
      ageDistribution: ageGroups,
      doctorStats
    }
  });
};

/**
 * List all doctors in the camp with pagination
 */
export const listDoctors = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const skip = (page - 1) * limit;

  const userRepo = AppDataSource.getRepository(User);
  
  const [doctors, total] = await userRepo.findAndCount({
    where: { campId, role: UserRole.DOCTOR },
    order: { name: 'ASC' },
    skip,
    take: limit,
    select: ['id', 'name', 'email', 'phone', 'specialty', 'isActive', 'createdAt']
  });

  res.json({
    doctors,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
};

/**
 * Reset password for a doctor in the camp
 */
export const resetDoctorPassword = async (req: AuthRequest, res: Response) => {
  console.log('=== resetDoctorPassword called ===');
  console.log('Params:', req.params);
  console.log('Body:', req.body);
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { campId, doctorId } = req.params;
  const { passwordMode, manualPassword } = req.body;

  const userRepo = AppDataSource.getRepository(User);

  // Find the doctor and verify they belong to the same camp
  const doctor = await userRepo.findOne({
    where: {
      id: doctorId,
      campId: campId,
      role: UserRole.DOCTOR
    }
  });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found in this camp' });
  }

  // Generate or use manual password
  const isManual = passwordMode === 'manual';
  const tempPassword = isManual ? manualPassword : nanoid(12);

  // Validate manual password if provided
  if (isManual) {
    if (!manualPassword || manualPassword.length < 8) {
      return res.status(400).json({ message: 'Manual password must be at least 8 characters long' });
    }
  }

  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // Update doctor's password
  await userRepo.update(doctorId, { passwordHash: hashedPassword });

  res.json({
    message: 'Password reset successfully',
    tempPassword,
    doctorName: doctor.name,
    doctorEmail: doctor.email,
    passwordMode: passwordMode || 'auto'
  });
};

/**
 * List all visitors in the camp with pagination and search
 */
export const listVisitors = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const search = req.query.search as string;
  const skip = (page - 1) * limit;

  const visitorRepo = AppDataSource.getRepository(Visitor);
  
  let queryBuilder = visitorRepo
    .createQueryBuilder('visitor')
    .leftJoinAndSelect('visitor.visits', 'visit')
    .where('visitor.campId = :campId', { campId });

  // Add search filter if provided
  if (search && search.trim()) {
    queryBuilder = queryBuilder.andWhere(
      '(visitor.name ILIKE :search OR visitor.phone ILIKE :search OR visitor.patientIdPerCamp ILIKE :search)',
      { search: `%${search.trim()}%` }
    );
  }

  const [visitors, total] = await queryBuilder
    .orderBy('visitor.createdAt', 'DESC')
    .skip(skip)
    .take(limit)
    .getManyAndCount();

  // Add latest visit status to each visitor
  const visitorsWithStatus = visitors.map(visitor => {
    const latestVisit = visitor.visits?.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    return {
      ...visitor,
      latestStatus: latestVisit?.status || 'REGISTERED',
      visits: undefined // Remove visits array from response
    };
  });

  res.json({
    visitors: visitorsWithStatus,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  });
};

export const getReports = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;

  // TODO: Generate detailed reports
  res.status(501).json({ error: 'Not implemented' });
};

export const exportCSV = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;

  const visitorRepo = AppDataSource.getRepository(Visitor);
  const visitors = await visitorRepo.find({
    where: { campId },
    relations: ['visits', 'visits.consultation']
  });

  // Generate CSV
  const csvHeader = 'Patient ID,Name,Phone,Age,Gender,City,Symptoms,Diagnosis,Treatment\n';
  const csvRows = visitors.map((visitor) => {
    const latestVisit = visitor.visits[0];
    const consultation = latestVisit?.consultation;
    
    return [
      visitor.patientIdPerCamp,
      visitor.name,
      visitor.phone,
      visitor.age,
      visitor.gender,
      visitor.city || '',
      visitor.symptoms || '',
      consultation?.diagnosis || '',
      consultation?.treatmentPlan || ''
    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
  }).join('\n');

  const csv = csvHeader + csvRows;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=camp-${campId}-export.csv`);
  res.send(csv);
};

export const exportPDF = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;

  // TODO: Generate PDF report using library like pdfkit
  res.status(501).json({ error: 'Not implemented' });
};
