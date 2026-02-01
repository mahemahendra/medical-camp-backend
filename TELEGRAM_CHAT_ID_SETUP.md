# Telegram Chat ID Setup - Production Fix

## Issue Explained

**Problem:** Telegram messages are going to the bot instead of users' phone numbers.

**Root Cause:** Telegram Bot API **DOES NOT support sending messages to phone numbers directly**. You must use numeric chat IDs (e.g., `1234567890`).

### Why TELEGRAM_TEST_CHAT_ID Sends to Bot

When you set `TELEGRAM_TEST_CHAT_ID` environment variable:
```bash
TELEGRAM_TEST_CHAT_ID=1075517607  # Your personal Telegram chat ID
```

The system redirects ALL messages to this test chat ID for development/testing purposes. This is by design to allow testing without real user chat IDs.

## How Telegram Messaging Works

1. **User registers** on your website → System has their phone number
2. **System tries to send Telegram** → Needs chat ID, not phone number
3. **Two scenarios:**
   - ✅ **Has telegramChatId** → Message sent to user's Telegram
   - ❌ **No telegramChatId** → Falls back to test chat (if TELEGRAM_TEST_CHAT_ID set) or skips

## Production Solutions

### Option 1: Collect Chat IDs via Bot (Recommended)

**How it works:**
1. User registers on website with phone number
2. System tells user: "Message @YourBotName on Telegram to receive updates"
3. User messages the bot
4. Webhook captures chat ID and links it to phone number
5. Future messages go to user's actual Telegram

**Implementation Steps:**

#### Step 1: Add Telegram Webhook Route

Create [src/routes/telegram.ts](src/routes/telegram.ts):

```typescript
import { Router } from 'express';
import { AppDataSource } from '../database';
import { Visitor } from '../models/Visitor';
import { sendTelegramMessage } from '../services/telegramService';

const router = Router();

/**
 * Telegram Bot Webhook
 * Handles incoming messages from users
 */
router.post('/webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message?.from?.id || !message?.text) {
      return res.json({ ok: true });
    }
    
    const chatId = message.from.id.toString();
    const userMessage = message.text.trim();
    
    // Check if message is a phone number or patient ID
    const visitorRepo = AppDataSource.getRepository(Visitor);
    
    // Try to find visitor by phone number or patient ID
    let visitor = await visitorRepo.findOne({
      where: [
        { phone: userMessage },
        { patientIdPerCamp: userMessage }
      ]
    });
    
    if (visitor) {
      // Link chat ID to visitor
      visitor.telegramChatId = chatId;
      await visitorRepo.save(visitor);
      
      await sendTelegramMessage(
        chatId,
        `✅ Success! Your Telegram is now connected.\n\nYou'll receive all camp updates here.\n\nPatient ID: ${visitor.patientIdPerCamp}`,
        'Markdown'
      );
      
      console.log(`[Telegram] Linked chat ${chatId} to visitor ${visitor.patientIdPerCamp}`);
    } else {
      // Send instructions
      await sendTelegramMessage(
        chatId,
        `👋 Welcome! To link your Telegram:\n\n1. Register on our website\n2. Send your phone number or Patient ID here\n\nExample: +1234567890 or ABC-0001`,
        'Markdown'
      );
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    res.json({ ok: true }); // Always respond 200 to Telegram
  }
});

export default router;
```

#### Step 2: Register Webhook Route

Add to [src/index.ts](src/index.ts):

```typescript
import telegramRoutes from './routes/telegram';

// ... existing code ...

app.use('/api/telegram', telegramRoutes);
```

#### Step 3: Set Telegram Webhook

Run this command (replace with your details):

```bash
# Set webhook URL
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-backend.onrender.com/api/telegram/webhook"}'

# Verify webhook is set
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

#### Step 4: Update Registration Flow

After visitor registers, display instructions:

```typescript
// In registration success response
{
  success: true,
  visitor: { ... },
  instructions: {
    telegram: {
      botUsername: "@YourBotName",
      message: "To receive camp updates on Telegram, message our bot with your phone number or Patient ID"
    }
  }
}
```

### Option 2: Manual Chat ID Collection

1. **Get your test chat ID** (for testing):
   ```bash
   # Message your bot first, then:
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"
   
   # Look for: "chat":{"id":1234567890}
   ```

2. **Set environment variable for testing**:
   ```bash
   TELEGRAM_TEST_CHAT_ID=1234567890
   ```

3. **For production**, ask users to:
   - Message your bot
   - Provide chat ID to admin
   - Admin manually updates database:
     ```sql
     UPDATE visitors SET telegram_chat_id = '1234567890' WHERE phone = '+1234567890';
     ```

### Option 3: Disable Telegram in Production

If you don't want to implement chat ID collection:

```bash
# Don't set TELEGRAM_BOT_TOKEN in production
# Or set TELEGRAM_TEST_CHAT_ID to empty string
TELEGRAM_BOT_TOKEN=
TELEGRAM_TEST_CHAT_ID=
```

Messages will be logged but not sent. Users won't receive Telegram notifications.

