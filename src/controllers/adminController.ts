import { Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../database';
import { Camp } from '../models/Camp';
import { User, UserRole } from '../models/User';

/**
 * Admin controller - handles camp and user management
 */

export const createCamp = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Parse JSON strings from multipart/form-data
  let doctors = [];
  let campHead = { name: '', email: '', phone: '' };
  let passwordSettings = { mode: 'auto' };

  // JSON fields are already parsed by middleware
  doctors = req.body.doctors || [];
  campHead = req.body.campHead || { name: '', email: '', phone: '' };

  if (req.body.passwordSettings) {
    passwordSettings = req.body.passwordSettings;
  }

  const {
    hospitalName,
    hospitalAddress,
    hospitalPhone,
    hospitalEmail,
    name,
    description,
    venue,
    startTime,
    endTime,
    contactInfo
  } = req.body;

  // Handle file uploads
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  let logoUrl = '';
  let backgroundImageUrl = '';

  if (files) {
    if (files.logo && files.logo[0]) {
      logoUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${files.logo[0].filename}`;
    }

    if (files.backgroundImage && files.backgroundImage[0]) {
      backgroundImageUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${files.backgroundImage[0].filename}`;
    }
  }

  // Generate unique slug for camp URL
  const uniqueSlug = nanoid(10);

  const campRepo = AppDataSource.getRepository(Camp);
  const userRepo = AppDataSource.getRepository(User);

  // Create camp with hospital details
  const camp = campRepo.create({
    uniqueSlug,
    name,
    description,
    venue,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    logoUrl,
    backgroundImageUrl,
    contactInfo,
    hospitalName,
    hospitalAddress,
    hospitalPhone,
    hospitalEmail
  });

  await campRepo.save(camp);

  // Handle password creation based on settings
  const isAutoGenerate = !passwordSettings || passwordSettings.mode === 'auto';

  // Create Camp Head user
  const campHeadPassword = isAutoGenerate
    ? nanoid(12)
    : (passwordSettings as any).campHeadPassword;

  const campHeadUser = userRepo.create({
    role: UserRole.CAMP_HEAD,
    name: campHead.name,
    email: campHead.email,
    phone: campHead.phone,
    passwordHash: await bcrypt.hash(campHeadPassword, 10),
    campId: camp.id,
    isActive: true
  });

  await userRepo.save(campHeadUser);

  // Create Doctor users
  const doctorUsers = await Promise.all(
    doctors.map(async (doctor: any) => {
      const docPassword = isAutoGenerate
        ? nanoid(12)
        : (passwordSettings as any).doctorPasswords[doctor.email];

      const doctorUser = userRepo.create({
        role: UserRole.DOCTOR,
        name: doctor.name,
        email: doctor.email,
        phone: doctor.phone,
        specialty: doctor.specialty,
        passwordHash: await bcrypt.hash(docPassword, 10),
        campId: camp.id,
        isActive: true
      });
      return {
        user: await userRepo.save(doctorUser),
        tempPassword: docPassword,
        name: doctor.name
      };
    })
  );

  // TODO: Send credentials via email/WhatsApp
  // Integration point: sendEmail() or sendWhatsApp()

  res.status(201).json({
    camp,
    campUrl: `${process.env.FRONTEND_URL}/${uniqueSlug}`,
    campHeadCredentials: {
      email: campHeadUser.email,
      tempPassword: campHeadPassword
    },
    doctorCredentials: doctorUsers.map(d => ({
      name: d.name,
      email: d.user.email,
      tempPassword: d.tempPassword
    }))
  });
};

export const listCamps = async (req: AuthRequest, res: Response) => {
  const campRepo = AppDataSource.getRepository(Camp);
  const camps = await campRepo.find({
    order: { createdAt: 'DESC' }
  });

  res.json({ camps });
};

export const getCampDetails = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;

  const campRepo = AppDataSource.getRepository(Camp);
  const camp = await campRepo.findOne({
    where: { id: campId },
    relations: ['users']
  });

  if (!camp) {
    return res.status(404).json({ error: 'Camp not found' });
  }

  res.json({ camp });
};

