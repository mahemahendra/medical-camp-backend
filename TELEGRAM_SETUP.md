# Telegram Messaging Integration Setup Guide

## Overview

This medical camp management system uses Telegram Bot API to send automated notifications to visitors. Messages are sent for:

1. **Registration Confirmation** - After visitor registers for the camp
2. **Consultation Complete** - After doctor completes consultation
3. **Appointment Reminders** - Custom reminders (optional)
4. **Custom Messages** - Ad-hoc messages to visitors

## Quick Setup

### Step 1: Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts:
   - Choose a name for your bot (e.g., "Medical Camp Assistant")
   - Choose a username ending in 'bot' (e.g., "medical_camp_bot")
4. Copy the **HTTP API token** provided by BotFather
   - Example: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-here
FRONTEND_URL=https://your-frontend-url.com
BACKEND_URL=https://your-backend-url.com
```

### Step 3: Test Your Bot

1. Search for your bot username on Telegram
2. Send `/start` to begin conversation
3. Your bot is now ready to send messages!

## Important: Chat ID Management

### Current Implementation (Phone Number Placeholder)

The current code uses phone numbers as chat IDs, which **won't work in production**. This is a placeholder.

```typescript
const chatId = phoneNumber; // ⚠️ This needs to be replaced
```

### Production Solution Options

#### Option 1: Store Chat IDs in Database (Recommended)

1. **Update Visitor Model** to include `telegramChatId`:

```typescript
// Add to src/models/Visitor.ts
@Column({ nullable: true, name: 'telegram_chat_id' })
telegramChatId: string;
```

2. **Create a Webhook Endpoint** to capture chat IDs:

```typescript
// src/routes/telegram.ts
router.post('/webhook', async (req, res) => {
  const { message } = req.body;
  const chatId = message.chat.id;
  const phone = message.text; // User sends their phone number
  
  // Update visitor with chat ID
  await visitorRepo.update({ phone }, { telegramChatId: chatId });
  
  res.sendStatus(200);
});
```

3. **Set up Telegram Webhook**:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://your-backend.com/api/telegram/webhook"
```

4. **Update telegramService.ts**:

```typescript
export async function sendTelegramMessage(
  chatId: string, // Use actual chat ID, not phone
  text: string,
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' = 'MarkdownV2'
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token not configured');
  }

  await axios.post(TELEGRAM_API_URL, {
    chat_id: chatId, // Now using real chat ID
    text,
    parse_mode: parseMode,
  });
}
```

#### Option 2: Registration Link Method

1. Generate unique registration links for each camp
2. Visitors click link → Opens Telegram → Bot captures chat ID
3. Store mapping: `registrationToken → chatId`

#### Option 3: QR Code Method

1. Generate QR code with bot link + visitor ID
2. Visitor scans QR → Opens bot → Sends visitor ID
3. Bot maps chat ID to visitor ID in database

## Usage Examples

### Send Registration Confirmation

```typescript
import { sendRegistrationTelegram } from '../services/telegramService';

// After visitor registration
await sendRegistrationTelegram(camp, visitor);
```

### Send Consultation Complete

```typescript
import { sendConsultationCompleteTelegram } from '../services/telegramService';

const summary = `
Diagnosis: ${consultation.diagnosis}
Treatment: ${consultation.treatmentPlan}
`;

await sendConsultationCompleteTelegram(camp, visitor, summary);
```

### Send Custom Message

```typescript
import { sendCustomTelegram } from '../services/telegramService';

const success = await sendCustomTelegram(
  phoneOrChatId,
  'Your appointment is tomorrow at 10 AM',
  campId,
  visitorId
);
```

## Message Format

### MarkdownV2 Formatting

The service uses Telegram's MarkdownV2 format:

- `*bold text*`
- `_italic text_`
- `__underline__`
- `~strikethrough~`
- `||spoiler||`
- `[inline URL](http://example.com)`
- `` `inline code` ``
- ` ```code block``` `

**Special characters must be escaped**: `_ * [ ] ( ) ~ ` > # + - = | { } . !`

The service automatically escapes text with the `escapeMarkdownV2()` function.

## Message Templates

### Registration Confirmation Template