## Understanding Current Behavior

### Development Mode (with TELEGRAM_TEST_CHAT_ID)
```bash
TELEGRAM_TEST_CHAT_ID=1075517607  # Your test chat ID
```

**What happens:**
- Visitor registers with phone: `+1234567890`
- System tries to send message
- No `telegramChatId` in database
- Falls back to `TELEGRAM_TEST_CHAT_ID`
- **Message sent to YOUR Telegram (the bot owner)**

**Logs show:**
```
[Telegram] No chat ID for visitor ABC-0001. Using phone number (test mode only).
[Telegram] TEST MODE: Redirecting message for +1234567890 to test chat 1075517607
[Telegram] ✓ Photo sent successfully to chat 1075517607
```

### Production Mode (without TELEGRAM_TEST_CHAT_ID)
```bash
# TELEGRAM_TEST_CHAT_ID not set
```

**What happens:**
- Visitor registers with phone: `+1234567890`
- System tries to send message
- No `telegramChatId` in database
- No test chat ID configured
- **Message SKIPPED**

**Logs show:**
```
[Telegram] No chat ID for visitor ABC-0001. Using phone number (test mode only).
[Telegram] SKIPPED: Phone number +1234567890 provided but no chat ID available.
[Telegram] To fix: User must message the bot first, or set TELEGRAM_TEST_CHAT_ID for testing.
```

### Production Mode (with Chat IDs in Database)
```bash
# Visitor has telegramChatId = "1234567890" in database
```

**What happens:**
- Visitor registers (already has chat ID from previous bot interaction)
- System finds `visitor.telegramChatId = "1234567890"`
- **Message sent directly to visitor's Telegram**

**Logs show:**
```
[Telegram] Sending photo to chat ID: 1234567890
[Telegram] ✓ Photo sent successfully to chat 1234567890
[Telegram] ✓ Registration confirmation sent to visitor ABC-0001
```

## Database Schema Update

The `visitors` table now includes:

```sql
ALTER TABLE visitors 
ADD COLUMN telegram_chat_id TEXT NULL;
```

This is automatically created by TypeORM when you restart the server.

## Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=your-bot-token-from-botfather

# Optional (for testing - sends all messages to this chat)
TELEGRAM_TEST_CHAT_ID=your-personal-chat-id

# Required (for frontend links in messages)
FRONTEND_URL=https://your-frontend.onrender.com
BACKEND_URL=https://your-backend.onrender.com
```

## Testing the Setup

### Test 1: Message Your Bot
```bash
# 1. Get bot username from @BotFather
# 2. Search for your bot on Telegram
# 3. Send any message to it
# 4. Check logs: should show webhook received
```

### Test 2: Link Chat ID
```bash
# 1. Register a test visitor on website
# 2. Message bot with phone number: +1234567890
# 3. Bot should respond: "Success! Your Telegram is now connected"
# 4. Check database: visitor should have telegram_chat_id
```

### Test 3: Receive Notifications
```bash
# 1. Complete test 2 first
# 2. Register same phone number for a new camp
# 3. Check your Telegram: should receive QR code and registration details
# 4. Not the test bot - YOUR actual Telegram!
```

## Troubleshooting

### Issue: All messages still go to test bot

**Solution:** Unset `TELEGRAM_TEST_CHAT_ID` in production:
```bash
# Remove from .env or Render environment variables
# TELEGRAM_TEST_CHAT_ID=
```

### Issue: No messages sent at all

**Check:**
1. `TELEGRAM_BOT_TOKEN` is set correctly
2. Visitor has `telegramChatId` in database (check with SQL query)
3. Bot is not blocked by user
4. Backend logs show no errors

### Issue: Webhook not receiving messages

**Debug:**
```bash
# Check webhook status
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Should show:
# - url: "https://your-backend.onrender.com/api/telegram/webhook"
# - pending_update_count: 0
# - last_error_date: (should be empty)

# If errors, delete and reset webhook:
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-backend.onrender.com/api/telegram/webhook"
```

### Issue: "Chat not found" error

**Cause:** Chat ID is invalid or user blocked the bot

**Solution:**
1. User must unblock the bot
2. User must send a message to bot first
3. Then try sending messages again

## Alternative Solutions

If Telegram setup is too complex:

### Use SMS Instead
- **Twilio SMS**: Send SMS to phone numbers directly
- **AWS SNS**: Simple SMS service
- No chat ID collection needed

### Use Email Instead
- Email notifications work with just email addresses
- No additional setup required
- More reliable delivery

### Use WhatsApp Business API
- Requires business verification
- Can send to phone numbers
- More expensive than Telegram

## Summary

**For Testing:**
```bash
TELEGRAM_TEST_CHAT_ID=<your-chat-id>
# All messages → your Telegram
```

**For Production:**
```bash
# Don't set TELEGRAM_TEST_CHAT_ID
# Implement webhook to collect chat IDs
# Messages → actual users' Telegram
```

**Quick Fix for Now:**
Keep `TELEGRAM_TEST_CHAT_ID` set to monitor messages, but implement webhook ASAP for production use.