export const listUsers = async (req: AuthRequest, res: Response) => {
  const { role, campId } = req.query;

  const userRepo = AppDataSource.getRepository(User);
  const where: any = {};

  if (role) where.role = role;
  if (campId) where.campId = campId;

  const users = await userRepo.find({
    where,
    relations: ['camp'],
    select: ['id', 'role', 'name', 'email', 'phone', 'specialty', 'campId', 'isActive', 'createdAt']
  });

  res.json({ users });
};

export const getCampDoctors = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campId } = req.params;

  const userRepo = AppDataSource.getRepository(User);

  const doctors = await userRepo.find({
    where: {
      campId: campId,
      role: UserRole.DOCTOR
    },
    select: ['id', 'name', 'email', 'phone', 'specialty', 'campId', 'isActive', 'createdAt']
  });

  res.json({ doctors });
};

export const resetDoctorPassword = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { doctorId } = req.params;
  const { passwordMode, manualPassword } = req.body;

  const userRepo = AppDataSource.getRepository(User);

  // Find the doctor
  const doctor = await userRepo.findOne({
    where: {
      id: doctorId,
      role: UserRole.DOCTOR
    }
  });

  if (!doctor) {
    return res.status(404).json({ message: 'Doctor not found' });
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

  // Verify the password was actually updated
  const updatedDoctor = await userRepo.findOne({ where: { id: doctorId } });
  console.log(`Password reset for doctor ${doctor.name} (${doctor.email})`);
  console.log(`New password: ${tempPassword}`);
  console.log(`Password hash updated: ${updatedDoctor?.passwordHash !== doctor.passwordHash}`);

  res.json({
    message: 'Password reset successfully',
    tempPassword,
    doctorName: doctor.name,
    doctorEmail: doctor.email,
    passwordMode: passwordMode || 'auto'
  });
};

export const updateCamp = async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campId } = req.params;

  const campRepo = AppDataSource.getRepository(Camp);

  // Find camp
  const camp = await campRepo.findOne({ where: { id: campId } });
  if (!camp) {
    return res.status(404).json({ message: 'Camp not found' });
  }

  // Only pick valid Camp entity fields from req.body
  // Do NOT spread entire req.body as it contains FormData fields that don't exist on Camp
  const updates: Partial<Camp> = {};

  const validFields = [
    'name', 'description', 'venue', 'contactInfo',
    'hospitalName', 'hospitalAddress', 'hospitalPhone', 'hospitalEmail'
  ];

  for (const field of validFields) {
    if (req.body[field] !== undefined) {
      (updates as any)[field] = req.body[field];
    }
  }

  // Handle date fields separately
  if (req.body.startTime) {
    updates.startTime = new Date(req.body.startTime);
  }
  if (req.body.endTime) {
    updates.endTime = new Date(req.body.endTime);
  }

  // Handle file uploads if provided
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

  if (files) {
    if (files.logo && files.logo[0]) {
      updates.logoUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${files.logo[0].filename}`;
    }

    if (files.backgroundImage && files.backgroundImage[0]) {
      updates.backgroundImageUrl = `${process.env.BACKEND_URL || 'http://localhost:3000'}/uploads/${files.backgroundImage[0].filename}`;
    }
  }

  // Update camp
  await campRepo.update(campId, updates);
  const updatedCamp = await campRepo.findOne({ where: { id: campId } });

  res.json({ camp: updatedCamp });
};

export const deleteCamp = async (req: AuthRequest, res: Response) => {
  const { campId } = req.params;
  const campRepo = AppDataSource.getRepository(Camp);

  const camp = await campRepo.findOne({ where: { id: campId } });
  if (!camp) {
    return res.status(404).json({ message: 'Camp not found' });
  }

  // Note: Depending on database constraints, we might need to delete related records first
  // or use CASCADE options in the entity definitions.
  // For now, we attempt to delete the camp.
  await campRepo.remove(camp);

  res.status(200).json({ message: 'Camp deleted successfully' });
};
