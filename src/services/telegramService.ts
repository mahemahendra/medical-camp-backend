import axios from 'axios';
import QRCode from 'qrcode';
import { Camp } from '../models/Camp';
import { Visitor } from '../models/Visitor';
import { AppDataSource } from '../database';
import { WhatsAppMessageLog, MessageType, MessageStatus } from '../models/WhatsAppMessageLog';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_BASE_URL = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : '';
const TELEGRAM_API_URL = `${TELEGRAM_API_BASE_URL}/sendMessage`;
const TELEGRAM_PHOTO_URL = `${TELEGRAM_API_BASE_URL}/sendPhoto`;

/**
 * Format text for Telegram MarkdownV2
 * Escapes special characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Base function to send Telegram message
 * Returns true if sent successfully, false otherwise
 * 
 * @param chatIdOrPhoneNumber - Telegram chat ID (preferred) or phone number (for testing)
 * @param text - Message text
 * @param parseMode - Telegram parse mode
 * @returns true if sent successfully, false otherwise
 */
export async function sendTelegramMessage(
  chatIdOrPhoneNumber: string, 
  text: string, 
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' = 'MarkdownV2'
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram] Bot token not configured. Set TELEGRAM_BOT_TOKEN in environment variables.');
    return false;
  }

  let chatId = chatIdOrPhoneNumber;
  
  // Check if this is a phone number (not a valid chat ID)
  const isPhoneNumber = /^[\+]?[0-9\s\-\(\)]+$/.test(chatIdOrPhoneNumber);
  
  if (isPhoneNumber) {
    // Phone number provided - check for test chat ID
    const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || '';
    
    if (TEST_CHAT_ID) {
      // Development/testing mode - redirect to test chat
      console.log(`[Telegram] TEST MODE: Redirecting message for ${chatIdOrPhoneNumber} to test chat ${TEST_CHAT_ID}`);
      chatId = TEST_CHAT_ID;
    } else {
      // Production without chat ID - cannot send
      console.warn(`[Telegram] SKIPPED: Phone number ${chatIdOrPhoneNumber} provided but no chat ID available.`);
      console.warn(`[Telegram] To fix: User must message the bot first, or set TELEGRAM_TEST_CHAT_ID for testing.`);
      return false;
    }
  }

  // At this point, chatId should be a valid Telegram chat ID
  console.log(`[Telegram] Sending message to chat ID: ${chatId}`);

  try {
    const response = await axios.post(TELEGRAM_API_URL, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    });
    console.log(`[Telegram] ✓ Message sent successfully to chat ${chatId}`);
    return true;
  } catch (error: any) {
    const errorMsg = error.response?.data?.description || error.message;
    console.error('[Telegram] ✗ Failed to send message:', {
      chatId,
      originalInput: chatIdOrPhoneNumber,
      error: errorMsg,
      details: error.response?.data,
      statusCode: error.response?.status
    });
    return false;
  }
}

/**
 * Send photo via Telegram with caption
 * Returns true if sent successfully, false otherwise
 * 
 * @param chatIdOrPhoneNumber - Telegram chat ID (preferred) or phone number (for testing)
 * @param photoBuffer - Image buffer
 * @param caption - Photo caption
 * @param parseMode - Telegram parse mode
 * @returns true if sent successfully, false otherwise
 */
export async function sendTelegramPhoto(
  chatIdOrPhoneNumber: string,
  photoBuffer: Buffer,
  caption: string,
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' = 'MarkdownV2'
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[Telegram] Bot token not configured. Set TELEGRAM_BOT_TOKEN in environment variables.');
    return false;
  }

  let chatId = chatIdOrPhoneNumber;
  
  // Check if this is a phone number (not a valid chat ID)
  const isPhoneNumber = /^[\+]?[0-9\s\-\(\)]+$/.test(chatIdOrPhoneNumber);
  
  if (isPhoneNumber) {
    const TEST_CHAT_ID = process.env.TELEGRAM_TEST_CHAT_ID || '';
    
    if (TEST_CHAT_ID) {
      console.log(`[Telegram] TEST MODE: Redirecting photo for ${chatIdOrPhoneNumber} to test chat ${TEST_CHAT_ID}`);
      chatId = TEST_CHAT_ID;
    } else {
      console.warn(`[Telegram] SKIPPED: Phone number ${chatIdOrPhoneNumber} provided but no chat ID available.`);
      return false;
    }
  }

  console.log(`[Telegram] Sending photo to chat ID: ${chatId}`);

  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', photoBuffer, { filename: 'qr-code.png' });
    form.append('caption', caption);
    form.append('parse_mode', parseMode);

    await axios.post(TELEGRAM_PHOTO_URL, form, {
      headers: form.getHeaders(),
    });
    console.log(`[Telegram] ✓ Photo sent successfully to chat ${chatId}`);
    return true;
  } catch (error: any) {
    const errorMsg = error.response?.data?.description || error.message;
    console.error('[Telegram] ✗ Failed to send photo:', {
      chatId,
      originalInput: chatIdOrPhoneNumber,
      error: errorMsg,
      details: error.response?.data,
      statusCode: error.response?.status
    });
    return false;
  }
}

