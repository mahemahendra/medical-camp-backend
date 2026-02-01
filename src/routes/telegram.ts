import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { sendTelegramMessage } from '../services/telegramService';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * Telegram Bot Webhook Endpoint
 * 
 * This endpoint receives messages when users interact with your Telegram bot.
 * Use it to link users' Telegram chat IDs to their visitor records.
 * 
 * Setup:
 * 1. Set webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook
 *    Body: { "url": "https://your-backend.com/api/telegram/webhook" }
 * 
 * 2. Users message your bot with their phone number or patient ID
 * 3. System links their Telegram chat ID to their visitor record
 * 4. Future notifications are sent to their Telegram directly
 */
router.post('/webhook', asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  
  // Telegram expects 200 OK response always, even if we don't process the message
  if (!message?.from?.id || !message?.text) {
    return res.json({ ok: true });
  }
  
  const chatId = message.from.id.toString();
  const userMessage = message.text.trim();
  const username = message.from.username || 'User';
  const firstName = message.from.first_name || '';
  
  console.log(`[Telegram Webhook] Received message from ${firstName} (@${username}): "${userMessage}"`);
  
  const visitorRepo = AppDataSource.getRepository(Visitor);
  
  // Handle /start command
  if (userMessage === '/start') {
    await sendTelegramMessage(
      chatId,
      `👋 Welcome to Medical Camp Manager!\n\nTo link your Telegram account:\n\n1️⃣ Register on our website\n2️⃣ Send your phone number (e.g., +1234567890) or Patient ID (e.g., ABC-0001) here\n\nOnce linked, you'll receive camp updates and QR codes directly on Telegram!`,
      'Markdown'
    );
    return res.json({ ok: true });
  }
  
  // Try to find visitor by phone number or patient ID
  let visitor = await visitorRepo.findOne({
    where: [
      { phone: userMessage },
      { patientIdPerCamp: userMessage }
    ],
    relations: ['camp']
  });
  
  if (visitor) {
    // Check if already linked to a different chat ID
    if (visitor.telegramChatId && visitor.telegramChatId !== chatId) {
      await sendTelegramMessage(
        chatId,
        `⚠️ This account is already linked to another Telegram account.\n\nIf you need to update, please contact support.`,
        'Markdown'
      );
      console.log(`[Telegram Webhook] Attempt to re-link visitor ${visitor.patientIdPerCamp} from chat ${visitor.telegramChatId} to ${chatId}`);
      return res.json({ ok: true });
    }
    
    // Link chat ID to visitor
    visitor.telegramChatId = chatId;
    await visitorRepo.save(visitor);
    
    const campName = visitor.camp?.name || 'Medical Camp';
    
    await sendTelegramMessage(
      chatId,
      `✅ *Success!* Your Telegram is now connected.\n\n*Your Details:*\n👤 Name: ${visitor.name}\n🆔 Patient ID: \`${visitor.patientIdPerCamp}\`\n🏥 Camp: ${campName}\n\nYou'll receive all camp updates and notifications here. 🔔`,
      'MarkdownV2'
    );
    
    console.log(`[Telegram Webhook] ✓ Linked chat ${chatId} to visitor ${visitor.patientIdPerCamp}`);
  } else {
    // Visitor not found - send helpful message
    await sendTelegramMessage(
      chatId,
      `❌ No registration found with:\n"${userMessage}"\n\n*How to link your account:*\n\n1️⃣ First, register on our website\n2️⃣ Then send your:\n   • Phone number (format: +1234567890)\n   • OR Patient ID (from registration email)\n\n💡 Make sure the phone number matches exactly what you used during registration.`,
      'Markdown'
    );
    
    console.log(`[Telegram Webhook] Visitor not found for: ${userMessage}`);
  }
  
  res.json({ ok: true });
}));

/**
 * Get webhook info (for debugging)
 * GET /api/telegram/info
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    return res.status(400).json({
      error: 'TELEGRAM_BOT_TOKEN not configured'
    });
  }
  
  // Fetch webhook info from Telegram
  const axios = require('axios');
  const response = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  
  res.json({
    configured: true,
    webhookInfo: response.data.result
  });
}));

/**
 * Set webhook (for easy setup)
 * POST /api/telegram/setup
 * Body: { "webhookUrl": "https://your-domain.com/api/telegram/webhook" }
 */
router.post('/setup', asyncHandler(async (req: Request, res: Response) => {
  const { webhookUrl } = req.body;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    return res.status(400).json({
      error: 'TELEGRAM_BOT_TOKEN not configured'
    });
  }
  
  if (!webhookUrl) {
    return res.status(400).json({
      error: 'webhookUrl is required'
    });
  }
  
  // Set webhook with Telegram
  const axios = require('axios');
  const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
    url: webhookUrl,
    allowed_updates: ['message']
  });
  
  res.json({
    success: true,
    result: response.data
  });
}));

/**
 * Delete webhook (for debugging)
 * POST /api/telegram/delete-webhook
 */
router.post('/delete-webhook', asyncHandler(async (req: Request, res: Response) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    return res.status(400).json({
      error: 'TELEGRAM_BOT_TOKEN not configured'
    });
  }
  
  // Delete webhook from Telegram
  const axios = require('axios');
  const response = await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`);
  
  res.json({
    success: true,
    result: response.data
  });
}));

export default router;