```
✅ Registration Successful!

Dear [Name],

You have been successfully registered for [Camp Name]

📋 Your Details:
🆔 Patient ID: [ID]
👤 Name: [Name]
📱 Phone: [Phone]

🏥 Camp Information:
🏢 Hospital: [Hospital Name]
📍 Venue: [Venue]
📅 Date: [Date]
🕐 Time: [Time]

⚠️ Important Instructions:
✓ Arrive 15 minutes early
✓ Bring Patient ID
✓ Save QR code
✓ Carry medical records

🔗 View QR Code: [Link]
```

### Consultation Complete Template

```
✅ Consultation Completed

Dear [Name],

Your consultation at [Camp Name] has been completed.

🆔 Patient ID: [ID]

📋 Summary:
[Diagnosis, Treatment, Follow-up]

📄 Download complete report from portal

⚕️ Follow-up Instructions:
• Follow medication schedule
• Attend follow-up appointments
• Contact if symptoms worsen
```

## Logging and Monitoring

All Telegram messages are logged in the `whatsapp_message_logs` table:

- `type`: REGISTRATION, CONSULTATION_COMPLETE, APPOINTMENT_REMINDER, CUSTOM
- `status`: PENDING, SENT, FAILED
- `sentAt`: Timestamp of successful send
- `errorMessage`: Error details if failed

Query logs:

```sql
SELECT * FROM whatsapp_message_logs 
WHERE type = 'REGISTRATION' 
  AND status = 'FAILED' 
ORDER BY created_at DESC;
```

## Error Handling

The service includes comprehensive error handling:

1. **No Bot Token**: Throws error immediately
2. **API Errors**: Logs error, doesn't crash registration
3. **Invalid Chat ID**: Saves to log with error message
4. **Network Errors**: Retries can be implemented

Errors are logged but don't block user registration or consultation completion.

## Testing

### Test with Hardcoded Chat ID

```typescript
// For development testing
const TEST_CHAT_ID = '123456789'; // Your personal chat ID

// Temporarily modify telegramService.ts
const chatId = process.env.NODE_ENV === 'development' 
  ? TEST_CHAT_ID 
  : phoneNumber;
```

### Get Your Chat ID

1. Message your bot on Telegram
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for `"chat":{"id":123456789}` in the JSON response

## Production Checklist

- [ ] Create Telegram bot via @BotFather
- [ ] Add `TELEGRAM_BOT_TOKEN` to environment variables
- [ ] Implement chat ID storage in database
- [ ] Set up webhook for chat ID capture
- [ ] Test message delivery with real users
- [ ] Configure rate limits (30 messages/second per bot)
- [ ] Set up monitoring for failed messages
- [ ] Create retry mechanism for failed sends
- [ ] Add user preference for message opt-out
- [ ] Implement message queue for bulk sends

## Rate Limits

Telegram Bot API limits:

- **30 messages per second** per bot
- **20 messages per minute** to same chat
- **No daily limit** (but respect fair use)

For bulk sends, implement queuing:

```typescript
import { Queue } from 'bull';

const telegramQueue = new Queue('telegram-messages');

telegramQueue.process(async (job) => {
  await sendTelegramMessage(job.data.chatId, job.data.message);
});

// Add to queue instead of direct send
telegramQueue.add({ chatId, message }, { delay: 1000 });
```

## Troubleshooting

### Bot Not Sending Messages

1. Verify bot token is correct
2. Check user has started conversation with bot
3. Verify chat ID is correct format
4. Check Telegram API status
5. Review error logs in database

### Messages Showing Raw Markdown

- Using wrong parse mode (use MarkdownV2)
- Special characters not escaped
- Use the `escapeMarkdownV2()` function

### "Unauthorized" Error

- Bot token is invalid or expired
- Regenerate token from @BotFather if needed

## Alternative Services

If Telegram doesn't meet requirements, consider:

1. **Twilio SMS**: Direct SMS (paid, reliable)
2. **WhatsApp Business API**: Official WhatsApp (paid, requires approval)
3. **Firebase Cloud Messaging**: Push notifications to app
4. **Email**: Fallback using SendGrid/AWS SES

## Support

For Telegram Bot API documentation: https://core.telegram.org/bots/api

For issues with this implementation, check the logs in `whatsapp_message_logs` table.
