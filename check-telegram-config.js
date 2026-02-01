#!/usr/bin/env node

/**
 * Check Telegram Configuration
 * Run: node check-telegram-config.js
 */

require('dotenv').config();
const axios = require('axios');

async function checkTelegramConfig() {
  console.log('\n🔍 Checking Telegram Configuration...\n');

  // Check 1: Bot Token
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in environment variables');
    console.log('   Set it in your .env file or production environment\n');
    return;
  }
  console.log('✅ TELEGRAM_BOT_TOKEN is set');

  // Check 2: Validate Bot Token
  try {
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
    if (response.data.ok) {
      console.log(`✅ Bot token is valid`);
      console.log(`   Bot Name: @${response.data.result.username}`);
      console.log(`   Bot ID: ${response.data.result.id}\n`);
    }
  } catch (error) {
    console.error('❌ Bot token is INVALID');
    console.error(`   Error: ${error.response?.data?.description || error.message}\n`);
    return;
  }

  // Check 3: Test Chat ID (for development)
  const testChatId = process.env.TELEGRAM_TEST_CHAT_ID;
  if (testChatId) {
    console.log(`✅ TELEGRAM_TEST_CHAT_ID is set: ${testChatId}`);
  } else {
    console.log('⚠️  TELEGRAM_TEST_CHAT_ID not set (only needed for development)');
  }

  // Check 4: Node Environment
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`📦 NODE_ENV: ${nodeEnv}`);

  if (nodeEnv === 'production' && testChatId) {
    console.log('\n⚠️  WARNING: TELEGRAM_TEST_CHAT_ID is set in production!');
    console.log('   This will send all messages to the test chat ID.');
    console.log('   Remove it in production unless you\'re testing.\n');
  }

  // Check 5: Get Recent Updates
  try {
    const updates = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`);
    if (updates.data.ok && updates.data.result.length > 0) {
      console.log('\n📬 Recent Messages to Bot:');
      updates.data.result.slice(-5).forEach((update, index) => {
        if (update.message) {
          console.log(`   ${index + 1}. Chat ID: ${update.message.chat.id}`);
          console.log(`      From: ${update.message.from.first_name} ${update.message.from.last_name || ''}`);
          console.log(`      Message: ${update.message.text || '[non-text message]'}`);
        }
      });
      console.log('\n💡 Use these chat IDs for TELEGRAM_TEST_CHAT_ID\n');
    } else {
      console.log('\n📭 No recent messages to the bot');
      console.log('   Message your bot on Telegram to test!\n');
    }
  } catch (error) {
    console.error('❌ Failed to get bot updates');
    console.error(`   Error: ${error.message}\n`);
  }

  // Check 6: Test Sending Message
  if (testChatId && nodeEnv === 'development') {
    console.log(`\n🧪 Testing message send to chat ID ${testChatId}...`);
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: testChatId,
        text: '✅ Test message from Medical Camp Backend!\n\nTelegram is configured correctly.',
        parse_mode: 'Markdown'
      });
      console.log('✅ Test message sent successfully!\n');
    } catch (error) {
      console.error('❌ Failed to send test message');
      console.error(`   Error: ${error.response?.data?.description || error.message}`);
      console.error(`   Make sure the bot has been messaged by user with chat ID ${testChatId}\n`);
    }
  }

  // Production Warnings
  if (nodeEnv === 'production') {
    console.log('\n⚠️  PRODUCTION MODE DETECTED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❗ Phone numbers CANNOT be used as chat IDs in Telegram');
    console.log('❗ You must collect Telegram chat IDs from users');
    console.log('❗ Users must message your bot FIRST before you can message them');
    console.log('\nSee TELEGRAM_PRODUCTION_SETUP.md for implementation guide');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  console.log('✅ Configuration check complete!\n');
}

checkTelegramConfig().catch(console.error);
