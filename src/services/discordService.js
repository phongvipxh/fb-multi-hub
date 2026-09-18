/**
 * Discord Notification Service
 * Sends formatted rich embeds with full image support to Discord Webhooks.
 * Works globally without regional blocking or VPN.
 */

async function sendDiscordMessageAlert(webhookUrl, {
  pageName,
  pageId,
  accountLabel,
  ownerName,
  senderId,
  senderName,
  messageText,
  attachments = [],
  timestamp = Date.now()
}) {
  if (!webhookUrl || !webhookUrl.trim()) {
    throw new Error('Discord Webhook URL chưa được cấu hình!');
  }

  const cleanUrl = webhookUrl.trim();
  const timeStr = new Date(timestamp).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false
  });

  const accountTag = accountLabel ? ` [${accountLabel}]` : '';
  const ownerTag = ownerName ? `\n👤 **Phụ trách:** ${ownerName}` : '';
  const metaInboxUrl = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}`;

  // Find first image URL and collect other file/media attachments
  let imageUrl = null;
  const extraAttachments = [];
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      const url = att.url || att.payload?.url || att.image_data?.url || att.video_data?.url || att.file_url;
      if (!url) continue;
      const type = (att.type || '').toLowerCase();
      const isImg = type === 'image' || type === 'sticker' || (att.mime_type && att.mime_type.startsWith('image'));
      if (isImg && !imageUrl) {
        imageUrl = url;
      } else {
        extraAttachments.push({
          type: type || 'file',
          name: att.name || (type === 'video' ? 'Video' : type === 'audio' ? 'Tin nhắn thoại' : 'Tập tin'),
          url
        });
      }
    }
  }

  const embed = {
    title: `🚨 TIN NHẮN MỚI TỪ FANPAGE`,
    description: `📄 **Trang:** ${pageName}${accountTag}${ownerTag}\n💬 **Khách hàng:** ${senderName || 'Khách hàng Messenger'}\n📝 **Nội dung:**\n> ${messageText || (imageUrl ? '*(Đã gửi một hình ảnh)*' : '*(Đính kèm / Sticker / Tệp tin)*')}`,
    color: 0x3b82f6,
    fields: [
      {
        name: '⏰ Thời gian',
        value: timeStr,
        inline: true
      },
      {
        name: '🌐 Hộp Thư Meta',
        value: `[👉 Mở Meta Business Suite Inbox](${metaInboxUrl})`,
        inline: true
      }
    ],
    footer: {
      text: `Page ID: ${pageId} • FB Multi-Page Tool`
    },
    timestamp: new Date(timestamp).toISOString()
  };

  if (extraAttachments.length > 0) {
    const fileLinks = extraAttachments.slice(0, 5).map(f => `• [${f.name}](${f.url}) (${f.type.toUpperCase()})`).join('\n');
    embed.fields.push({
      name: '📎 Tệp đính kèm khác',
      value: fileLinks,
      inline: false
    });
  }

  if (imageUrl) {
    embed.image = { url: imageUrl };
  }

  const snippet = messageText ? `"${messageText.substring(0, 80)}"` : (imageUrl ? '📷 [Đã gửi một hình ảnh]' : '📎 [Tệp đính kèm]');

  const payload = {
    username: `${pageName.substring(0, 30)} (FB Alert)`,
    avatar_url: 'https://cdn-icons-png.flaticon.com/512/5968/5968764.png',
    content: `🚨 **[${pageName}]** Tin nhắn mới từ **${senderName || 'Khách hàng'}**: ${snippet}\n👉 **Hộp thư Meta Business Suite:** ${metaInboxUrl}`,
    embeds: [embed]
  };

  const response = await fetch(cleanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Discord Webhook Error [${response.status}]: ${errText}`);
  }

  return { success: true };
}

/**
 * Tests Discord Webhook URL with a sample ping
 */
async function testDiscordWebhook(webhookUrl) {
  if (!webhookUrl || !webhookUrl.trim()) {
    throw new Error('Vui lòng điền Discord Webhook URL trước khi thử!');
  }

  const metaInboxSample = 'https://business.facebook.com/latest/inbox';

  const payload = {
    username: 'FB Multi-Page Bot',
    avatar_url: 'https://cdn-icons-png.flaticon.com/512/5968/5968764.png',
    content: `🔔 **KẾT NỐI DISCORD WEBHOOK THÀNH CÔNG!**\n👉 **Hộp thư Meta Business Suite:** ${metaInboxSample}`,
    embeds: [
      {
        title: '🔔 KẾT NỐI DISCORD WEBHOOK THÀNH CÔNG!',
        description: 'Hệ thống quản lý tin nhắn đa Fanpage đã kết nối thành công với kênh Discord của bạn.\n\nMọi tin nhắn mới, ảnh đính kèm từ khách hàng và **link mở hộp thư Meta Business Suite** sẽ được gửi trực tiếp tại đây!',
        color: 0x10b981,
        fields: [
          {
            name: '⏰ Thời gian kết nối',
            value: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            inline: true
          },
          {
            name: '🌐 Hộp Thư Meta',
            value: `[👉 Mở Meta Business Inbox](${metaInboxSample})`,
            inline: true
          }
        ],
        footer: {
          text: 'FB Multi-Page Alert System'
        }
      }
    ]
  };

  const response = await fetch(webhookUrl.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Discord Webhook Error [${response.status}]: ${errText}`);
  }

  return { success: true };
}

module.exports = {
  sendDiscordMessageAlert,
  testDiscordWebhook
};
