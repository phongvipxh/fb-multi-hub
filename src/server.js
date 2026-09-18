const dns = require('dns');
if (dns && typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const localtunnel = require('localtunnel');
require('dotenv').config();

const {
  getSettings,
  getSetting,
  updateSetting,
  updateSettingsBatch,
  getAllUsers,
  getUserById,
  saveOrUpdateUser,
  deleteUser,
  getAllPages,
  getPageByPageId,
  saveOrUpdatePage,
  updatePageTokenHealth,
  assignPageOwner,
  deletePage,
  updatePageCustomDetails,
  getPageShifts,
  getAllShifts,
  addOrUpdatePageShift,
  deletePageShift,
  getActiveUsersOnShiftForPage,
  isTimeInSchedule,
  saveMessage,
  markConversationReplied,
  getConversations,
  getConversationMessages,
  getRecentMessages,
  getQuickReplies,
  saveQuickReply,
  deleteQuickReply,
  getRecentAlarmLogs,
  getHostProfile,
  updateHostProfile,
  getMyShifts,
  isHostOnShiftForPage,
  markConversationSeen,
  markConversationUnseen,
  updateCustomerSeenWatermark,
  getUnrepliedConversationsForSafetyAlarm,
  markSafetyAlarmTriggered,
  updateUserActivity,
  getConversation,
  saveSettings,
  getAllTokenSources,
  getTokenSourcesWithPages,
  getTokenSourceById,
  getTokenSourceByFbUserId,
  saveOrUpdateTokenSource,
  updateTokenSourceAppCredentials,
  deleteTokenSource,
  getFacebookAppConfig,
  saveFacebookAppConfig,
  getAllTags,
  createTag,
  deleteTag,
  getCustomerNotes,
  addCustomerNote,
  deleteCustomerNote,
  getCustomerCrm,
  updateCustomerCrm,
  db
} = require('./database/db');

const {
  verifyWebhook,
  parseWebhookPayload,
  fetchPageDetails,
  fetchPagesFromToken,
  exchangeLongLivedToken,
  generateFacebookAuthUrl,
  exchangeCodeForUserToken,
  getFacebookUserProfile,
  handleFacebookOAuthFlow,
  subscribePageWebhook,
  sendFacebookMessage,
  sendMarkSeen,
  fetchSenderProfile,
  checkTokenHealth,
  debugToken,
  updateMetaClockOffset,
  getMetaSyncedNow,
  getMetaClockOffset
} = require('./services/facebookService');

const {
  sendFacebookMessageAlert,
  testTelegramConnection
} = require('./services/telegramService');

const {
  isAlarmModeActiveForUser,
  triggerAlarmForUser,
  testAlarm
} = require('./services/alarmService');

const {
  sendDiscordMessageAlert,
  testDiscordWebhook
} = require('./services/discordService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// SSE connected clients
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// 25-second keepalive ping to prevent proxy & Cloudflare Tunnel dropouts
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (err) {
      sseClients.delete(client);
    }
  }
}, 25000);

/**
 * Guaranteed Discord Alert Dispatcher:
 * Collects all configured webhooks across Host profile, Global settings, .env, and on-duty users.
 * Deduplicates target URLs and sends rich embeds with full image support.
 */
async function dispatchDiscordAlert({ pageId, pageName, accountLabel, senderId, senderName, text, attachments = [], timestamp = Date.now() }) {
  const host = getHostProfile();
  const globalSettings = getSettings();
  const targetWebhooks = new Set();

  // 1. Host profile webhook (Single-Host Admin)
  if (host && host.discord_enabled !== 'false' && host.discord_webhook_url && host.discord_webhook_url.trim()) {
    targetWebhooks.add(host.discord_webhook_url.trim());
  }

  // 2. Global settings webhook
  if (globalSettings && globalSettings.global_discord_webhook_url && globalSettings.global_discord_webhook_url.trim()) {
    targetWebhooks.add(globalSettings.global_discord_webhook_url.trim());
  }

  // 3. Environment variable webhook
  if (process.env.DISCORD_WEBHOOK_URL && process.env.DISCORD_WEBHOOK_URL.trim()) {
    targetWebhooks.add(process.env.DISCORD_WEBHOOK_URL.trim());
  }

  // 4. On-duty users webhooks
  const onDutyUsers = getActiveUsersOnShiftForPage(pageId);
  for (const u of onDutyUsers) {
    if (u.discord_enabled === 'true' && u.discord_webhook_url && u.discord_webhook_url.trim()) {
      targetWebhooks.add(u.discord_webhook_url.trim());
    }
  }

  if (targetWebhooks.size === 0) {
    console.log(`[Discord] Chưa có Discord Webhook URL nào được cấu hình để gửi thông báo.`);
    return;
  }

  for (const webhookUrl of targetWebhooks) {
    try {
      await sendDiscordMessageAlert(webhookUrl, {
        pageName: pageName || `Fanpage ${pageId}`,
        pageId,
        accountLabel: accountLabel || '',
        ownerName: host?.name || 'Quản Trị Viên',
        senderId,
        senderName: senderName || 'Khách hàng Messenger',
        messageText: text,
        attachments: attachments || [],
        timestamp: timestamp || Date.now()
      });
      console.log(`[Discord] Đã gửi thông báo thành công tới Discord Webhook cho Page "${pageName || pageId}"`);
    } catch (dcErr) {
      console.error(`[Discord] Gửi thông báo tới Discord Webhook thất bại:`, dcErr.message);
    }
  }
}

// Active tunnel instances
let activeTunnelProcess = null;
let activeTunnel = null;
let currentPublicUrl = getSetting('public_url') || '';
let shouldKeepTunnelAlive = true;

function getCloudflaredPath() {
  const localBin = path.join(__dirname, '../bin/cloudflared.exe');
  if (fs.existsSync(localBin)) return localBin;

  // Check system PATH
  try {
    const { execSync } = require('child_process');
    const cmd = process.platform === 'win32' ? 'where.exe cloudflared' : 'which cloudflared';
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const candidate = output.split(/\r?\n/)[0]?.trim();
    if (candidate && fs.existsSync(candidate)) return candidate;
  } catch (e) {}

  return null;
}

