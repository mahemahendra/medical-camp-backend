import axios from 'axios';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  : '';

export async function sendTelegramMessage(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('Telegram bot token not set');
  await axios.post(TELEGRAM_API_URL, {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  });
}
