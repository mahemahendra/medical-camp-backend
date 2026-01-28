import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { AppDataSource } from '../database';
import { Camp } from '../models/Camp';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { WhatsAppMessageLog, MessageType, MessageStatus } from '../models/WhatsAppMessageLog';

/**
 * Public controller - handles visitor registration and public camp info
 */

export const getCampInfo = async (req: Request, res: Response) => {
  const { campSlug } = req.params;

  const campRepo = AppDataSource.getRepository(Camp);
  const camp = await campRepo.findOne({
    where: { uniqueSlug: campSlug },
    relations: ['users']
  });

  if (!camp) {
    return res.status(404).json({ error: 'Camp not found' });
  }

  // Filter and map doctors
  const doctors = (camp.users || [])
    .filter(user => user.role === 'DOCTOR')
    .map(doc => ({
      name: doc.name,
      specialty: doc.specialty
    }));

  res.json({
    camp: {
      name: camp.name,
      description: camp.description,
      logoUrl: camp.logoUrl,
      backgroundImageUrl: camp.backgroundImageUrl,
      venue: camp.venue,
      startTime: camp.startTime,
      endTime: camp.endTime,
      contactInfo: camp.contactInfo,
      hospitalName: camp.hospitalName,
      hospitalAddress: camp.hospitalAddress,
      hospitalPhone: camp.hospitalPhone,
      hospitalEmail: camp.hospitalEmail,
      doctors // Include doctors in response
    }
  });
};

export const registerVisitor = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { campSlug } = req.params;
  const {
    name,
    phone,
    age,
    gender,
    address,
    city,
    district,
    symptoms,
    existingConditions,
    allergies
  } = req.body;

  // Find camp
  const campRepo = AppDataSource.getRepository(Camp);
  const camp = await campRepo.findOne({ where: { uniqueSlug: campSlug } });

  if (!camp) {
    return res.status(404).json({ error: 'Camp not found' });
  }

  const visitorRepo = AppDataSource.getRepository(Visitor);

  // Generate unique patient ID for this camp
  const count = await visitorRepo.count({ where: { campId: camp.id } });
  const patientIdPerCamp = `${camp.uniqueSlug.toUpperCase()}-${String(count + 1).padStart(4, '0')}`;

  // Generate QR code
  const qrData = JSON.stringify({
    campId: camp.id,
    patientId: patientIdPerCamp
  });
  const qrCode = await QRCode.toDataURL(qrData);

  // Create visitor
  const visitor = visitorRepo.create({
    campId: camp.id,
    patientIdPerCamp,
    name,
    phone,
    age,
    gender,
    address,
    city,
    district,
    symptoms,
    existingConditions,
    allergies,
    qrCode
  });

  await visitorRepo.save(visitor);

  // Create initial visit record
  const visitRepo = AppDataSource.getRepository(Visit);
  const visit = visitRepo.create({
    campId: camp.id,
    visitorId: visitor.id,
    status: VisitStatus.REGISTERED
  });

  await visitRepo.save(visit);

  // Send WhatsApp message
  await sendRegistrationWhatsApp(camp, visitor);

  res.status(201).json({
    visitor: {
      id: visitor.id,
      patientId: patientIdPerCamp,
      name: visitor.name,
      qrCode: visitor.qrCode
    },
    message: 'Registration successful. Details sent via WhatsApp.'
  });
};

export const getVisitSummary = async (req: Request, res: Response) => {
  // TODO: Implement secure tokenized visit summary access
  res.status(501).json({ error: 'Not implemented' });
};

/**
 * Helper function to send WhatsApp message after registration
 * Integration point: Replace with actual WhatsApp API
 */
async function sendRegistrationWhatsApp(camp: Camp, visitor: Visitor) {
  const message = `
Hello ${visitor.name},

You have successfully registered for ${camp.name}.

Patient ID: ${visitor.patientIdPerCamp}
Venue: ${camp.venue}
Date: ${camp.startTime.toLocaleDateString()}

Please save your Patient ID and QR code for check-in.

${process.env.FRONTEND_URL}/qr/${visitor.id}
  `.trim();

  // Log the message
  const logRepo = AppDataSource.getRepository(WhatsAppMessageLog);
  const log = logRepo.create({
    campId: camp.id,
    visitorId: visitor.id,
    type: MessageType.REGISTRATION,
    message,
    status: MessageStatus.PENDING
  });

  try {
    // TODO: Call actual WhatsApp API
    // await whatsappService.sendMessage(visitor.phone, message);

    log.status = MessageStatus.SENT;
    log.sentAt = new Date();
  } catch (error: any) {
    log.status = MessageStatus.FAILED;
    log.errorMessage = error.message;
  }

  await logRepo.save(log);
}
