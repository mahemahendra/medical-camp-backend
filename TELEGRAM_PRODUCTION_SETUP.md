# Telegram Production Setup Guide

## ⚠️ CRITICAL: Production Telegram Requirements

**Telegram DOES NOT accept phone numbers as chat IDs.** You must use numeric Telegram chat IDs.

## The Problem in Production

In development, we use `TELEGRAM_TEST_CHAT_ID` to test messages. But in production:
- Visitors register with phone numbers
- Telegram API requires chat IDs (numeric, like `1075517607`)
- **You cannot send messages to phone numbers directly**

## Solution Options

### Option 1: Manual Chat ID Collection (Quick Fix)

1. **Ask users to message your bot first**
   - User registers on website
   - They receive SMS/Email: "Message our bot @YourBotName on Telegram to receive QR code and updates"
   - When they message the bot, capture their chat ID

2. **Capture Chat IDs via Webhook**

Create a webhook endpoint to capture incoming messages:

```typescript
// Add to src/routes/admin.ts or create new routes/telegram.ts
router.post('/telegram/webhook', asyncHandler(async (req, res) => {
  const { message } = req.body;
  
  if (message?.from) {
    const chatId = message.from.id;
    const phoneNumber = message.text; // User sends their phone number
    
    // Update visitor record with chat ID
    const visitorRepo = AppDataSource.getRepository(Visitor);
    await visitorRepo.update(
      { phone: phoneNumber },
      { telegramChatId: chatId }
    );
    
    // Send confirmation
    await sendTelegramMessage(
      chatId.toString(),
      'Thank you! Your Telegram is now connected. You will receive updates here.',
      'Markdown'
    );
  }
  
  res.json({ ok: true });
}));
```

3. **Set webhook with Telegram**
```bash
curl -F "url=https://your-domain.com/api/telegram/webhook" \
  https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

### Option 2: Alternative Messaging (Recommended for MVP)

Instead of Telegram, use services that work with phone numbers:

1. **Twilio WhatsApp** - Works with phone numbers directly
2. **SMS via Twilio/AWS SNS** - Direct phone number messaging
3. **Email** - Always works, no additional setup

### Option 3: Database Schema Update (Complete Solution)

Add `telegramChatId` column to visitors table:

```typescript
// In src/models/Visitor.ts
@Column({ nullable: true, name: 'telegram_chat_id' })
telegramChatId: string;
```

Update registration flow:
1. Visitor registers → Save phone number
2. Display message: "Scan QR code OR message @YourBotName on Telegram"
3. When user messages bot → Link chat ID to phone number
4. Future messages use stored chat ID

## Current Workarounds

### For Testing Production

Set environment variable to use test chat ID even in production:

```bash
# .env (temporary testing only!)
NODE_ENV=development
TELEGRAM_TEST_CHAT_ID=your_chat_id
```

### Disable Telegram in Production

Wrap Telegram calls in try-catch to prevent registration failures:

```typescript
// Already implemented in publicController.ts
try {
  await sendRegistrationTelegram(camp, visitor);
  console.log('✓ Registration Telegram sent');
} catch (error: any) {
  console.error('Failed to send Telegram (non-blocking):', error.message);
  // Registration still succeeds even if Telegram fails
}
```

## Implementation Steps for Production

### 1. Add Database Column

```sql
ALTER TABLE visitors ADD COLUMN telegram_chat_id VARCHAR(50);
CREATE INDEX idx_visitors_telegram_chat_id ON visitors(telegram_chat_id);
```

### 2. Update Visitor Model

```typescript
@Column({ nullable: true, name: 'telegram_chat_id' })
telegramChatId: string;
```

### 3. Create Webhook Endpoint

```typescript
// Capture incoming Telegram messages
router.post('/webhook/telegram', express.json(), asyncHandler(async (req, res) => {
  const { message } = req.body;
  
  if (message?.text && message?.from?.id) {
    const chatId = message.from.id;
    const userMessage = message.text.trim();
    
    // Check if message looks like phone number or patient ID
    if (/^\d{10}$/.test(userMessage) || /^[A-Z0-9-]+$/.test(userMessage)) {
      const visitorRepo = AppDataSource.getRepository(Visitor);
      
      // Try to find by phone or patient ID
      const visitor = await visitorRepo.findOne({
        where: [
          { phone: userMessage },
          { patientIdPerCamp: userMessage }
        ]
      });
      
      if (visitor) {
        // Link chat ID to visitor
        await visitorRepo.update(visitor.id, { telegramChatId: chatId.toString() });
        
        await sendTelegramMessage(
          chatId.toString(),
          `✅ Connected! You'll receive camp updates here.\\n\\nPatient ID: ${visitor.patientIdPerCamp}`,
          'MarkdownV2'
        );
      } else {
        await sendTelegramMessage(
          chatId.toString(),
          'No registration found. Please send your registered phone number or patient ID.',
          'Markdown'
        );
      }
    }
  }
  
  res.json({ ok: true });
}));
```

### 4. Update Messaging Functions

```typescript
// In telegramService.ts - use chat ID from database
export async function sendRegistrationTelegram(camp: Camp, visitor: Visitor): Promise<void> {
  // Use stored chat ID if available, otherwise skip
  const chatId = visitor.telegramChatId;
  
  if (!chatId) {
    console.log(`[Telegram] No chat ID for visitor ${visitor.patientIdPerCamp}, skipping notification`);
    return;
  }
  
  // ... rest of function uses chatId instead of visitor.phone
}
```

### 5. Update Registration Page

Show instructions after registration:

```tsx
<div>
  <h3>✅ Registration Complete!</h3>
  <p>To receive your QR code via Telegram:</p>
  <ol>
    <li>Open Telegram and search for <strong>@YourBotName</strong></li>
    <li>Send your patient ID: <code>{patientId}</code></li>
    <li>You'll receive your QR code instantly!</li>
  </ol>
</div>
```

## Monitoring & Debugging

Check logs for Telegram errors:

```bash
# On your server
tail -f logs/app.log | grep Telegram

# Look for:
[Telegram] Production mode: Cannot send to phone number
[Telegram] Failed to send message: Bad Request: chat not found
```

## Quick Test

Test if bot token works:

```bash
# Get bot info
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# Get updates (see who messaged your bot)
curl https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

## Summary

**Current State:**
- ✅ Works in development with TEST_CHAT_ID
- ❌ Fails in production (phone numbers don't work)

**For Production:**
1. Add `telegramChatId` to Visitor model
2. Implement webhook to capture chat IDs
3. Update messaging to use stored chat IDs
4. OR switch to SMS/Email/WhatsApp

**Quick Production Fix:**
- Set NODE_ENV=development with TEST_CHAT_ID for demo purposes
- Implement proper solution before launch
