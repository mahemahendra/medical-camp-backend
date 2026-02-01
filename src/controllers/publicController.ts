import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { AppDataSource } from '../database';
import { Camp } from '../models/Camp';
import { Visitor } from '../models/Visitor';
import { Visit, VisitStatus } from '../models/Visit';
import { WhatsAppMessageLog, MessageType, MessageStatus } from '../models/WhatsAppMessageLog';
import { sendRegistrationTelegram } from '../services/telegramService';

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

  // Send registration confirmation via Telegram
  await sendRegistrationConfirmation(camp, visitor);

  res.status(201).json({
    visitor: {
      id: visitor.id,
      patientId: patientIdPerCamp,
      name: visitor.name,
      qrCode: visitor.qrCode
    },
    message: 'Registration successful. Confirmation sent via Telegram.'
  });
};

export const getVisitSummary = async (req: Request, res: Response) => {
  // TODO: Implement secure tokenized visit summary access
  res.status(501).json({ error: 'Not implemented' });
};

/**
 * Helper function to send registration confirmation via Telegram
 * Integration point: Telegram messaging service
 */
async function sendRegistrationConfirmation(camp: Camp, visitor: Visitor) {
  try {
    // Check if Telegram is properly configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.warn('[Registration] Telegram bot token not configured, skipping notification');
      return;
    }

    // Send via Telegram
    await sendRegistrationTelegram(camp, visitor);
    console.log(`[Registration] ✓ Telegram sent to ${visitor.phone}`);
  } catch (error: any) {
    console.error('[Registration] Failed to send Telegram confirmation:', {
      visitorId: visitor.id,
      phone: visitor.phone,
      error: error.message,
      stack: error.stack
    });
    // Don't fail the registration if messaging fails
    // Log is already saved in the telegramService
  }
}