async function startCloudflareTunnel(port = PORT) {
  const cloudflaredPath = getCloudflaredPath();
  if (!cloudflaredPath) {
    throw new Error('Không tìm thấy cloudflared trên hệ thống hoặc trong bin/cloudflared.exe!');
  }

  shouldKeepTunnelAlive = true;

  if (process.env.NODE_ENV === 'test' || process.env.MOCK_TUNNEL === '1') {
    currentPublicUrl = `https://mock-tunnel-${port}-${Date.now()}.trycloudflare.com`;
    updateSetting('public_url', currentPublicUrl);
    broadcastSSE('tunnel_started', {
      publicUrl: currentPublicUrl,
      webhookUrl: `${currentPublicUrl}/webhook`
    });
    return currentPublicUrl;
  }

  if (activeTunnelProcess) {
    try { activeTunnelProcess.kill(); } catch (e) {}
    activeTunnelProcess = null;
  }

  const child = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`], {
    windowsHide: true
  });
  activeTunnelProcess = child;

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Khởi động Cloudflare Tunnel bị timeout (25s)'));
      }
    }, 25000);

    const onData = (d) => {
      const str = d.toString();
      const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        currentPublicUrl = match[0];
        updateSetting('public_url', currentPublicUrl);
        console.log(`====================================================`);
        console.log(`🌐 [Cloudflare Tunnel] Link Mới:    ${currentPublicUrl}`);
        console.log(`🔗 [Cloudflare Tunnel] Webhook URL: ${currentPublicUrl}/webhook`);
        console.log(`====================================================`);

        broadcastSSE('tunnel_started', {
          publicUrl: currentPublicUrl,
          webhookUrl: `${currentPublicUrl}/webhook`
        });

        resolve(currentPublicUrl);
      }
    };

    child.stderr.on('data', onData);
    child.stdout.on('data', onData);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    child.on('close', (code) => {
      activeTunnelProcess = null;
      currentPublicUrl = '';
      updateSetting('public_url', '');
      broadcastSSE('tunnel_stopped', {});
      console.log(`[Cloudflare Tunnel] Tunnel đóng (code: ${code}).`);

      // Auto-reconnect if tunnel was meant to stay alive
      if (shouldKeepTunnelAlive) {
        console.log(`[Cloudflare Tunnel] Đang tự động kết nối lại và lấy link mới sau 3s...`);
        setTimeout(() => {
          if (shouldKeepTunnelAlive && !activeTunnelProcess) {
            startCloudflareTunnel(port).catch(e => console.warn('[Cloudflare Tunnel] Tự động kết nối lại thất bại:', e.message));
          }
        }, 3000);
      }
    });
  });
}

function stopAllTunnels() {
  shouldKeepTunnelAlive = false;
  if (tunnelWatchdogInterval) {
    clearInterval(tunnelWatchdogInterval);
    tunnelWatchdogInterval = null;
  }
  if (activeTunnelProcess) {
    try {
      activeTunnelProcess.kill();
      activeTunnelProcess = null;
    } catch (e) {}
  }
  if (activeTunnel) {
    try {
      activeTunnel.close();
      activeTunnel = null;
    } catch (e) {}
  }
  currentPublicUrl = '';
  updateSetting('public_url', '');
  broadcastSSE('tunnel_stopped', {});
}

let isRestartingTunnel = false;
let tunnelWatchdogInterval = null;
let tunnelHealthFailCount = 0;

async function restartCloudflareTunnel(port = PORT) {
  if (isRestartingTunnel) return currentPublicUrl;
  isRestartingTunnel = true;
  console.log(`[Cloudflare Tunnel] Đang tái kết nối Tunnel (Tự động thích ứng mạng / VPN mới / Link mới)...`);
  try {
    shouldKeepTunnelAlive = false;
    if (activeTunnelProcess) {
      try { activeTunnelProcess.kill(); } catch (e) {}
      activeTunnelProcess = null;
    }
    await new Promise(r => setTimeout(r, 600));
    shouldKeepTunnelAlive = true;
    const newUrl = await startCloudflareTunnel(port);
    tunnelHealthFailCount = 0;
    return newUrl;
  } catch (err) {
    console.warn(`[Cloudflare Tunnel] Lỗi khi tái kết nối: ${err.message}`);
    throw err;
  } finally {
    isRestartingTunnel = false;
  }
}

function startTunnelWatchdog(port = PORT) {
  if (tunnelWatchdogInterval) clearInterval(tunnelWatchdogInterval);
  tunnelHealthFailCount = 0;

  tunnelWatchdogInterval = setInterval(async () => {
    if (!shouldKeepTunnelAlive || !currentPublicUrl || isRestartingTunnel) return;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(`${currentPublicUrl}/api/health`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'FBMultiHub/2.0-VPN-Watchdog' }
      });
      clearTimeout(timeout);
      if (res.ok) {
        tunnelHealthFailCount = 0;
      } else {
        tunnelHealthFailCount++;
      }
    } catch (e) {
      tunnelHealthFailCount++;
      console.warn(`[Tunnel Watchdog] Kiểm tra kết nối Cloudflare không phản hồi (${tunnelHealthFailCount}/2): ${e.message}`);
    }

    if (tunnelHealthFailCount >= 2) {
      console.warn(`[Tunnel Watchdog] Phát hiện kết nối Cloudflare Tunnel bị gián đoạn (do đổi mạng / đổi VPN). Đang tự động kết nối lại máy chủ tối ưu mới...`);
      tunnelHealthFailCount = 0;
      restartCloudflareTunnel(port).catch(err => {
        console.warn(`[Tunnel Watchdog] Tự động tái kết nối thất bại: ${err.message}`);
      });
    }
  }, 20000);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp3') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.svg') || filePath.endsWith('.ico')) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// -------------------------------------------------------------
// 1. Meta Facebook Webhook Endpoints
// -------------------------------------------------------------

/**
 * Verification Request from Meta Developer Dashboard
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = getSetting('verify_token') || 'fb_tool_verify_secret_2026';
  const verification = verifyWebhook(mode, token, challenge, expectedToken);

  if (verification.valid) {
    console.log('[Webhook] Meta Webhook verified successfully!');
    return res.status(200).send(challenge);
  } else {
    console.warn('[Webhook] Verification failed! Received token:', token, 'Expected:', expectedToken);
    return res.sendStatus(403);
  }
});

/**
 * Incoming Webhook Events from Facebook Messenger
 * Intelligently routes messages to the exact user owning the Fanpage!
 */
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Immediately respond with 200 OK as required by Meta within 20s
  res.status(200).send('EVENT_RECEIVED');

  // Process events asynchronously
  (async () => {
    try {
      const messages = parseWebhookPayload(body);
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        // Handle customer read receipt
        if (msg.isReadReceipt) {
          try {
            updateCustomerSeenWatermark(msg.pageId, msg.senderId, msg.watermark);
            broadcastSSE('customer_seen', {
              page_id: msg.pageId,
              sender_id: msg.senderId,
              watermark: msg.watermark
            });
            console.log(`[Webhook Read] Khách hàng ${msg.senderId} đã đọc tin trên Page ${msg.pageId} (watermark: ${msg.watermark})`);
          } catch (e) {
            console.warn('[Webhook] Error saving read watermark:', e.message);
          }
          continue;
        }

        // Look up registered page
        const page = getPageByPageId(msg.pageId);
        const pageName = page ? page.name : `Page ${msg.pageId}`;
        const accountLabel = page ? page.account_label : '';

        // Handle Page Echo (Outbound reply sent from Meta Business Suite / mobile app / another instance)
        if (msg.isEcho) {
          try {
            saveMessage({
              mid: msg.mid,
              page_id: msg.pageId,
              sender_id: msg.senderId,
              sender_name: pageName,
              text: msg.text,
              attachments: msg.attachments,
              timestamp: msg.timestamp,
              is_echo: 1
            });
            markConversationReplied(msg.pageId, msg.senderId);

            broadcastSSE('message_sent', {
              page_id: msg.pageId,
              sender_id: msg.senderId,
              text: msg.text,
              attachments: msg.attachments,
              timestamp: msg.timestamp,
              is_echo: 1,
              source: 'meta_business_suite',
              agent_name: pageName
            });
            console.log(`[Webhook Echo] Đồng bộ tin trả lời từ Meta Business Suite cho khách ${msg.senderId} (${pageName})`);
          } catch (echoErr) {
            console.error('[Webhook Echo] Error saving echo reply:', echoErr.message);
          }
          continue; // Skip inbound alerting & alarm dispatching
        }

        // Find all users who are currently on shift for this page
        const onDutyUsers = getActiveUsersOnShiftForPage(msg.pageId);

        // Attempt to fetch sender profile
        let senderName = 'Khách hàng Messenger';
        if (page && page.access_token) {
          try {
            const profile = await fetchSenderProfile(msg.senderId, page.access_token);
            if (profile && profile.name) {
              senderName = profile.name;
            }
          } catch (err) {
            console.warn('[Server] Error fetching sender profile:', err.message);
          }
        }

        // 1. Save to Database (Raw message & Conversations thread)
        try {
          saveMessage({
            mid: msg.mid,
            page_id: msg.pageId,
            sender_id: msg.senderId,
            sender_name: senderName,
            text: msg.text,
            attachments: msg.attachments,
            timestamp: msg.timestamp,
            is_echo: msg.isEcho ? 1 : 0
          });
        } catch (dbErr) {
          console.error('[Database] Failed to save message:', dbErr.message);
        }

        // 2. Broadcast live event to Web UI via SSE (tagged with target_user_ids on duty)
        const targetUserIds = onDutyUsers.map(u => u.id || u.user_id);
        const onDutyNames = onDutyUsers.map(u => u.name).join(', ');

        const eventData = {
          mid: msg.mid,
          page_id: msg.pageId,
          page_name: pageName,
          account_label: accountLabel,
          page_color: page ? page.color_tag : '#3b82f6',
          target_user_ids: targetUserIds,
          on_duty_users: onDutyNames,
          sender_id: msg.senderId,
          sender_name: senderName,
          text: msg.text,
          attachments: msg.attachments || [],
          timestamp: msg.timestamp
        };
        broadcastSSE('new_message', eventData);

        // 3. Dispatch Discord Webhook Notification (Guaranteed delivery to all configured channels)
        await dispatchDiscordAlert({
          pageId: msg.pageId,
          pageName,
          accountLabel,
          senderId: msg.senderId,
          senderName,
          text: msg.text,
          attachments: msg.attachments || [],
          timestamp: msg.timestamp
        });

        // 4. Dispatch Telegram & Phone Alarm to EACH user currently on shift!
        const globalSettings = getSettings();
        const host = getHostProfile();

        for (const dutyUser of onDutyUsers) {

          // Telegram Notification
          if (dutyUser.telegram_enabled === 'true') {
            const botToken = dutyUser.telegram_bot_token || globalSettings.global_telegram_bot_token;
            const chatId = dutyUser.telegram_chat_id;

            if (botToken && chatId) {
              try {
                await sendFacebookMessageAlert(
                  botToken,
                  chatId,
                  {
                    pageName,
                    pageId: msg.pageId,
                    accountLabel,
                    ownerName: dutyUser.name,
                    senderName,
                    messageText: msg.text,
                    timestamp: msg.timestamp
                  },
                  { apiRoot: getSetting('telegram_api_root') }
                );
                console.log(`[Telegram] Alert sent to on-duty user "${dutyUser.name}" for page "${pageName}"`);
              } catch (tgErr) {
                console.error(`[Telegram] Send alert failed for user ${dutyUser.name}:`, tgErr.message);
              }
            }
          }

          // Phone Alarm Call / Siren
          try {
            const alarmResult = await triggerAlarmForUser({
              user: dutyUser,
              pageId: msg.pageId,
              pageName,
              senderId: msg.senderId,
              senderName,
              messageText: msg.text
            });

            if (alarmResult.triggered) {
              console.log(`[Alarm] WAKE-UP CALL TRIGGERED (${alarmResult.method}) for user "${dutyUser.name}" on page "${pageName}"!`);
              broadcastSSE('alarm_triggered', {
                user_id: dutyUser.id,
                user_name: dutyUser.name,
                pageName,
                senderName,
                method: alarmResult.method
              });
            }
          } catch (alarmErr) {
            console.error(`[Alarm] Trigger error for user ${dutyUser.name}:`, alarmErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Webhook] Error processing incoming payload:', err);
    }
  })();
});

// -------------------------------------------------------------
// 2. Real-time Server-Sent Events (SSE) Endpoint
// -------------------------------------------------------------
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', time: Date.now() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// -------------------------------------------------------------
// 3. REST APIs for Multi-User Management
// -------------------------------------------------------------

app.get('/api/users', (req, res) => {
  try {
    const users = getAllUsers();
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const savedUser = saveOrUpdateUser(req.body);
    res.json({ ok: true, message: 'Đã lưu thông tin người dùng thành công!', user: savedUser });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    if (String(req.params.id) === '1') {
      return res.status(400).json({ ok: false, error: 'Không thể xóa tài khoản Quản trị viên mặc định!' });
    }
    deleteUser(req.params.id);
    res.json({ ok: true, message: 'Đã xóa người dùng thành công!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/users/:id/toggle-sleep', (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    const newAlarmState = user.alarm_enabled === 'true' ? 'false' : 'true';
    const updatedUser = saveOrUpdateUser({
      ...user,
      alarm_enabled: newAlarmState
    });

    res.json({
      ok: true,
      alarm_enabled: newAlarmState === 'true',
      message: newAlarmState === 'true' ? `Đã BẬT chế độ Đi ngủ cho ${user.name}` : `Đã TẮT chế độ Đi ngủ cho ${user.name}`,
      user: updatedUser
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Host Profile APIs (Self-Hosted Single Admin)
// -------------------------------------------------------------
app.get('/api/host-profile', (req, res) => {
  try {
    const host = getHostProfile();
    const globalSettings = getSettings();
    if ((!host.discord_webhook_url || host.discord_webhook_url === '') && globalSettings.global_discord_webhook_url) {
      host.discord_webhook_url = globalSettings.global_discord_webhook_url;
      updateHostProfile({ discord_webhook_url: host.discord_webhook_url });
    }
    res.json({ ok: true, host });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/host-profile', (req, res) => {
  try {
    const updated = updateHostProfile(req.body);
    if (req.body.discord_webhook_url !== undefined && req.body.discord_webhook_url.trim() !== '') {
      saveSettings({ global_discord_webhook_url: req.body.discord_webhook_url.trim() });
    }
    if (req.body.twilio_account_sid !== undefined && req.body.twilio_account_sid.trim() !== '') {
      saveSettings({ global_twilio_account_sid: req.body.twilio_account_sid.trim() });
    }
    if (req.body.twilio_auth_token !== undefined && req.body.twilio_auth_token.trim() !== '') {
      saveSettings({ global_twilio_auth_token: req.body.twilio_auth_token.trim() });
    }
    if (req.body.twilio_from_number !== undefined && req.body.twilio_from_number.trim() !== '') {
      saveSettings({ global_twilio_from_number: req.body.twilio_from_number.trim() });
    }
    if (req.body.twilio_to_number !== undefined && req.body.twilio_to_number.trim() !== '') {
      saveSettings({ twilio_to_number: req.body.twilio_to_number.trim() });
    }
    if (req.body.ntfy_topic !== undefined && req.body.ntfy_topic.trim() !== '') {
      saveSettings({ global_ntfy_topic: req.body.ntfy_topic.trim() });
    }
    if (req.body.callmebot_username !== undefined && req.body.callmebot_username.trim() !== '') {
      saveSettings({ callmebot_username: req.body.callmebot_username.trim() });
    }
    res.json({ ok: true, message: 'Đã lưu cấu hình Chủ Host thành công!', host: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Upload Custom Alarm Audio File (.mp3, .wav, .ogg, .m4a, .aac, .flac, .webm)
 */
app.post('/api/host-profile/upload-alarm-sound', (req, res) => {
  try {
    const data = req.body.data || req.body.file_data;
    const name = req.body.name || req.body.file_name;
    if (!data) {
      return res.status(400).json({ ok: false, error: 'Chưa có dữ liệu tệp âm thanh!' });
    }

    const uploadsDir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const originalName = name || 'custom_alarm.mp3';
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';

    const allowedExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm', 'wma', 'm4r'];
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({
        ok: false,
        error: `Định dạng .${ext} không được hỗ trợ! Vui lòng chọn file âm thanh (.mp3, .wav, .ogg, .m4a, .aac, .flac, .webm).`
      });
    }

    const safeBaseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `custom_alarm_${Date.now()}_${safeBaseName}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    const base64Data = data.replace(/^data:[^;]+;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const soundUrl = `/uploads/${fileName}`;

    // Update host profile with new custom sound URL and type
    const updated = updateHostProfile({
      custom_sound_url: soundUrl,
      web_sound_type: 'custom_file'
    });

    res.json({
      ok: true,
      message: 'Tải lên tệp âm thanh chuông báo thành công!',
      sound_url: soundUrl,
      host: updated
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Lỗi tải lên âm thanh: ' + err.message });
  }
});

app.post('/api/host-profile/toggle-sleep', (req, res) => {
  try {
    const host = getHostProfile();
    const newAlarmState = host.alarm_enabled === 'true' ? 'false' : 'true';
    const updated = updateHostProfile({
      alarm_enabled: newAlarmState
    });
    res.json({
      ok: true,
      alarm_enabled: newAlarmState === 'true',
      message: newAlarmState === 'true' ? 'Đã BẬT chế độ Đi ngủ (Sẵn sàng báo thức)' : 'Đã TẮT chế độ Đi ngủ',
      host: updated
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// My Shifts APIs (Lịch Trực Ca Của Tôi Theo Fanpage)
// -------------------------------------------------------------
app.get('/api/my-shifts', (req, res) => {
  try {
    const pageId = req.query.page_id || null;
    const shifts = getMyShifts(pageId);
    res.json({ ok: true, shifts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/my-shifts', (req, res) => {
  try {
    const host = getHostProfile();
    const { id, page_id, shift_name, shift_start, shift_end, is_active } = req.body;
    if (!page_id) {
      return res.status(400).json({ ok: false, error: 'Vui lòng chọn Fanpage!' });
    }
    const saved = addOrUpdatePageShift({
      id,
      page_id,
      user_id: host.id,
      shift_name: shift_name || 'Ca trực',
      shift_start: shift_start || '00:00',
      shift_end: shift_end || '23:59',
      is_active: is_active !== false
    });
    res.json({ ok: true, message: 'Đã lưu ca trực của bạn!', shift: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/my-shifts/:id', (req, res) => {
  try {
    deletePageShift(req.params.id);
    res.json({ ok: true, message: 'Đã xóa ca trực!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 4. REST APIs for 2-Column Conversations & Messages
// -------------------------------------------------------------

app.get('/api/conversations', (req, res) => {
  try {
    const { user_id, page_id, search, unreplied, unseen } = req.query;
    const conversations = getConversations({
      userId: user_id ? Number(user_id) : null,
      pageId: page_id || null,
      search: search || '',
      unrepliedOnly: unreplied === 'true',
      unseenOnly: unseen === 'true',
      limit: 100
    });
    res.json({ ok: true, conversations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Auto-Sync Engine: Continuously fetches latest conversations from Facebook Graph API.
 * Guarantees zero missed messages even if Webhook is delayed, blocked, or in Development mode!
 */
let isSyncing = false;
async function syncPagesInbox() {
  if (isSyncing) return 0;
  isSyncing = true;
  try {
    const pages = getAllPages().filter(p => p.is_active === 1 && p.access_token);
    let newMessagesCount = 0;

  for (const page of pages) {
    try {
      const url = `https://graph.facebook.com/v21.0/${page.page_id}/conversations?fields=id,updated_time,unread_count,senders,messages{id,message,from,created_time,attachments{id,mime_type,name,size,file_url,image_data,video_data}}&limit=10&access_token=${page.access_token}`;
      const res = await fetch(url);
      const fbDateHeader = res.headers.get('date');
      if (fbDateHeader) updateMetaClockOffset(fbDateHeader);
      const data = await res.json();
      if (data && data.error) {
        if (data.error.code === 190 && page.token_status !== 'EXPIRED') {
          updatePageTokenHealth(page.page_id, 'EXPIRED');
          console.warn(`[Auto-Sync] ⚠️ Page "${page.name}" Access Token đã HẾT HẠN (Code 190): ${data.error.message}`);
        }
        continue;
      }
      if (!data || !data.data || !Array.isArray(data.data)) continue;

      for (const conv of data.data) {
        // Two-way synchronization of Seen / Unseen status with Meta
        const customer = conv.senders?.data?.find(s => s.id !== page.page_id) || conv.senders?.data?.[0];
        const customerId = customer ? customer.id : null;

        if (customerId && conv.unread_count !== undefined) {
          const localConv = getConversation(page.page_id, customerId);
          if (localConv) {
            // If Meta says unread_count === 0, someone read it on Meta Business Suite
            if (conv.unread_count === 0 && localConv.is_seen === 0) {
              markConversationSeen(page.page_id, customerId);
              broadcastSSE('conversation_seen', {
                page_id: page.page_id,
                sender_id: customerId,
                seen_at: Date.now()
              });
              console.log(`[Meta Sync] Đồng bộ ĐÃ XEM từ Meta cho khách ${customerId} (${page.name})`);
            }
          }
        }

        if (!conv.messages || !conv.messages.data) continue;
        const msgs = [...conv.messages.data].reverse();

        for (const m of msgs) {
          if (!m.id || !m.from) continue;
          const isPageSender = m.from.id === page.page_id;

          let senderId = m.from.id;
          let senderName = m.from.name || 'Khách hàng';

          if (isPageSender) {
            const other = conv.senders?.data?.find(s => s.id !== page.page_id);
            if (other) {
              senderId = other.id;
              senderName = other.name || senderName;
            }
          }

          const timestamp = new Date(m.created_time).getTime();
          const isEcho = isPageSender ? 1 : 0;
          const text = m.message || '';

          // Extract all media and file attachments
          const rawAtts = m.attachments?.data || [];
          const attachments = rawAtts.map(att => {
            let url = '';
            if (att.image_data && att.image_data.url) url = att.image_data.url;
            else if (att.video_data && att.video_data.url) url = att.video_data.url;
            else if (att.file_url) url = att.file_url;
            else if (att.payload && att.payload.url) url = att.payload.url;
            else if (att.url) url = att.url;

            let type = 'file';
            const mime = (att.mime_type || '').toLowerCase();
            if (mime.startsWith('image') || att.image_data) {
              type = 'image';
            } else if (mime.startsWith('video') || att.video_data) {
              type = 'video';
            } else if (mime.startsWith('audio')) {
              type = 'audio';
            }

            return {
              id: att.id,
              type,
              url,
              name: att.name || '',
              mime_type: att.mime_type || '',
              size: att.size || null
            };
          }).filter(a => Boolean(a.url));

          const existing = db.prepare('SELECT id, timestamp FROM messages WHERE mid = ?').get(m.id);
          if (!existing) {
            newMessagesCount++;
            saveMessage({
              mid: m.id,
              page_id: page.page_id,
              sender_id: senderId,
              sender_name: isEcho ? page.name : senderName,
              text,
              attachments,
              timestamp,
              is_echo: isEcho
            });

            if (isEcho) {
              markConversationReplied(page.page_id, senderId);
              broadcastSSE('message_sent', {
                page_id: page.page_id,
                sender_id: senderId,
                text,
                attachments,
                timestamp,
                is_echo: 1,
                source: 'meta_sync',
                agent_name: page.name
              });
            } else {
              const onDutyUsers = getActiveUsersOnShiftForPage(page.page_id);
              const targetUserIds = onDutyUsers.map(u => u.id || u.user_id);
              const onDutyNames = onDutyUsers.map(u => u.name).join(', ');

              const eventData = {
                mid: m.id,
                page_id: page.page_id,
                page_name: page.name,
                account_label: page.account_label,
                page_color: page.color_tag || '#3b82f6',
                target_user_ids: targetUserIds,
                on_duty_users: onDutyNames,
                sender_id: senderId,
                sender_name: senderName,
                text,
                attachments,
                timestamp
              };

              broadcastSSE('new_message', eventData);

              // Dispatch Discord Webhook Notification (Guaranteed delivery to all configured channels)
              await dispatchDiscordAlert({
                pageId: page.page_id,
                pageName: page.name,
                accountLabel: page.account_label,
                senderId,
                senderName,
                text,
                attachments,
                timestamp
              });

              const globalSettings = getSettings();
              const host = getHostProfile();

              for (const dutyUser of onDutyUsers) {

                if (dutyUser.telegram_enabled === 'true') {
                  const botToken = dutyUser.telegram_bot_token || globalSettings.global_telegram_bot_token;
                  const chatId = dutyUser.telegram_chat_id;
                  if (botToken && chatId) {
                    try {
                      await sendFacebookMessageAlert(
                        botToken,
                        chatId,
                        {
                          pageName: page.name,
                          pageId: page.page_id,
                          accountLabel: page.account_label,
                          ownerName: dutyUser.name,
                          senderName,
                          messageText: text,
                          timestamp
                        },
                        { apiRoot: getSetting('telegram_api_root') }
                      );
                    } catch (tgErr) {}
                  }
                }

                try {
                  const alarmResult = await triggerAlarmForUser({
                    user: dutyUser,
                    pageId: page.page_id,
                    pageName: page.name,
                    senderId,
                    senderName,
                    messageText: text
                  });
                  if (alarmResult.triggered) {
                    broadcastSSE('alarm_triggered', {
                      user_id: dutyUser.id,
                      user_name: dutyUser.name,
                      pageName: page.name,
                      senderName,
                      method: alarmResult.method
                    });
                  }
                } catch (alarmErr) {}
              }
            }
          } else {
            // Auto-calibrate timestamp if drifted > 500ms from official Meta created_time
            if (Math.abs(existing.timestamp - timestamp) > 500) {
              db.prepare('UPDATE messages SET timestamp = ? WHERE id = ?').run(timestamp, existing.id);
            }
          }
        }

        if (customerId) {
          try {
            db.prepare(`
              UPDATE conversations 
              SET last_message_time = (
                SELECT MAX(timestamp) FROM messages 
                WHERE messages.page_id = ? AND messages.sender_id = ?
              )
              WHERE page_id = ? AND sender_id = ?
            `).run(page.page_id, customerId, page.page_id, customerId);
          } catch (e) {}
        }
      }
    } catch (err) {
      // Background sync silent warning
    }
  }
  return newMessagesCount;
  } finally {
    isSyncing = false;
  }
}

app.post('/api/conversations/sync', async (req, res) => {
  try {
    const newCount = await syncPagesInbox();
    res.json({ ok: true, message: `Đã đồng bộ xong! Phát hiện ${newCount} tin nhắn mới.`, newCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/conversations/:pageId/:senderId/messages', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const messages = getConversationMessages(pageId, senderId, limit);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations/:pageId/:senderId/mark-replied', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    markConversationReplied(pageId, senderId);
    res.json({ ok: true, message: 'Đã đánh dấu đã trả lời!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/conversations/:pageId/:senderId/send-message', async (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const { text, attachment } = req.body;

    const trimmedText = (text || '').trim();
    if (!trimmedText && !attachment) {
      return res.status(400).json({ ok: false, error: 'Nội dung tin nhắn hoặc tệp đính kèm không được để trống!' });
    }

    const page = getPageByPageId(pageId);
    if (!page || !page.access_token) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy Fanpage hoặc Access Token!' });
    }

    // Process attachment if provided
    let savedAttachment = null;
    let fbAttachment = null;

    if (attachment) {
      let attachmentUrl = attachment.url || '';
      const attachmentType = attachment.type || 'image';
      const attachmentName = attachment.name || 'file';
      const attachmentSize = attachment.size || null;

      // If base64 data provided, save to public/uploads
      if (attachment.data) {
        const uploadsDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const safeName = attachmentName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${Date.now()}_${safeName}`;
        const filePath = path.join(uploadsDir, fileName);

        const base64Data = attachment.data.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        const publicBase = currentPublicUrl || `http://localhost:${PORT}`;
        attachmentUrl = `${publicBase}/uploads/${fileName}`;
      }

      if (attachmentUrl) {
        savedAttachment = {
          type: attachmentType,
          url: attachmentUrl,
          name: attachmentName,
          size: attachmentSize
        };
        fbAttachment = {
          type: attachmentType,
          url: attachmentUrl
        };
      }
    }

    // Call Facebook Send API
    const sendResult = await sendFacebookMessage(page.access_token, senderId, trimmedText, fbAttachment);

    // Save as echo/sent message with Meta-synchronized timestamp
    const timestamp = sendResult?.timestamp || getMetaSyncedNow();
    const attachmentsList = savedAttachment ? [savedAttachment] : [];

    saveMessage({
      mid: sendResult?.messageId || `sent_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      page_id: pageId,
      sender_id: senderId,
      sender_name: page.name,
      text: trimmedText,
      attachments: attachmentsList,
      timestamp,
      is_echo: 1
    });

    // Mark conversation replied
    markConversationReplied(pageId, senderId);

    const agentName = (req.body && req.body.agent_name && req.body.agent_name.trim()) ? req.body.agent_name.trim() : (page.name || 'Nhân viên');

    // Broadcast SSE
    broadcastSSE('message_sent', {
      page_id: pageId,
      sender_id: senderId,
      text: trimmedText,
      attachments: attachmentsList,
      timestamp,
      agent_name: agentName,
      source: 'tool_reply'
    });

    res.json({ 
      ok: true, 
      message: 'Đã gửi tin nhắn thành công!', 
      result: sendResult,
      attachment: savedAttachment
    });
  } catch (err) {
    console.error('[Send Message] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Broadcast real-time agent typing indicator
app.post('/api/conversations/:pageId/:senderId/typing', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const agentName = (req.body && req.body.agent_name && req.body.agent_name.trim()) ? req.body.agent_name.trim() : 'Nhân viên';
    broadcastSSE('agent_typing', {
      page_id: pageId,
      sender_id: senderId,
      agent_name: agentName,
      timestamp: Date.now()
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark conversation seen by agent & sync to Meta Graph API
app.post('/api/conversations/:pageId/:senderId/mark-seen', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const result = markConversationSeen(pageId, senderId);

    // Sync mark_seen to Meta Graph API
    const page = getPageByPageId(pageId);
    if (page && page.access_token) {
      sendMarkSeen(page.access_token, senderId).catch(err => {
        console.warn('[Meta Mark Seen] Async error:', err.message);
      });
    }

    broadcastSSE('conversation_seen', {
      page_id: pageId,
      sender_id: senderId,
      seen_at: result.seenAt
    });
    res.json({ ok: true, message: 'Đã đánh dấu đã xem và đồng bộ với Meta!', seen_at: result.seenAt });
  } catch (err) {
    console.error('[Mark Seen] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark conversation unseen / unread
app.post('/api/conversations/:pageId/:senderId/mark-unseen', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    markConversationUnseen(pageId, senderId);
    broadcastSSE('conversation_unseen', {
      page_id: pageId,
      sender_id: senderId
    });
    res.json({ ok: true, is_seen: 0, unread_count: 1, message: 'Đã đánh dấu chưa xem!' });
  } catch (err) {
    console.error('[Mark Unseen] Error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Customer CRM, Tags & Internal Notes APIs
// -------------------------------------------------------------

// Get Customer CRM profile, tags and notes
app.get('/api/conversations/:pageId/:senderId/crm', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const crm = getCustomerCrm(pageId, senderId);
    res.json({ ok: true, crm });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update Customer CRM profile (phone, address, tags)
app.post('/api/conversations/:pageId/:senderId/crm', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const { phone, address, tags } = req.body || {};
    const updated = updateCustomerCrm(pageId, senderId, { phone, address, tags });

    broadcastSSE('crm_updated', {
      page_id: pageId,
      sender_id: senderId,
      crm: updated
    });

    res.json({ ok: true, message: 'Đã cập nhật hồ sơ khách hàng thành công!', crm: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add Internal Staff Note
app.post('/api/conversations/:pageId/:senderId/notes', (req, res) => {
  try {
    const { pageId, senderId } = req.params;
    const { content, author_name } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, error: 'Nội dung ghi chú không được để trống!' });
    }

    const host = getHostProfile();
    const effectiveAuthor = (author_name && author_name.trim()) || host?.name || 'Nhân viên';

    const newNote = addCustomerNote({
      page_id: pageId,
      sender_id: senderId,
      author_name: effectiveAuthor,
      content: content.trim()
    });

    broadcastSSE('crm_note_added', {
      page_id: pageId,
      sender_id: senderId,
      note: newNote
    });

    res.json({ ok: true, message: 'Đã thêm ghi chú nội bộ!', note: newNote });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete Internal Staff Note
app.delete('/api/notes/:id', (req, res) => {
  try {
    deleteCustomerNote(req.params.id);
    res.json({ ok: true, message: 'Đã xóa ghi chú!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Tags Catalogue Management
app.get('/api/tags', (req, res) => {
  try {
    const tags = getAllTags();
    res.json({ ok: true, tags });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tags', (req, res) => {
  try {
    const { name, color, bg_color } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Tên thẻ tag không được để trống!' });
    }
    const tag = createTag({ name: name.trim(), color, bg_color });
    res.json({ ok: true, message: 'Đã tạo thẻ tag thành công!', tag });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/tags/:id', (req, res) => {
  try {
    deleteTag(req.params.id);
    res.json({ ok: true, message: 'Đã xóa thẻ tag!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// User activity heartbeat & sleep state management
app.post('/api/host-profile/heartbeat', (req, res) => {
  try {
    const host = getHostProfile();
    updateUserActivity(host.id);
    res.json({ 
      ok: true, 
      is_sleeping: host.alarm_enabled === 'true',
      auto_sleep_enabled: host.auto_sleep_enabled === 'true',
      auto_sleep_idle_minutes: Number(host.auto_sleep_idle_minutes) || 10
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/host-profile/auto-sleep', (req, res) => {
  try {
    const updated = updateHostProfile({ alarm_enabled: 'true' });
    broadcastSSE('user_sleep_state_changed', { is_sleeping: true, reason: 'auto_sleep_idle' });
    console.log('[Auto-Sleep] Chế Độ Đi Ngủ được kích hoạt tự động do không có tương tác');
    res.json({ ok: true, host: updated, message: 'Đã tự động chuyển sang Chế Độ Đi Ngủ' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/host-profile/wake-up', (req, res) => {
  try {
    const host = getHostProfile();
    updateUserActivity(host.id);
    const updated = updateHostProfile({ alarm_enabled: 'false' });
    broadcastSSE('user_sleep_state_changed', { is_sleeping: false, reason: 'user_active' });
    console.log('[Auto-Sleep] Người dùng đã tương tác lại, đánh thức về chế độ ban ngày');
    res.json({ ok: true, host: updated, message: 'Đã đánh thức về chế độ ban ngày' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5. REST APIs for Quick Replies (Mẫu câu nhanh)
// -------------------------------------------------------------

app.get('/api/quick-replies', (req, res) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const replies = getQuickReplies(userId);
    res.json({ ok: true, replies });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/quick-replies', (req, res) => {
  try {
    const { id, user_id, title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ ok: false, error: 'Thiếu tiêu đề hoặc nội dung mẫu câu!' });
    }
    const saved = saveQuickReply({ id, user_id, title, content });
    res.json({ ok: true, message: 'Đã lưu mẫu câu thành công!', reply: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/quick-replies/:id', (req, res) => {
  try {
    deleteQuickReply(req.params.id);
    res.json({ ok: true, message: 'Đã xóa mẫu câu!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 6. Token Health Check API
// -------------------------------------------------------------

app.post('/api/pages/health-check', async (req, res) => {
  try {
    const pages = getAllPages();
    const results = [];

    for (const page of pages) {
      const check = await checkTokenHealth(page.page_id, page.access_token);
      updatePageTokenHealth(page.page_id, check.status);
      results.push({
        page_id: page.page_id,
        name: page.name,
        status: check.status,
        error: check.error || null
      });
    }

    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/pages/:pageId/debug-token', async (req, res) => {
  try {
    const { pageId } = req.params;
    const page = getPageByPageId(pageId);
    if (!page) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy Fanpage!' });
    }

    let appId = '';
    let appSecret = '';
    if (page.token_source_id) {
      const source = getTokenSourceById(page.token_source_id);
      if (source) {
        appId = source.app_id || '';
        appSecret = source.app_secret || '';
      }
    }

    const debugResult = await debugToken({
      token: page.access_token,
      appId,
      appSecret
    });

    // If verified as permanent and page is not yet marked, auto-upgrade is_permanent
    if (debugResult.isPermanent && page.is_permanent !== 1) {
      saveOrUpdatePage({
        ...page,
        is_permanent: 1
      });
    }

    res.json({
      ok: true,
      pageId: page.page_id,
      name: page.name,
      debug: debugResult
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 7. Pages Management APIs
// -------------------------------------------------------------

app.get('/api/pages', (req, res) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const pages = getAllPages(userId);
    res.json({ ok: true, pages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/pages', async (req, res) => {
  try {
    const { page_id, access_token, user_id, account_label, color_tag, auto_subscribe } = req.body;
    if (!access_token) {
      return res.status(400).json({ ok: false, error: 'Thiếu Page Access Token!' });
    }

    let pageDetails;
    try {
      pageDetails = await fetchPageDetails(page_id, access_token);
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: `Không thể xác thực Page Token: ${err.message}`
      });
    }

    const effectiveToken = pageDetails.pageAccessToken || access_token.trim();

    let subscribedAt = '';
    if (auto_subscribe !== false) {
      try {
        await subscribePageWebhook(pageDetails.pageId, effectiveToken);
        subscribedAt = new Date().toISOString();
      } catch (subErr) {
        console.warn(`[Facebook] Subscribing webhook warning: ${subErr.message}`);
      }
    }

    saveOrUpdatePage({
      page_id: pageDetails.pageId,
      name: pageDetails.name,
      access_token: effectiveToken,
      user_id: user_id ? Number(user_id) : 1,
      account_label: account_label ? account_label.trim() : '',
      color_tag: color_tag || '#3b82f6',
      token_status: 'VALID',
      avatar_url: pageDetails.avatarUrl || '',
      subscribed_at: subscribedAt
    });

    res.json({
      ok: true,
      message: `Đã kết nối thành công Fanpage "${pageDetails.name}"!`,
      page: {
        page_id: pageDetails.pageId,
        name: pageDetails.name,
        user_id: user_id || 1,
        avatar_url: pageDetails.avatarUrl,
        subscribed_at: subscribedAt,
        allPages: pageDetails.allPages || null
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/pages/fetch-from-token', async (req, res) => {
  try {
    const { token, app_id, app_secret, account_label } = req.body || {};
    if (!token || !token.trim()) {
      return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp Access Token!' });
    }

    const result = await fetchPagesFromToken({
      token: token.trim(),
      app_id: app_id ? app_id.trim() : '',
      app_secret: app_secret ? app_secret.trim() : ''
    });

    // Auto-save or update Token Source in Vault
    let tokenSourceId = 0;
    if (app_id && app_secret) {
      const sourceName = account_label?.trim() || result.userName || `Tài khoản App ${app_id.trim()}`;
      const savedSource = saveOrUpdateTokenSource({
        name: sourceName,
        app_id: app_id.trim(),
        app_secret: app_secret.trim(),
        user_token: token.trim(),
        long_lived_token: result.longLivedToken || token.trim(),
        token_type: result.isPermanent ? 'LONG_LIVED' : 'SHORT_LIVED',
        is_permanent: result.isPermanent ? 1 : 0,
        pages_count: result.pages ? result.pages.length : 0
      });
      if (savedSource) tokenSourceId = savedSource.id;
    } else if (account_label && account_label.trim()) {
      const savedSource = saveOrUpdateTokenSource({
        name: account_label.trim(),
        app_id: '',
        app_secret: '',
        user_token: token.trim(),
        long_lived_token: result.longLivedToken || token.trim(),
        token_type: 'USER_TOKEN',
        is_permanent: 0,
        pages_count: result.pages ? result.pages.length : 0
      });
      if (savedSource) tokenSourceId = savedSource.id;
    }

    res.json({
      ok: true,
      ...result,
      token_source_id: tokenSourceId
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/pages/bulk-import', async (req, res) => {
  try {
    const { user_id = 1, account_label = '', token_source_id = 0, pages = [] } = req.body;
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ ok: false, error: 'Chưa có Fanpage nào được chọn để thêm!' });
    }

    const effectiveTokenSourceId = Number(token_source_id) || 0;
    const imported = [];
    for (const p of pages) {
      let subscribedAt = '';
      try {
        await subscribePageWebhook(p.page_id, p.access_token);
        subscribedAt = new Date().toISOString();
      } catch (subErr) {
        console.warn(`[Bulk Import] Subscribe warning for ${p.page_id}: ${subErr.message}`);
      }

      saveOrUpdatePage({
        page_id: p.page_id,
        name: p.name,
        access_token: p.access_token,
        user_id: Number(user_id) || 1,
        account_label: (p.account_label || account_label || '').trim(),
        color_tag: p.color_tag || '#3b82f6',
        token_status: 'VALID',
        avatar_url: p.avatar_url || '',
        subscribed_at: subscribedAt,
        token_source_id: p.token_source_id || effectiveTokenSourceId || 0,
        is_permanent: p.is_permanent ? 1 : 0
      });

      imported.push({
        page_id: p.page_id,
        name: p.name,
        subscribed: Boolean(subscribedAt),
        is_permanent: Boolean(p.is_permanent)
      });
    }

    // Update pages_count in token_sources if applicable
    if (effectiveTokenSourceId) {
      const source = getTokenSourceById(effectiveTokenSourceId);
      if (source) {
        const countRow = db.prepare('SELECT COUNT(*) as count FROM pages WHERE token_source_id = ?').get(effectiveTokenSourceId);
        saveOrUpdateTokenSource({
          ...source,
          pages_count: countRow ? countRow.count : imported.length
        });
      }
    }

    res.json({
      ok: true,
      message: `Đã kết nối thành công ${imported.length} Fanpage vào hệ thống!`,
      imported
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Token Sources Management (Kho Token Đã Lưu)
// -------------------------------------------------------------
app.get('/api/token-sources', (req, res) => {
  try {
    const sources = getTokenSourcesWithPages();
    res.json({ ok: true, tokenSources: sources });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/token-sources/:id/update-app', (req, res) => {
  try {
    const sourceId = Number(req.params.id);
    const { name, app_id, app_secret } = req.body || {};
    const updated = updateTokenSourceAppCredentials({
      id: sourceId,
      name,
      app_id,
      app_secret
    });
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy tài khoản để cập nhật!' });
    }
    res.json({
      ok: true,
      message: 'Đã cập nhật thông tin App cho tài khoản thành công!',
      account: {
        ...updated,
        has_app_secret: Boolean(updated.app_secret),
        app_secret_masked: updated.app_secret ? (updated.app_secret.substring(0, 4) + '••••••••' + updated.app_secret.slice(-4)) : ''
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/token-sources', (req, res) => {
  try {
    const { id, name, app_id, app_secret, user_token } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'Thiếu tên ghi chú tài khoản / Token!' });
    }
    if (!user_token || !user_token.trim()) {
      return res.status(400).json({ ok: false, error: 'Thiếu mã Token!' });
    }
    const saved = saveOrUpdateTokenSource({
      id,
      name: name.trim(),
      app_id: app_id ? app_id.trim() : '',
      app_secret: app_secret ? app_secret.trim() : '',
      user_token: user_token.trim()
    });
    res.json({ ok: true, message: 'Đã lưu nguồn Token thành công!', tokenSource: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/token-sources/:id', (req, res) => {
  try {
    deleteTokenSource(req.params.id);
    res.json({ ok: true, message: 'Đã xóa nguồn Token khỏi kho lưu trữ!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/token-sources/:id/scan', async (req, res) => {
  try {
    const source = getTokenSourceById(req.params.id);
    if (!source) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy nguồn Token!' });
    }
    const tokenToUse = source.long_lived_token || source.user_token;
    const result = await fetchPagesFromToken({
      token: tokenToUse,
      app_id: source.app_id,
      app_secret: source.app_secret
    });

    if (result.pages && result.pages.length) {
      saveOrUpdateTokenSource({
        id: source.id,
        name: source.name,
        app_id: source.app_id,
        app_secret: source.app_secret,
        user_token: source.user_token,
        long_lived_token: result.longLivedToken || source.long_lived_token,
        token_type: result.isPermanent ? 'LONG_LIVED' : source.token_type,
        is_permanent: result.isPermanent ? 1 : source.is_permanent,
        pages_count: result.pages.length
      });
    }

    res.json({
      ok: true,
      ...result,
      token_source_id: source.id,
      tokenSource: source
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/token-sources/:id/renew', async (req, res) => {
  try {
    const sourceId = Number(req.params.id);
    const source = getTokenSourceById(sourceId);
    if (!source) {
      return res.status(404).json({ ok: false, error: 'Không tìm thấy nguồn Token cần gia hạn!' });
    }

    const {
      token,
      app_id,
      app_secret,
      name
    } = req.body || {};

    if (!token || !token.trim()) {
      return res.status(400).json({ ok: false, error: 'Vui lòng cung cấp mã User Token mới!' });
    }

    const cleanToken = token.trim();
    const effectiveAppId = (app_id !== undefined && app_id !== '') ? app_id.trim() : (source.app_id || '');
    const effectiveAppSecret = (app_secret !== undefined && app_secret !== '') ? app_secret.trim() : (source.app_secret || '');
    const effectiveName = (name && name.trim()) ? name.trim() : source.name;

    // Fetch and exchange to Long-Lived / Permanent token
    const fetchResult = await fetchPagesFromToken({
      token: cleanToken,
      app_id: effectiveAppId,
      app_secret: effectiveAppSecret
    });

    // Update token source record in database
    const updatedSource = saveOrUpdateTokenSource({
      id: source.id,
      name: effectiveName,
      app_id: effectiveAppId,
      app_secret: effectiveAppSecret,
      user_token: cleanToken,
      long_lived_token: fetchResult.longLivedToken || cleanToken,
      token_type: fetchResult.isPermanent ? 'LONG_LIVED' : 'SHORT_LIVED',
      is_permanent: fetchResult.isPermanent ? 1 : 0,
      pages_count: fetchResult.pages ? fetchResult.pages.length : source.pages_count
    });

    // Auto-update all existing pages in DB linked to this token_source_id
    const existingPages = db.prepare('SELECT * FROM pages WHERE token_source_id = ?').all(source.id);
    let updatedPagesCount = 0;

    if (fetchResult.pages && fetchResult.pages.length) {
      for (const ep of existingPages) {
        const freshPage = fetchResult.pages.find(p => p.page_id === ep.page_id);
        if (freshPage) {
          saveOrUpdatePage({
            ...ep,
            name: freshPage.name || ep.name,
            access_token: freshPage.access_token,
            token_status: 'VALID',
            is_permanent: freshPage.is_permanent ? 1 : (fetchResult.isPermanent ? 1 : 0)
          });
          // Re-subscribe webhook with new token
          try {
            await subscribePageWebhook(ep.page_id, freshPage.access_token);
          } catch (e) {}
          updatedPagesCount++;
        }
      }
    }

    res.json({
      ok: true,
      message: `Đã đổi thành công sang Token Vĩnh Viễn và cập nhật quyền cho ${updatedPagesCount} Fanpage!`,
      tokenSource: updatedSource,
      updatedPagesCount,
      discoveredPages: fetchResult.pages || []
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Facebook OAuth 2.0 Multi-Account Authentication
// -------------------------------------------------------------
function getOAuthRedirectUri(req) {
  if (req.query && req.query.redirect_uri) {
    return req.query.redirect_uri;
  }
  const settings = getSettings();
  const host = req.get('host') || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';

  if (settings.public_url && host.includes('trycloudflare.com')) {
    return `${settings.public_url.replace(/\/+$/, '')}/auth/facebook/callback`;
  }
  return `${proto}://${host}/auth/facebook/callback`;
}

app.get('/api/facebook-app-config', (req, res) => {
  try {
    const config = getFacebookAppConfig();
    const settings = getSettings();
    const host = req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';

    const localRedirect = 'http://localhost:3000/auth/facebook/callback';
    const currentRedirect = `${proto}://${host}/auth/facebook/callback`;
    const tunnelRedirect = settings.public_url ? `${settings.public_url.replace(/\/+$/, '')}/auth/facebook/callback` : '';

    const redirectUris = [localRedirect];
    if (tunnelRedirect && !redirectUris.includes(tunnelRedirect)) redirectUris.push(tunnelRedirect);
    if (!redirectUris.includes(currentRedirect)) redirectUris.push(currentRedirect);

    res.json({
      ok: true,
      appId: config.appId || '',
      hasAppSecret: Boolean(config.appSecret),
      redirectUris
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/facebook-app-config', (req, res) => {
  try {
    const { app_id, app_secret } = req.body || {};
    if (!app_id || !String(app_id).trim()) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập App ID (Mã ứng dụng)!' });
    }
    const saved = saveFacebookAppConfig({
      appId: app_id,
      appSecret: app_secret
    });
    res.json({
      ok: true,
      message: 'Đã lưu cấu hình Facebook App thành công!',
      appId: saved.appId,
      hasAppSecret: Boolean(saved.appSecret)
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// In-memory registry for active OAuth sessions mapped by nonce for multi-account isolation
const pendingOAuthSessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, sess] of pendingOAuthSessions.entries()) {
    if (now - sess.createdAt > 15 * 60 * 1000) {
      pendingOAuthSessions.delete(nonce);
    }
  }
}, 10 * 60 * 1000).unref();

app.get('/auth/facebook', (req, res) => {
  try {
    const appConfig = getFacebookAppConfig();
    let targetAppId = (req.query.app_id ? String(req.query.app_id).trim() : '') || appConfig.appId;
    let targetAppSecret = (req.query.app_secret ? String(req.query.app_secret).trim() : '');
    const accountId = req.query.account_id ? Number(req.query.account_id) : null;
    const accountName = req.query.account_name ? String(req.query.account_name).trim() : '';

    if (accountId) {
      const existingAcc = getTokenSourceById(accountId);
      if (existingAcc) {
        if (!targetAppId && existingAcc.app_id) targetAppId = existingAcc.app_id;
        if (!targetAppSecret && existingAcc.app_secret) targetAppSecret = existingAcc.app_secret;
      }
    }

    if (targetAppId && !targetAppSecret) {
      const match = getAllTokenSources().find(s => s.app_id === targetAppId && s.app_secret);
      if (match) {
        targetAppSecret = match.app_secret;
      } else if (appConfig.appId === targetAppId && appConfig.appSecret) {
        targetAppSecret = appConfig.appSecret;
      }
    }

    if (!targetAppId) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Cần Cấu Hình Facebook App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { background: #0b132b; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { max-width: 520px; background: #1e293b; padding: 30px; border-radius: 14px; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; }
          .btn-primary { background: #10b981; color: #000; border: none; padding: 12px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%; margin-bottom: 10px; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }
          .btn-secondary { background: #334155; color: #f8fafc; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; }
          .btn-primary:hover { background: #059669; }
          .btn-secondary:hover { background: #475569; }
        </style>
        </head><body>
          <div class="card">
            <div style="font-size: 38px; margin-bottom: 8px;">💡</div>
            <h3 style="color: #60a5fa; margin: 0 0 10px 0; font-size: 19px;">Tại Sao Cần Cấu Hình Facebook App?</h3>
            <p style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 16px; text-align: left;">
              Khác với các bên thứ 3 (Pancake, Fchat) lưu dữ liệu trên máy chủ của họ, <strong>FB Multi-Hub chạy độc lập 100% trên máy tính của bạn (Self-Hosted)</strong> để bảo mật tuyệt đối dữ liệu khách hàng. Để dùng Đăng Nhập 1-Click tự động, Meta quy định bạn cần có App ID của chính mình để cấp quyền.
            </p>
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 18px; text-align: left;">
              <strong style="color: #34d399; font-size: 13px;">🚀 Bạn không muốn tạo App Meta?</strong>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
                Bạn hoàn toàn có thể kết nối Fanpage ngay lập tức bằng cách <strong>Dán Token Facebook trực tiếp</strong> (chỉ mất 20 giây)!
              </div>
            </div>
            <button class="btn-primary" onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_DIRECT_TOKEN_MODAL'},'*'); } catch(e){} } window.close();">
              <span>🔑</span> Dán Token Trực Tiếp (Không Cần App ID)
            </button>
            <button class="btn-secondary" onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_FB_APP_CONFIG'},'*'); } catch(e){} } window.close();">
              <span>⚙️</span> Cài Đặt Facebook App ID &amp; Secret
            </button>
            <div style="margin-top: 14px;">
              <a href="#" onclick="window.close(); return false;" style="color: #64748b; font-size: 12px; text-decoration: none;">Đóng cửa sổ này</a>
            </div>
          </div>
        </body></html>
      `);
    }

    const redirectUri = getOAuthRedirectUri(req);
    const isPopup = req.query.popup === '1';
    const isReauth = req.query.reauth === '1';

    const nonce = Math.random().toString(36).substring(2, 12);
    pendingOAuthSessions.set(nonce, {
      appId: targetAppId,
      appSecret: targetAppSecret,
      accountId,
      accountName,
      redirectUri,
      isPopup,
      createdAt: Date.now()
    });

    const stateObj = {
      popup: isPopup ? '1' : '0',
      nonce,
      redirect_uri: redirectUri,
      app_id: targetAppId
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

    const authUrl = generateFacebookAuthUrl({
      appId: targetAppId,
      redirectUri,
      state,
      reauth: isReauth
    });

    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send(`Lỗi tạo link đăng nhập Facebook: ${err.message}`);
  }
});

/**
 * Helper to diagnose Facebook OAuth errors and provide clear actionable guidance
 */
function diagnoseOAuthError(errorStr) {
  const str = String(errorStr || '').toLowerCase();
  if (str.includes('redirect_uri') || str.includes('191') || str.includes('url isn\'t included') || str.includes('domain') || str.includes('cant load url') || str.includes('can\'t load url')) {
    return {
      type: 'REDIRECT_URI_MISMATCH',
      code: '191',
      title: 'Sai lệch Redirect URI (URL Chuyển Hướng)',
      hint: 'Bạn chưa dán đúng URL callback vào Meta Developer Portal. Hãy vào App FB > Facebook Login for Business > Settings > mục "Valid OAuth Redirect URIs", dán đúng link callback hệ thống cung cấp và bấm Lưu thay đổi.',
      suggestedFix: 'Dán lại link callback vào App Settings hoặc chuyển sang Cách B (Dán Token trực tiếp)'
    };
  }
  if (str.includes('secret') || str.includes('appsecret') || str.includes('client_secret') || str.includes('invalid verification code') || str.includes('code exchange error [1]')) {
    return {
      type: 'INVALID_APP_SECRET',
      code: '1',
      title: 'Sai Khóa Bí Mật Ứng Dụng (App Secret) hoặc App ID',
      hint: 'App Secret không trùng khớp với App ID này. Hãy vào Cài đặt ứng dụng > Thông tin cơ bản, bấm "Hiển thị" (Show) ở mục Khóa bí mật và sao chép lại chuỗi mã 32 ký tự.',
      suggestedFix: 'Nhập lại App Secret chính xác ở Bước 1'
    };
  }
  if (str.includes('expired') || str.includes('has been used') || str.includes('code expired')) {
    return {
      type: 'CODE_EXPIRED',
      code: '100',
      title: 'Mã xác thực đã hết hạn',
      hint: 'Phiên xác thực Facebook tạm thời đã kết thúc trước khi hoàn tất trao đổi token. Vui lòng bấm Đăng nhập lại.',
      suggestedFix: 'Bấm Đăng Nhập Lại'
    };
  }
  if (str.includes('cancel') || str.includes('hủy') || str.includes('denied') || str.includes('access_denied')) {
    return {
      type: 'USER_CANCELLED',
      code: 'CANCELLED',
      title: 'Đã hủy thao tác đăng nhập',
      hint: 'Cửa sổ xác thực Facebook đã bị đóng hoặc bạn đã bấm nút Hủy khi cấp quyền.',
      suggestedFix: 'Bấm Đăng Nhập Lại hoặc chọn Cách B (Dán Token)'
    };
  }
  return {
    type: 'OAUTH_ERROR',
    code: 'UNKNOWN',
    title: 'Lỗi xác thực Facebook',
    hint: 'Quá trình xác thực gặp trở ngại từ Meta Graph API hoặc mạng. Hãy kiểm tra lại thông tin App ID & Secret hoặc sử dụng Cách B (Dán Token Facebook trực tiếp không cần OAuth).',
    suggestedFix: 'Dùng Cách B: Dán Token Facebook Trực Tiếp'
  };
}

app.get('/auth/facebook/callback', async (req, res) => {
  let isPopup = false;
  let stateRedirectUri = '';
  let nonce = '';
  let stateAppId = '';

  try {
    if (req.query.state) {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.state, 'base64url').toString('utf-8'));
        isPopup = decoded.popup === '1';
        stateRedirectUri = decoded.redirect_uri || '';
        nonce = decoded.nonce || '';
        stateAppId = decoded.app_id || '';
      } catch (e) {}
    }

    // Check for user cancellation or error from Facebook
    if (req.query.error) {
      const errorMsg = req.query.error_description || req.query.error_message || req.query.error || 'Đã hủy cấp quyền Facebook';
      const diag = diagnoseOAuthError(errorMsg);
      if (isPopup) {
        return res.send(`
          <!DOCTYPE html><html><head><meta charset="utf-8"><title>Chưa Hoàn Tất Đăng Nhập</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>body{background:#0b132b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}</style>
          </head><body>
            <div style="max-width:500px;background:#1e293b;padding:26px;border-radius:12px;border:1px solid #f59e0b;box-shadow:0 12px 36px rgba(0,0,0,0.6);text-align:left;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <span style="font-size:24px;">⚠️</span>
                <h3 style="margin:0;color:#fbbf24;font-size:17px;">${diag.title}</h3>
              </div>
              <p style="color:#cbd5e1;font-size:13px;line-height:1.5;margin-bottom:12px;">${diag.hint}</p>
              <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 10px;margin-bottom:16px;font-family:monospace;font-size:11px;color:#94a3b8;word-break:break-all;">
                Chi tiết: ${errorMsg}
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <button onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_DIRECT_TOKEN_MODAL'},'*'); } catch(e){} } window.close();" style="background:#10b981;color:#000;border:none;padding:10px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <span>🔑</span> Thử Dán Token Trực Tiếp (Cách B - 100% Không Cần App ID)
                </button>
                <button onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_FB_APP_CONFIG'},'*'); } catch(e){} } window.close();" style="background:#334155;color:#f8fafc;border:1px solid #475569;padding:9px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px;">
                  <span>⚙️</span> Kiểm Tra Lại App ID &amp; Secret ở Bước 1
                </button>
                <button onclick="window.close()" style="background:transparent;color:#94a3b8;border:none;padding:6px;cursor:pointer;font-size:12px;">
                  Đóng cửa sổ
                </button>
              </div>
            </div>
            <script>
              if (window.opener) {
                try {
                  window.opener.postMessage({
                    type: 'FB_AUTH_ERROR',
                    error: ${JSON.stringify(errorMsg)},
                    diagnosis: ${JSON.stringify(diag)}
                  }, '*');
                } catch(e) {}
              }
            </script>
          </body></html>
        `);
      }
      return res.redirect(`/?fb_error=${encodeURIComponent(errorMsg)}&fb_diag_title=${encodeURIComponent(diag.title)}&fb_diag_hint=${encodeURIComponent(diag.hint)}&fb_diag_type=${encodeURIComponent(diag.type)}`);
    }

    const { code } = req.query;
    if (!code) {
      throw new Error('Không nhận được mã code xác thực từ Facebook!');
    }

    const session = (nonce && pendingOAuthSessions.get(nonce)) || {};
    const appConfig = getFacebookAppConfig();
    const targetAppId = session.appId || stateAppId || appConfig.appId;
    let targetAppSecret = session.appSecret || '';

    if (!targetAppSecret && targetAppId) {
      if (session.accountId) {
        targetAppSecret = getTokenSourceById(session.accountId)?.app_secret || '';
      }
      if (!targetAppSecret) {
        const match = getAllTokenSources().find(s => s.app_id === targetAppId && s.app_secret);
        if (match) targetAppSecret = match.app_secret;
        else if (appConfig.appId === targetAppId) targetAppSecret = appConfig.appSecret;
      }
    }

    const redirectUri = stateRedirectUri || getOAuthRedirectUri(req);

    // Orchestrate complete OAuth flow
    const oauthResult = await handleFacebookOAuthFlow({
      appId: targetAppId,
      appSecret: targetAppSecret,
      redirectUri,
      code
    });

    const user = oauthResult.user;
    const pages = oauthResult.pages || [];

    // Save or update account in Token Vault (token_sources)
    const tokenSource = saveOrUpdateTokenSource({
      id: session.accountId || undefined,
      name: session.accountName || user.name || `Tài khoản FB ${user.id}`,
      fb_user_id: user.id || '',
      avatar_url: user.picture || '',
      email: user.email || '',
      app_id: targetAppId,
      app_secret: targetAppSecret,
      user_token: oauthResult.userToken,
      long_lived_token: oauthResult.longLivedToken,
      token_type: 'OAUTH_LONG_LIVED',
      is_permanent: 1,
      pages_count: pages.length
    });

    if (nonce) pendingOAuthSessions.delete(nonce);

    // Save and auto-subscribe all pages belonging to this Facebook account
    let connectedPagesCount = 0;
    for (const p of pages) {
      let subscribedAt = '';
      try {
        await subscribePageWebhook(p.page_id, p.access_token);
        subscribedAt = new Date().toISOString();
      } catch (subErr) {
        console.warn(`[OAuth Multi-Account] Subscribe webhook warning for ${p.page_id}: ${subErr.message}`);
      }

      saveOrUpdatePage({
        page_id: p.page_id,
        name: p.name,
        access_token: p.access_token,
        user_id: 1,
        account_label: user.name,
        color_tag: '#3b82f6',
        token_status: 'VALID',
        token_checked_at: new Date().toISOString(),
        avatar_url: p.avatar_url || '',
        subscribed_at: subscribedAt,
        token_source_id: tokenSource ? tokenSource.id : 0,
        is_permanent: 1
      });
      connectedPagesCount++;
    }

    if (isPopup) {
      return res.send(`
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"><title>Kết Nối Thành Công</title>
        <style>body{background:#090d16;color:#f8fafc;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;box-sizing:border-box;}</style>
        </head><body>
          <div style="background:#141e33;border:1px solid #10b981;border-radius:12px;padding:28px 36px;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:440px;">
            <div style="font-size:42px;margin-bottom:12px;">🎉</div>
            <h3 style="margin:0 0 8px 0;color:#10b981;font-size:20px;">Đăng Nhập Facebook Thành Công!</h3>
            <p style="margin:0 0 16px 0;font-size:14px;color:#94a3b8;">
              Tài khoản: <strong style="color:#60a5fa;">${user.name}</strong><br>
              Đã tự động kết nối và cấp quyền vĩnh viễn cho <strong style="color:#34d399;">${connectedPagesCount} Fanpage</strong>!
            </p>
            <div style="font-size:12px;color:#64748b;">Cửa sổ này sẽ tự động đóng ngay lập tức...</div>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'FB_AUTH_SUCCESS',
                accountName: ${JSON.stringify(user.name)},
                fbUserId: ${JSON.stringify(user.id)},
                avatarUrl: ${JSON.stringify(user.picture)},
                pagesCount: ${connectedPagesCount},
                tokenSourceId: ${tokenSource ? tokenSource.id : 0},
                appId: ${JSON.stringify(targetAppId)}
              }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              setTimeout(() => window.location.href = '/?fb_auth_success=1', 1200);
            }
          </script>
        </body></html>
      `);
    }

    return res.redirect(`/?fb_auth_success=1&account=${encodeURIComponent(user.name)}&pages=${connectedPagesCount}`);
  } catch (err) {
    console.error('[Facebook OAuth Error]:', err);
    const diag = diagnoseOAuthError(err.message);
    if (isPopup) {
      return res.status(500).send(`
        <!DOCTYPE html><html><head><meta charset="utf-8"><title>Lỗi Đăng Nhập</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{background:#0b132b;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}</style>
        </head><body>
          <div style="max-width:520px;background:#1e293b;padding:26px;border-radius:12px;border:1px solid #ef4444;box-shadow:0 12px 36px rgba(0,0,0,0.6);text-align:left;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <span style="font-size:24px;">⚠️</span>
              <h3 style="margin:0;color:#f87171;font-size:17px;">${diag.title}</h3>
            </div>
            <div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 12px;margin-bottom:14px;color:#fca5a5;font-size:12.5px;line-height:1.5;">
              <strong>🔍 Điểm đúng / sai cần kiểm tra:</strong>
              <div style="margin-top:4px;">${diag.hint}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 10px;margin-bottom:16px;font-family:monospace;font-size:11px;color:#cbd5e1;word-break:break-all;">
              Chi tiết: ${err.message}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_DIRECT_TOKEN_MODAL'},'*'); } catch(e){} } window.close();" style="background:#10b981;color:#000;border:none;padding:10px 16px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">
                <span>🔑</span> Dùng Phương Án Dự Phòng: Dán Token Trực Tiếp (Cách B)
              </button>
              <button onclick="if(window.opener){ try { window.opener.postMessage({type:'OPEN_FB_APP_CONFIG'},'*'); } catch(e){} } window.close();" style="background:#334155;color:#f8fafc;border:1px solid #475569;padding:9px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px;">
                <span>⚙️</span> Kiểm Tra Lại App ID &amp; Secret ở Bước 1
              </button>
              <button onclick="window.close()" style="background:transparent;color:#94a3b8;border:none;padding:6px;cursor:pointer;font-size:12px;">
                Đóng cửa sổ
              </button>
            </div>
          </div>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage({
                  type: 'FB_AUTH_ERROR',
                  error: ${JSON.stringify(err.message)},
                  diagnosis: ${JSON.stringify(diag)}
                }, '*');
              } catch(e) {}
            }
          </script>
        </body></html>
      `);
    }
    return res.redirect(`/?fb_error=${encodeURIComponent(err.message)}&fb_diag_title=${encodeURIComponent(diag.title)}&fb_diag_hint=${encodeURIComponent(diag.hint)}&fb_diag_type=${encodeURIComponent(diag.type)}`);
  }
});

app.post('/api/pages/:id/subscribe', async (req, res) => {
  try {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ ok: false, error: 'Không tìm thấy trang!' });

    await subscribePageWebhook(page.page_id, page.access_token);
    const subscribedAt = new Date().toISOString();
    db.prepare('UPDATE pages SET subscribed_at = ? WHERE id = ?').run(subscribedAt, page.id);

    res.json({ ok: true, message: `Đã kích hoạt Webhook Meta cho trang "${page.name}" thành công!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/pages/:id/toggle', (req, res) => {
  try {
    const { is_active } = req.body;
    togglePageActive(req.params.id, is_active);
    res.json({ ok: true, message: 'Đã cập nhật trạng thái hoạt động của trang!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/pages/:id', (req, res) => {
  try {
    const { color_tag, account_label, name } = req.body || {};
    const updated = updatePageCustomDetails(req.params.id, { color_tag, account_label, name });
    res.json({ ok: true, message: 'Đã cập nhật cấu hình Fanpage thành công!', page: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/pages/:id', (req, res) => {
  try {
    deletePage(req.params.id);
    res.json({ ok: true, message: 'Đã xóa trang khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Get all shifts for a page
 */
app.get('/api/pages/:pageId/shifts', (req, res) => {
  try {
    const shifts = getPageShifts(req.params.pageId);
    res.json({ ok: true, shifts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Add or update shift for a page
 */
app.post('/api/pages/:pageId/shifts', (req, res) => {
  try {
    const { id, user_id, shift_name, shift_start, shift_end, is_active } = req.body;
    if (!user_id) {
      return res.status(400).json({ ok: false, error: 'Thiếu người dùng phân ca!' });
    }
    const saved = addOrUpdatePageShift({
      id,
      page_id: req.params.pageId,
      user_id: Number(user_id),
      shift_name: shift_name || 'Ca trực',
      shift_start: shift_start || '00:00',
      shift_end: shift_end || '23:59',
      is_active: is_active !== false
    });
    res.json({ ok: true, message: 'Đã lưu ca làm việc thành công!', shift: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Delete a shift
 */
app.delete('/api/shifts/:id', (req, res) => {
  try {
    deletePageShift(req.params.id);
    res.json({ ok: true, message: 'Đã xóa ca làm việc!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 8. General Settings & Tests
// -------------------------------------------------------------

app.get('/api/status', (req, res) => {
  const userId = req.query.user_id ? Number(req.query.user_id) : 1;
  const activeUser = getUserById(userId) || getUserById(1);
  const userAlarmStatus = activeUser ? isAlarmModeActiveForUser(activeUser) : { active: false };
  const pages = getAllPages();
  const convCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
  const unrepliedCount = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE is_replied = 0').get().count;
  const unseenCount = db.prepare('SELECT COUNT(*) as count FROM conversations WHERE is_seen = 0 AND is_replied = 0').get().count;

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    activeUser,
    alarmStatus: userAlarmStatus,
    publicUrl: currentPublicUrl,
    stats: {
      totalPages: pages.length,
      activePages: pages.filter(p => p.is_active === 1).length,
      totalConversations: convCount,
      unrepliedConversations: unrepliedCount,
      unseenConversations: unseenCount
    }
  });
});

app.get('/api/settings', (req, res) => {
  try {
    const settings = getSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    updateSettingsBatch(req.body);
    res.json({ ok: true, message: 'Đã lưu cấu hình thành công!' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/test/telegram', async (req, res) => {
  try {
    let { bot_token, chat_id, api_root } = req.body || {};
    const host = getHostProfile();
    if (!bot_token) bot_token = host?.telegram_bot_token;
    if (!chat_id) chat_id = host?.telegram_chat_id;
    if (!api_root) api_root = getSetting('telegram_api_root');

    if (!bot_token || !chat_id) {
      return res.status(400).json({ ok: false, error: 'Vui lòng điền Bot Token và Chat ID trước khi test!' });
    }
    await testTelegramConnection(bot_token, chat_id, { apiRoot: api_root });
    res.json({ ok: true, message: 'Đã gửi tin nhắn test thành công tới Telegram!' });
  } catch (err) {
    console.error('[Telegram Test] Error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/test/discord', async (req, res) => {
  try {
    let { webhook_url } = req.body || {};
    const host = getHostProfile();
    if (!webhook_url) webhook_url = host?.discord_webhook_url;

    if (!webhook_url || !webhook_url.trim()) {
      return res.status(400).json({ ok: false, error: 'Vui lòng điền Discord Webhook URL trước khi thử!' });
    }
    await testDiscordWebhook(webhook_url);

    // Auto-save to host profile and global settings on successful test
    if (webhook_url && webhook_url.trim().startsWith('https://discord.com/api/webhooks/')) {
      updateHostProfile({
        discord_webhook_url: webhook_url.trim(),
        discord_enabled: 'true'
      });
      saveSettings({ global_discord_webhook_url: webhook_url.trim() });
      console.log('[Discord] Auto-saved verified webhook URL to Host Profile & Global Settings');
    }

    res.json({ ok: true, message: 'Đã gửi tin nhắn thử nghiệm và ảnh mẫu thành công tới kênh Discord của bạn! (Đã tự động lưu cấu hình)' });
  } catch (err) {
    console.error('[Discord Test] Error:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/test/alarm', async (req, res) => {
  try {
    const customConfig = req.body || {};
    if (customConfig.alarm_method === 'ntfy' && customConfig.ntfy_topic) {
      updateHostProfile({
        ntfy_topic: customConfig.ntfy_topic.trim(),
        alarm_method: 'ntfy'
      });
      saveSettings({
        global_ntfy_topic: customConfig.ntfy_topic.trim(),
        alarm_method: 'ntfy'
      });
    } else if (customConfig.alarm_method === 'callmebot' && customConfig.callmebot_username) {
      updateHostProfile({
        callmebot_username: customConfig.callmebot_username.trim(),
        alarm_method: 'callmebot'
      });
      saveSettings({
        callmebot_username: customConfig.callmebot_username.trim(),
        alarm_method: 'callmebot'
      });
    } else if (customConfig.twilio_account_sid || customConfig.twilio_auth_token || customConfig.twilio_from_number || customConfig.twilio_to_number) {
      updateHostProfile({
        twilio_account_sid: customConfig.twilio_account_sid,
        twilio_auth_token: customConfig.twilio_auth_token,
        twilio_from_number: customConfig.twilio_from_number,
        twilio_to_number: customConfig.twilio_to_number,
        alarm_method: 'twilio'
      });
      saveSettings({
        global_twilio_account_sid: customConfig.twilio_account_sid,
        global_twilio_auth_token: customConfig.twilio_auth_token,
        global_twilio_from_number: customConfig.twilio_from_number,
        twilio_to_number: customConfig.twilio_to_number
      });
    }
    const result = await testAlarm(customConfig);
    const method = customConfig.alarm_method || 'ntfy';
    let message = 'Cuộc gọi thử nghiệm đã được kết nối! Vui lòng kiểm tra điện thoại của bạn.';
    if (method === 'ntfy') {
      message = '🔔 Đã kích hoạt Ringtone Báo thức khẩn cấp tới ứng dụng ntfy trên điện thoại của bạn! Điện thoại đang đổ chuông.';
    } else if (method === 'callmebot') {
      message = '📞 Cuộc gọi thoại Telegram đang đổ chuông tới tài khoản của bạn! Hãy mở Telegram để nghe.';
    }
    res.json({
      ok: true,
      message,
      result
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/test/simulate-message', async (req, res) => {
  try {
    const {
      page_id = '334395220566888',
      sender_name = 'Nguyễn Hoàng Nam',
      sender_id = `test_customer_${Date.now().toString().slice(-4)}`,
      text = 'Shop ơi, sản phẩm này còn hàng không ạ? Tư vấn cho mình với nhé! SĐT: 0988123456',
      attachments = []
    } = req.body || {};

    const page = getPageByPageId(page_id) || getAllPages()[0];
    const targetPageId = page ? page.page_id : page_id;
    const pageName = page ? page.name : 'Fanpage Test';
    const accountLabel = page ? page.account_label : '';

    const onDutyUsers = getActiveUsersOnShiftForPage(targetPageId);
    const timestamp = Date.now();
    const mid = `test_mid_${timestamp}`;

    // 1. Save message & conversation
    saveMessage({
      mid,
      page_id: targetPageId,
      sender_id,
      sender_name,
      text,
      attachments,
      timestamp,
      is_echo: 0
    });

    // 2. Broadcast live SSE
    const targetUserIds = onDutyUsers.map(u => u.id || u.user_id);
    const onDutyNames = onDutyUsers.map(u => u.name).join(', ');

    broadcastSSE('new_message', {
      mid,
      page_id: targetPageId,
      page_name: pageName,
      account_label: accountLabel,
      page_color: page ? page.color_tag : '#3b82f6',
      target_user_ids: targetUserIds,
      on_duty_users: onDutyNames,
      sender_id,
      sender_name,
      text,
      attachments,
      timestamp
    });

    // 3. Dispatch Discord, Telegram & Phone Alarm to each user on duty
    const globalSettings = getSettings();
    const host = getHostProfile();
    const dispatchResults = [];

    for (const dutyUser of onDutyUsers) {
      // Discord Webhook
      const discordWebhook = dutyUser.discord_webhook_url || host?.discord_webhook_url;
      const discordEnabled = dutyUser.discord_enabled === 'true' || (dutyUser.id === host?.id && host?.discord_enabled === 'true');
      if (discordEnabled && discordWebhook) {
        try {
          await sendDiscordMessageAlert(discordWebhook, {
            pageName,
            pageId: targetPageId,
            accountLabel,
            ownerName: dutyUser.name,
            senderId: sender_id,
            senderName: sender_name,
            messageText: text,
            attachments,
            timestamp
          });
          dispatchResults.push({ user: dutyUser.name, discord: 'OK' });
        } catch (dcErr) {
          dispatchResults.push({ user: dutyUser.name, discord_error: dcErr.message });
        }
      }

      // Telegram
      if (dutyUser.telegram_enabled === 'true') {
        const botToken = dutyUser.telegram_bot_token || globalSettings.global_telegram_bot_token;
        const chatId = dutyUser.telegram_chat_id;
        if (botToken && chatId) {
          try {
            await sendFacebookMessageAlert(botToken, chatId, {
              pageName,
              pageId: targetPageId,
              accountLabel,
              ownerName: dutyUser.name,
              senderName: sender_name,
              messageText: text,
              timestamp
            }, { apiRoot: globalSettings.telegram_api_root });
            dispatchResults.push({ user: dutyUser.name, telegram: 'OK' });
          } catch (tgErr) {
            dispatchResults.push({ user: dutyUser.name, telegram_error: tgErr.message });
          }
        }
      }

      // Alarm (Call / Siren)
      try {
        const alarmResult = await triggerAlarmForUser({
          user: dutyUser,
          pageId: targetPageId,
          pageName,
          senderId: sender_id,
          senderName: sender_name,
          messageText: text,
          force: true
        });
        if (alarmResult.triggered) {
          broadcastSSE('alarm_triggered', {
            user_id: dutyUser.id,
            user_name: dutyUser.name,
            pageName,
            senderName: sender_name,
            method: alarmResult.method
          });
          dispatchResults.push({ user: dutyUser.name, alarm: alarmResult.method });
        }
      } catch (alarmErr) {
        dispatchResults.push({ user: dutyUser.name, alarm_error: alarmErr.message });
      }
    }

    res.json({
      ok: true,
      message: `Đã bắn tin nhắn thử nghiệm thành công vào Fanpage "${pageName}"!`,
      page: pageName,
      sender: sender_name,
      text,
      onDutyUsers: onDutyNames,
      dispatchResults
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.all('/api/alarm/dismiss', (req, res) => {
  console.log('[Alarm] Nhận được tín hiệu Tắt Chuông từ nút bấm thông báo.');
  res.json({ ok: true, message: 'Đã tắt chuông thành công!' });
});

app.get('/api/alarm-logs', (req, res) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;
    const logs = getRecentAlarmLogs(30, userId);
    res.json({ ok: true, logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/supabase-schema', (req, res) => {
  try {
    const schemaPath = path.join(__dirname, '../data/supabase_schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      res.json({ ok: true, sql });
    } else {
      res.status(404).json({ ok: false, error: 'Chưa có file schema' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tunnel/start', async (req, res) => {
  try {
    if (activeTunnelProcess && currentPublicUrl && req.query.force !== 'true' && req.body?.force !== true) {
      return res.json({
        ok: true,
        message: 'Cloudflare Tunnel đang hoạt động!',
        url: currentPublicUrl,
        webhookUrl: `${currentPublicUrl}/webhook`
      });
    }

    const cloudflaredPath = getCloudflaredPath();
    if (cloudflaredPath || process.env.NODE_ENV === 'test' || process.env.MOCK_TUNNEL === '1') {
      const url = await startCloudflareTunnel(PORT);
      return res.json({
        ok: true,
        message: 'Đã khởi tạo Cloudflare Public Tunnel thành công!',
        url: url,
        webhookUrl: `${url}/webhook`
      });
    }

    // Fallback localtunnel
    const tunnel = await localtunnel({ port: PORT });
    activeTunnel = tunnel;
    currentPublicUrl = tunnel.url;
    updateSetting('public_url', currentPublicUrl);

    tunnel.on('close', () => {
      activeTunnel = null;
      currentPublicUrl = '';
      updateSetting('public_url', '');
      broadcastSSE('tunnel_stopped', {});
    });

    res.json({
      ok: true,
      message: 'Đã khởi tạo Public Tunnel thành công!',
      url: currentPublicUrl,
      webhookUrl: `${currentPublicUrl}/webhook`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: `Không thể tạo tunnel: ${err.message}` });
  }
});

app.post('/api/tunnel/stop', (req, res) => {
  stopAllTunnels();
  res.json({ ok: true, message: 'Đã tắt Cloudflare Tunnel. Tool tiếp tục chạy ở chế độ Local (Fast Polling 2.5s).' });
});

// Health check endpoint for Tunnel Watchdog and monitoring
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'UP',
    timestamp: Date.now(),
    uptime: Math.round(process.uptime()),
    publicUrl: currentPublicUrl || '',
    timezone: getSetting('operational_timezone') || 'Asia/Ho_Chi_Minh',
    metaClockOffsetMs: getMetaClockOffset ? getMetaClockOffset() : 0
  });
});

// 1-Click reconnect & reset endpoint to generate a fresh Cloudflare link
app.post('/api/tunnel/reconnect', async (req, res) => {
  try {
    const newUrl = await restartCloudflareTunnel(PORT);
    res.json({
      ok: true,
      message: 'Đã kết nối lại Cloudflare Tunnel qua máy chủ tối ưu theo mạng/VPN hiện tại!',
      url: newUrl,
      webhookUrl: `${newUrl}/webhook`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tunnel/reset', async (req, res) => {
  try {
    const newUrl = await restartCloudflareTunnel(PORT);
    res.json({
      ok: true,
      message: 'Đã tạo liên kết Cloudflare Tunnel mới thành công!',
      url: newUrl,
      webhookUrl: `${newUrl}/webhook`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Background Checker for Inactivity (Auto-Sleep) & Delayed Safety Alarms
async function checkSafetyAlarmsAndInactivity() {
  try {
    const host = getHostProfile();
    if (!host) return;

    // 1. Auto-Sleep Check (Inactivity detection)
    if (host.auto_sleep_enabled === 'true' && host.alarm_enabled !== 'true') {
      const idleLimitMs = (Number(host.auto_sleep_idle_minutes) || 10) * 60 * 1000;
      const lastAct = Number(host.last_activity_at) || 0;
      if (lastAct > 0 && (Date.now() - lastAct) >= idleLimitMs) {
        console.log(`[Auto-Sleep] Không có tương tác trong ${host.auto_sleep_idle_minutes} phút. Tự động chuyển sang Chế Độ Đi Ngủ.`);
        updateHostProfile({ alarm_enabled: 'true' });
        broadcastSSE('user_sleep_state_changed', { is_sleeping: true, reason: 'server_idle_timeout' });
      }
    }

    // 2. Delayed Safety Alarm Check
    if (host.safety_alarm_enabled === 'true') {
      const delayMin = Number(host.safety_alarm_delay_minutes) || 10;
      const overdueConvs = getUnrepliedConversationsForSafetyAlarm(delayMin);

      for (const conv of overdueConvs) {
        console.log(`🚨 [BÁO ĐỘNG AN TOÀN] Tin nhắn từ "${conv.sender_name}" trên page "${conv.page_name}" đã chờ ${delayMin} phút chưa có ai trả lời!`);
        markSafetyAlarmTriggered(conv.page_id, conv.sender_id);

        // A. Broadcast SSE for client-side loud Web Audio Ringtone & urgent banner
        broadcastSSE('safety_alarm', {
          page_id: conv.page_id,
          sender_id: conv.sender_id,
          sender_name: conv.sender_name,
          page_name: conv.page_name,
          delay_minutes: delayMin,
          last_message_text: conv.last_message_text,
          timestamp: Date.now()
        });

        // B. Send emergency alert to Discord
        const discordWebhook = conv.discord_webhook_url || host.discord_webhook_url || getSetting('global_discord_webhook_url');
        if (discordWebhook) {
          sendDiscordMessageAlert(discordWebhook, {
            pageName: `🚨 [BÁO ĐỘNG AN TOÀN] ${conv.page_name}`,
            pageId: conv.page_id,
            senderId: conv.sender_id,
            senderName: conv.sender_name,
            messageText: `⚠️ CẢNH BÁO: Tin nhắn đã chờ hơn ${delayMin} phút chưa có ai trả lời! Vui lòng vào Meta Business Suite rep ngay! (Nội dung: "${conv.last_message_text}")`,
            timestamp: conv.last_message_time
          }).catch(e => console.warn('[Safety Alarm] Discord alert error:', e.message));
        }

        // C. Send emergency alert to Telegram
        const teleToken = conv.telegram_bot_token || host.telegram_bot_token || getSetting('global_telegram_bot_token');
        const teleChatId = conv.telegram_chat_id || host.telegram_chat_id || getSetting('global_telegram_chat_id');
        if (teleToken && teleChatId) {
          sendFacebookMessageAlert(teleToken, teleChatId, {
            pageName: `🚨 BÁO ĐỘNG AN TOÀN: ${conv.page_name}`,
            customerName: conv.sender_name,
            messageText: `⚠️ CẢNH BÁO: Tin nhắn đã quá ${delayMin} phút chưa có ai trả lời!\nNội dung: "${conv.last_message_text}"`,
            timestamp: conv.last_message_time
          }).catch(e => console.warn('[Safety Alarm] Telegram alert error:', e.message));
        }

        // D. Trigger emergency phone call / siren via alarmService
        try {
          const dutyUser = {
            id: conv.user_id || host.id,
            name: conv.user_name || host.name,
            alarm_method: host.alarm_method || 'callmebot',
            callmebot_username: host.callmebot_username,
            twilio_to_number: host.twilio_to_number
          };
          triggerAlarmForUser(dutyUser, {
            pageId: conv.page_id,
            senderId: conv.sender_id,
            pageName: `🚨 Báo Động: ${conv.page_name}`,
            customerName: conv.sender_name,
            messageText: `Tin nhắn chờ hơn ${delayMin} phút`
          }).catch(e => console.warn('[Safety Alarm] Call alarm error:', e.message));
        } catch (err) {
          console.warn('[Safety Alarm] Trigger call error:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Safety Checker] Error:', err.message);
  }
}

// Start Server
if (require.main === module) {
  server.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🚀 FB Multi-Page Tool Server đang chạy tại:`);
    console.log(`👉 Local Dashboard:  http://localhost:${PORT}`);
    console.log(`👉 Webhook Endpoint: http://localhost:${PORT}/webhook`);

    // Auto-launch Cloudflare Tunnel (TryCloudflare: Zero Login, Auto New Link)
    try {
      console.log(`🌐 Đang tự động kích hoạt Cloudflare Tunnel (TryCloudflare - Không cần đăng nhập)...`);
      const publicUrl = await startCloudflareTunnel(PORT);
      console.log(`👉 Public Webhook:   ${publicUrl}/webhook`);
      console.log(`🔑 Verify Token:     ${getSetting('verify_token') || 'fb_tool_verify_secret_2026'}`);

      // Auto-subscribe all active pages
      const pages = getAllPages().filter(p => p.is_active === 1 && p.access_token);
      for (const page of pages) {
        subscribePageWebhook(page.page_id, page.access_token).catch(() => {});
      }
    } catch (tunnelErr) {
      console.warn(`⚠️ Cloudflare Tunnel khởi động chậm hoặc lỗi: ${tunnelErr.message}`);
    }

    // Start background Tunnel Watchdog for auto-healing on network/VPN change
    console.log(`🌐 Kích hoạt Tunnel Watchdog tự phục hồi kết nối khi đổi quốc gia VPN (Chu kỳ 20s)...`);
    startTunnelWatchdog(PORT);

    // Start background auto-sync engine every 2.5 seconds (Fast Polling safety net)
    console.log(`🔄 Kích hoạt công nghệ Auto-Sync nền tốc độ cao (Chu kỳ 2.5 giây / lần)...`);
    syncPagesInbox();
    setInterval(syncPagesInbox, 2500);

    // Start background safety alarm & inactivity checker every 10 seconds
    console.log(`🛡️ Kích hoạt hệ thống Báo Động An Toàn & Giám sát Treo Máy...`);
    setInterval(checkSafetyAlarmsAndInactivity, 10000);

    console.log(`====================================================`);
  });
}

module.exports = {
  app,
  server,
  checkSafetyAlarmsAndInactivity,
  restartCloudflareTunnel,
  startTunnelWatchdog
};
