/**
 * Telegram Notification Service
 * Sends formatted alert messages and test pings to Telegram users/groups.
 */

/**
 * Escapes HTML characters for Telegram HTML mode
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a message via Telegram Bot API
 */
async function sendTelegramMessage(botToken, chatId, text, options = {}) {
  if (!botToken || !chatId) {
    throw new Error('Telegram bot_token hoặc chat_id chưa được cấu hình!');
  }

  const apiRoot = options.apiRoot || process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org';
  const url = `${apiRoot.replace(/\/+$/, '')}/bot${botToken.trim()}/sendMessage`;
  
  const payload = {
    chat_id: String(chatId).trim(),
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    disable_web_page_preview: options.disable_web_page_preview !== false
  };

  if (options.reply_markup) {
    payload.reply_markup = options.reply_markup;
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (netErr) {
    const isConnReset = netErr.message.includes('fetch failed') || 
                        (netErr.cause && (netErr.cause.code === 'ECONNRESET' || netErr.cause.code === 'ETIMEDOUT'));
    if (isConnReset) {
      throw new Error('Không thể kết nối đến máy chủ Telegram (Nhà mạng Việt Nam chặn api.telegram.org). Hãy bật ứng dụng 1.1.1.1 (Cloudflare WARP) trên máy tính hoặc cấu hình Telegram API Proxy!');
    }
    throw new Error(`Lỗi kết nối mạng Telegram: ${netErr.message}`);
  }

  const data = await response.json();
  if (!data.ok) {
    if (data.error_code === 403 || (data.description && data.description.includes('bot was blocked'))) {
      throw new Error(`Telegram Lỗi [403]: Bot bị chặn hoặc chưa bấm START. Hãy mở bot trên Telegram và gửi /start!`);
    }
    if (data.error_code === 400 && data.description && data.description.includes('chat not found')) {
      throw new Error(`Telegram Lỗi [400]: Không tìm thấy chat ID (${chatId}). Hãy mở bot trên Telegram và gửi /start trước!`);
    }
    throw new Error(`Telegram API Error [${data.error_code}]: ${data.description}`);
  }

  return data.result;
}

/**
 * Sends a new Facebook message alert to Telegram with action buttons
 */
async function sendFacebookMessageAlert(botToken, chatId, { pageName, pageId, accountLabel, ownerName, senderName, messageText, timestamp }, options = {}) {
  const timeStr = new Date(timestamp || Date.now()).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  const accountTag = accountLabel ? ` <i>[${escapeHtml(accountLabel)}]</i>` : '';
  const ownerTag = ownerName ? `\n👤 <b>Phụ trách:</b> ${escapeHtml(ownerName)}` : '';
  const metaInboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}`;

  const message = [
    `🚨 <b>[${escapeHtml(pageName)}]</b> Tin nhắn từ <b>${escapeHtml(senderName || 'Khách hàng')}</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `📄 <b>Fanpage:</b> ${escapeHtml(pageName)}${accountTag}${ownerTag}`,
    `💬 <b>Khách hàng:</b> ${escapeHtml(senderName || 'Khách hàng Messenger')}`,
    `📝 <b>Nội dung:</b>`,
    `<blockquote>${escapeHtml(messageText || '(Đã gửi một hình ảnh / Đính kèm)')}</blockquote>`,
    `⏰ <b>Thời gian:</b> ${timeStr}`,
    `━━━━━━━━━━━━━━━━━━`
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '💬 Mở Hộp Thư Meta',
          url: metaInboxUrl
        }
      ]
    ]
  };

  return await sendTelegramMessage(botToken, chatId, message, {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    ...options
  });
}

/**
 * Tests the Telegram bot token and chat_id
 */
async function testTelegramConnection(botToken, chatId, options = {}) {
  const testMessage = [
    `🔔 <b>KẾT NỐI TELEGRAM THÀNH CÔNG!</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `Hệ thống quản lý tin nhắn đa Fanpage đã kết nối thành công với Telegram của bạn.`,
    `⏰ Lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    `Mọi tin nhắn mới từ các Fanpage sẽ được thông báo trực tiếp qua đây.`
  ].join('\n');

  return await sendTelegramMessage(botToken, chatId, testMessage, options);
}

module.exports = {
  sendTelegramMessage,
  sendFacebookMessageAlert,
  testTelegramConnection,
  escapeHtml
};