/**
 * Send registration confirmation via Telegram
 * This is called after a visitor successfully registers
 * 
 * @param camp - Camp information
 * @param visitor - Visitor information (must have telegramChatId or uses phone for testing)
 */
export async function sendRegistrationTelegram(camp: Camp, visitor: Visitor): Promise<void> {
  const campName = escapeMarkdownV2(camp.name);
  const visitorName = escapeMarkdownV2(visitor.name);
  const patientId = escapeMarkdownV2(visitor.patientIdPerCamp);
  const venue = escapeMarkdownV2(camp.venue);
  const hospitalName = escapeMarkdownV2(camp.hospitalName || 'Medical Camp');
  
  const startDate = new Date(camp.startTime).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const startTime = new Date(camp.startTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Generate QR code image buffer with direct URL for doctors to scan
  // Note: Frontend uses HashRouter, so URL must include #
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const qrCodeUrl = `${frontendUrl}/#/${camp.uniqueSlug}/doctor/visitor/${visitor.id}`;
  const qrBuffer = await QRCode.toBuffer(qrCodeUrl, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 512,
    margin: 2,
  });

  const caption = `
✅ *Registration Successful\\!*

Dear ${visitorName},

You have been successfully registered for *${campName}*

📋 *Your Details:*
🆔 Patient ID: \`${patientId}\`
👤 Name: ${visitorName}
📱 Phone: ${escapeMarkdownV2(visitor.phone)}

🏥 *Camp Information:*
🏢 Hospital: ${hospitalName}
📍 Venue: ${venue}
📅 Date: ${escapeMarkdownV2(startDate)}
🕐 Time: ${escapeMarkdownV2(startTime)}

⚠️ *Important Instructions:*
✓ Please arrive 15 minutes before the camp starts
✓ Bring your Patient ID: \`${patientId}\`
✓ Save this QR code for quick check\\-in
✓ Carry any previous medical records if available

If you have any questions, please contact: ${escapeMarkdownV2(camp.contactInfo || camp.hospitalPhone || 'camp staff')}

_Thank you for registering\\!_
`.trim();

  // Log the message attempt
  const logRepo = AppDataSource.getRepository(WhatsAppMessageLog);
  const log = logRepo.create({
    campId: camp.id,
    visitorId: visitor.id,
    type: MessageType.REGISTRATION,
    message: caption,
    status: MessageStatus.PENDING
  });

  // Use telegramChatId if available, otherwise fall back to phone number (for testing)
  const recipient = visitor.telegramChatId || visitor.phone;
  const isUsingChatId = !!visitor.telegramChatId;
  
  if (!isUsingChatId) {
    console.log(`[Telegram] No chat ID for visitor ${visitor.patientIdPerCamp}. Using phone number (test mode only).`);
  }

  const success = await sendTelegramPhoto(recipient, qrBuffer, caption, 'MarkdownV2');
  
  if (success) {
    log.status = MessageStatus.SENT;
    log.sentAt = new Date();
    console.log(`[Telegram] ✓ Registration confirmation sent to visitor ${visitor.patientIdPerCamp}`);
  } else {
    log.status = MessageStatus.FAILED;
    log.errorMessage = isUsingChatId 
      ? 'Failed to send message to chat ID' 
      : 'No Telegram chat ID available. User needs to message the bot first.';
    console.warn(`[Telegram] ✗ Registration NOT sent to visitor ${visitor.patientIdPerCamp}`);
  }

  await logRepo.save(log);
}

/**
 * Send consultation completion notification via Telegram
 * 
 * @param camp - Camp information
 * @param visitor - Visitor information (must have telegramChatId or uses phone for testing)
 * @param consultationSummary - Summary of the consultation
 */
export async function sendConsultationCompleteTelegram(
  camp: Camp, 
  visitor: Visitor, 
  consultationSummary: string
): Promise<void> {
  const campName = escapeMarkdownV2(camp.name);
  const visitorName = escapeMarkdownV2(visitor.name);
  const patientId = escapeMarkdownV2(visitor.patientIdPerCamp);
  const summary = escapeMarkdownV2(consultationSummary);

  const message = `
✅ *Consultation Completed*

Dear ${visitorName},

Your consultation at *${campName}* has been completed\\.

🆔 Patient ID: \`${patientId}\`

📋 *Summary:*
${summary}

📄 You can download your complete consultation report from our portal\\.

⚕️ *Follow\\-up Instructions:*
• Follow the prescribed medication schedule
• Attend follow\\-up appointments as advised
• Contact us immediately if symptoms worsen

Thank you for visiting ${campName}\\!
`.trim();

  const logRepo = AppDataSource.getRepository(WhatsAppMessageLog);
  const log = logRepo.create({
    campId: camp.id,
    visitorId: visitor.id,
    type: MessageType.CONSULTATION_COMPLETE,
    message: message,
    status: MessageStatus.PENDING
  });

  // Use telegramChatId if available, otherwise fall back to phone number (for testing)
  const recipient = visitor.telegramChatId || visitor.phone;
  const isUsingChatId = !!visitor.telegramChatId;

  const success = await sendTelegramMessage(recipient, message, 'MarkdownV2');
  
  if (success) {
    log.status = MessageStatus.SENT;
    log.sentAt = new Date();
  } else {
    log.status = MessageStatus.FAILED;
    log.errorMessage = isUsingChatId 
      ? 'Failed to send message to chat ID' 
      : 'No Telegram chat ID available. User needs to message the bot first.';
  }

  await logRepo.save(log);
}

/**
 * Send appointment reminder via Telegram
 */
export async function sendAppointmentReminderTelegram(
  camp: Camp,
  visitor: Visitor,
  reminderMessage: string
): Promise<void> {
  const visitorName = escapeMarkdownV2(visitor.name);
  const campName = escapeMarkdownV2(camp.name);
  const reminder = escapeMarkdownV2(reminderMessage);

  const message = `
🔔 *Appointment Reminder*

Dear ${visitorName},

${reminder}

📍 Camp: ${campName}
🆔 Patient ID: \`${escapeMarkdownV2(visitor.patientIdPerCamp)}\`

See you soon\\!
`.trim();

  const logRepo = AppDataSource.getRepository(WhatsAppMessageLog);
  const log = logRepo.create({
    campId: camp.id,
    visitorId: visitor.id,
    type: MessageType.APPOINTMENT_REMINDER,
    message: message,
    status: MessageStatus.PENDING
  });

  try {
    await sendTelegramMessage(visitor.phone, message, 'MarkdownV2');
    
    log.status = MessageStatus.SENT;
    log.sentAt = new Date();
  } catch (error: any) {
    log.status = MessageStatus.FAILED;
    log.errorMessage = error.message;
    console.error(`[Telegram] Reminder failed for visitor ${visitor.patientIdPerCamp}:`, error.message);
  }

  await logRepo.save(log);
}

/**
 * Generic function to send custom Telegram message
 */
export async function sendCustomTelegram(
  phoneNumber: string,
  message: string,
  campId?: string,
  visitorId?: string
): Promise<boolean> {
  const logRepo = AppDataSource.getRepository(WhatsAppMessageLog);
  
  const log = logRepo.create({
    campId,
    visitorId,
    type: MessageType.CUSTOM,
    message: message,
    status: MessageStatus.PENDING
  });

  try {
    const escapedMessage = escapeMarkdownV2(message);
    await sendTelegramMessage(phoneNumber, escapedMessage, 'MarkdownV2');
    
    log.status = MessageStatus.SENT;
    log.sentAt = new Date();
    await logRepo.save(log);
    return true;
  } catch (error: any) {
    log.status = MessageStatus.FAILED;
    log.errorMessage = error.message;
    await logRepo.save(log);
    return false;
  }
}

/* 
 * IMPLEMENTATION NOTES:
 * 
 * 1. Telegram Bot Setup:
 *    - Create a bot via @BotFather on Telegram
 *    - Get the bot token and set it in TELEGRAM_BOT_TOKEN env variable
 *    - Users must start a conversation with your bot first
 * 
 * 2. Chat ID Management:
 *    - Phone numbers cannot be used directly as chat IDs
 *    - You need to store Telegram chat IDs in your database
 *    - When users first interact with your bot, store their chat ID
 *    - Update the Visitor model to include a telegramChatId field
 * 
 * 3. Alternative: Use Telegram Bot API with phone numbers
 *    - This requires Telegram Business API (paid service)
 *    - Or use a service like Twilio + Telegram integration
 * 
 * 4. For testing:
 *    - Replace phoneNumber with actual chat IDs
 *    - Or implement a webhook to capture chat IDs when users message your bot
 */

