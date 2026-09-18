/**
 * Alarm & Call Notification Service
 * Manages phone ringing, automated calls, and emergency sirens to wake up the manager/user.
 * Fully supports multi-user independent alarm profiles and per-user cooldowns.
 */

const { getSettings, logAlarm, getLastSuccessfulAlarmTime, isTimeInSchedule } = require('../database/db');

// In-memory tracker for per-user cooldowns
const userCooldownMap = new Map();
let globalLastAlarmTimestamp = 0;

/**
 * Checks whether the alarm / sleep mode is active for a specific user
 */
function isAlarmModeActiveForUser(user) {
  if (!user) {
    return { active: false, reason: 'Không tìm thấy thông tin người dùng' };
  }

  // 1. Manual switch
  if (user.alarm_enabled === 'true') {
    return { active: true, reason: `Chế độ Đi ngủ của ${user.name} đang BẬT` };
  }

  // 2. Automated schedule
  if (user.alarm_schedule_enabled === 'true') {
    if (isTimeInSchedule(user.alarm_start_time, user.alarm_end_time)) {
      return {
        active: true,
        reason: `Khung giờ trực ban đêm của ${user.name} (${user.alarm_start_time} - ${user.alarm_end_time})`
      };
    }
  }

  return { active: false, reason: 'Chế độ báo thức chưa kích hoạt' };
}

/**
 * Checks if the alarm cooldown has passed for a specific user
 */
function isUserCooldownPassed(userId, cooldownMinutes = 3) {
  const now = Date.now();
  const cooldownMs = Number(cooldownMinutes) * 60 * 1000;
  const lastTime = Math.max(
    userCooldownMap.get(userId) || 0,
    getLastSuccessfulAlarmTime(userId)
  );

  if (now - lastTime < cooldownMs) {
    const remainingSeconds = Math.round((cooldownMs - (now - lastTime)) / 1000);
    return { passed: false, remainingSeconds };
  }
  return { passed: true, remainingSeconds: 0 };
}

/**
 * Global fallback check
 */
function isAlarmModeActive() {
  const settings = getSettings();
  if (settings.alarm_enabled === 'true') {
    return { active: true, reason: 'Chế độ Đi ngủ (Thủ công) đang bật' };
  }
  if (settings.alarm_schedule_enabled === 'true') {
    if (isTimeInSchedule(settings.alarm_start_time, settings.alarm_end_time)) {
      return {
        active: true,
        reason: `Khung giờ trực ban đêm (${settings.alarm_start_time} - ${settings.alarm_end_time})`
      };
    }
  }
  return { active: false, reason: 'Chế độ báo thức chưa kích hoạt' };
}

function isCooldownPassed(cooldownMinutes = 3) {
  const now = Date.now();
  const cooldownMs = Number(cooldownMinutes) * 60 * 1000;
  const lastTime = Math.max(globalLastAlarmTimestamp, getLastSuccessfulAlarmTime());
  if (now - lastTime < cooldownMs) {
    const remainingSeconds = Math.round((cooldownMs - (now - lastTime)) / 1000);
    return { passed: false, remainingSeconds };
  }
  return { passed: true, remainingSeconds: 0 };
}

/**
 * Triggers a CallMeBot Telegram Voice Call
 */
async function callViaCallMeBot(username, text) {
  if (!username) {
    throw new Error('CallMeBot username chưa được cấu hình! (ví dụ: @username)');
  }

  const cleanUsername = username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`;
  const speechText = text || 'Báo thức: Bạn có tin nhắn mới từ khách hàng trên Fanpage!';
  const url = `http://api.callmebot.com/start.php?user=${encodeURIComponent(cleanUsername)}&text=${encodeURIComponent(speechText)}&lang=vi-VN`;

  const response = await fetch(url);
  const resultText = await response.text();

  if (!response.ok || resultText.toLowerCase().includes('error')) {
    throw new Error(`CallMeBot Error: ${resultText}`);
  }

  return { success: true, result: resultText };
}

/**
 * Triggers a Twilio Voice Call to a real phone number (SIM)
 */
async function callViaTwilio(accountSid, authToken, fromNumber, toNumber, text) {
  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    throw new Error('Cấu hình Twilio chưa đầy đủ: Cần Account SID (bắt đầu bằng AC...), Auth Token và Số Twilio (From Number) để thực hiện cuộc gọi viễn thông tới SIM!');
  }

  // Format recipient phone number to E.164 (+84 for Vietnam SIMs)
  let cleanTo = (toNumber || '').trim().replace(/[\s.-]/g, '');
  if (cleanTo.startsWith('0')) {
    cleanTo = '+84' + cleanTo.slice(1);
  } else if (!cleanTo.startsWith('+')) {
    cleanTo = '+84' + cleanTo;
  }

  // Format sender phone number
  let cleanFrom = (fromNumber || '').trim().replace(/[\s.-]/g, '');
  if (!cleanFrom.startsWith('+')) {
    cleanFrom = '+' + cleanFrom;
  }

  const speech = text || 'Báo thức khẩn cấp: Bạn có tin nhắn mới từ khách hàng trên Fanpage Facebook. Vui lòng dậy kiểm tra điện thoại ngay.';
  const twiml = `<Response><Pause length="1"/><Say language="vi-VN" voice="Polly.Tho">${speech}</Say><Pause length="2"/><Say language="vi-VN" voice="Polly.Tho">${speech}</Say></Response>`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid.trim()}/Calls.json`;
  const body = new URLSearchParams({
    To: cleanTo,
    From: cleanFrom,
    Twiml: twiml
  });

  const authHeader = 'Basic ' + Buffer.from(`${accountSid.trim()}:${authToken.trim()}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Twilio Call Error [${data.code || response.status}]: ${data.message || JSON.stringify(data)}`);
  }

  return { success: true, callSid: data.sid, status: data.status, to: cleanTo };
}

/**
 * Triggers Pushover Emergency Priority Siren
 */
async function callViaPushover(userKey, appToken, text, pageName = '') {
  if (!userKey || !appToken) {
    throw new Error('Pushover User Key hoặc App Token chưa được cấu hình!');
  }

  const url = 'https://api.pushover.net/1/messages.json';
  const body = new URLSearchParams({
    token: appToken.trim(),
    user: userKey.trim(),
    title: `🚨 BÁO THỨC: TIN NHẮN TỪ ${pageName.toUpperCase() || 'FANPAGE'}`,
    message: text || 'Có tin nhắn mới đến từ khách hàng! Chạm vào thông báo để mở hộp thư.',
    priority: '2',
    sound: 'siren',
    retry: '30',
    expire: '300'
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await response.json();
  if (data.status !== 1) {
    throw new Error(`Pushover Error: ${data.errors ? data.errors.join(', ') : 'Unknown error'}`);
  }

  return { success: true, receipt: data.receipt };
}

/**
 * Triggers an Urgent Persistent Ringtone Alarm via ntfy.sh (100% Free & No Registration)
 */
async function callViaNtfy(topic, text, title = 'BAO THUC FANPAGE', clickUrl = '') {
  if (!topic || !topic.trim()) {
    throw new Error('Chưa cấu hình ntfy Topic! (Ví dụ: fb-canhbao-0976014480)');
  }
  const cleanTopic = topic.trim().replace(/^https?:\/\/ntfy\.sh\//, '');
  const speechText = text || 'Báo thức khẩn cấp: Khách hàng vừa nhắn tin trên Fanpage!';
  const url = `https://ntfy.sh/${encodeURIComponent(cleanTopic)}`;

  const settings = getSettings();
  const targetUrl = clickUrl || settings.public_url || '';

  // Clean title for HTTP ByteString header (tags provide the visual emoji on device)
  const cleanTitle = (title || 'BAO THUC FANPAGE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim() || 'BAO THUC FANPAGE';

  const headers = {
    'Title': cleanTitle,
    'Priority': 'urgent', // Priority 5: Maximum urgency, plays ringtone, vibrates insistently, bypasses DND
    'Tags': 'rotating_light,warning,bell'
  };

  let response;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: speechText
      });
      if (response.ok) break;
    } catch (err) {
      lastError = err;
      if (attempt < 2) await new Promise(r => setTimeout(r, 400));
    }
  }

  if (!response || !response.ok) {
    const errText = response ? await response.text() : (lastError ? lastError.message : 'Lỗi kết nối mạng');
    throw new Error(`ntfy.sh Error [${response?.status || 'Network'}]: ${errText}`);
  }

  return { success: true, topic: cleanTopic };
}

/**
 * Triggers alarm specifically for the user owning the Page
 */
async function triggerAlarmForUser({ user, pageId, pageName, senderId, senderName, messageText, force = false }) {
  if (!user) {
    return { triggered: false, reason: 'Không có thông tin người dùng sở hữu Page' };
  }

  const settings = getSettings();

  if (!force) {
    const status = isAlarmModeActiveForUser(user);
    if (!status.active) {
      return { triggered: false, reason: status.reason };
    }

    const cooldownMin = Number(settings.cooldown_minutes) || 3;
    const cooldownCheck = isUserCooldownPassed(user.id, cooldownMin);

    if (!cooldownCheck.passed) {
      const reason = `Bỏ qua đổ chuông cho ${user.name} do đang trong giãn cách (còn ${cooldownCheck.remainingSeconds}s)`;
      logAlarm({
        user_id: user.id,
        page_id: pageId,
        sender_id: senderId,
        method: user.alarm_method,
        status: 'SKIPPED_COOLDOWN',
        details: reason
      });
      return { triggered: false, reason };
    }
  }

  const method = user.alarm_method || 'ntfy';
  const alertSpeech = `Báo thức khẩn cấp! Fanpage ${pageName} vừa có tin nhắn mới từ ${senderName || 'khách hàng'}. Bạn hãy dậy kiểm tra tin nhắn ngay!`;

  try {
    let result;
    if (method === 'ntfy') {
      const topic = user.ntfy_topic || settings.global_ntfy_topic || settings.ntfy_topic;
      result = await callViaNtfy(topic, alertSpeech, `🚨 BÁO THỨC: ${pageName}`);
    } else if (method === 'callmebot') {
      result = await callViaCallMeBot(user.callmebot_username, alertSpeech);
    } else if (method === 'twilio') {
      const sid = user.twilio_account_sid || settings.global_twilio_account_sid || settings.twilio_account_sid;
      const auth = user.twilio_auth_token || settings.global_twilio_auth_token || settings.twilio_auth_token;
      const from = user.twilio_from_number || settings.global_twilio_from_number || settings.twilio_from_number;
      const to = user.twilio_to_number || settings.twilio_to_number || '0976014480';
      result = await callViaTwilio(sid, auth, from, to, alertSpeech);
    } else if (method === 'pushover') {
      const appToken = settings.global_pushover_app_token || user.pushover_app_token;
      result = await callViaPushover(user.pushover_user_key, appToken, alertSpeech, pageName);
    } else {
      throw new Error(`Phương thức báo thức không hợp lệ: ${method}`);
    }

    userCooldownMap.set(user.id, Date.now());
    globalLastAlarmTimestamp = Date.now();

    logAlarm({
      user_id: user.id,
      page_id: pageId,
      sender_id: senderId,
      method: method,
      status: 'SUCCESS',
      details: JSON.stringify(result)
    });

    return { triggered: true, user_id: user.id, user_name: user.name, method, result };
  } catch (error) {
    logAlarm({
      user_id: user.id,
      page_id: pageId,
      sender_id: senderId,
      method: method,
      status: 'FAILED',
      details: error.message
    });
    console.error(`[AlarmService] Trigger alarm failed for ${user.name} (${method}):`, error.message);
    return { triggered: false, error: error.message };
  }
}

/**
 * Triggers a manual test alarm with specific credentials
 */
async function testAlarm(customSettings = {}) {
  const saved = getSettings();
  const settings = { ...saved, ...customSettings };
  const method = settings.alarm_method || 'twilio';
  const testSpeech = 'Đây là cuộc gọi thử nghiệm hệ thống báo thức Fanpage. Điện thoại của bạn đã đổ chuông thành công!';

  if (method === 'ntfy') {
    const topic = customSettings.ntfy_topic || settings.global_ntfy_topic || settings.ntfy_topic;
    return await callViaNtfy(topic, testSpeech, '🚨 TEST BÁO THỨC RINGTONE (ntfy.sh)');
  } else if (method === 'callmebot') {
    return await callViaCallMeBot(customSettings.callmebot_username || settings.callmebot_username, testSpeech);
  } else if (method === 'twilio') {
    const sid = customSettings.twilio_account_sid || customSettings.global_twilio_account_sid || settings.global_twilio_account_sid || settings.twilio_account_sid;
    const auth = customSettings.twilio_auth_token || customSettings.global_twilio_auth_token || settings.global_twilio_auth_token || settings.twilio_auth_token;
    const from = customSettings.twilio_from_number || customSettings.global_twilio_from_number || settings.global_twilio_from_number || settings.twilio_from_number;
    const to = customSettings.twilio_to_number || settings.twilio_to_number || '0976014480';
    return await callViaTwilio(sid, auth, from, to, testSpeech);
  } else if (method === 'pushover') {
    const appToken = settings.global_pushover_app_token || settings.pushover_app_token;
    return await callViaPushover(settings.pushover_user_key, appToken, testSpeech, 'TEST BÁO THỨC');
  } else {
    throw new Error(`Phương thức báo thức không xác định: ${method}`);
  }
}

module.exports = {
  isTimeInSchedule,
  isAlarmModeActive,
  isAlarmModeActiveForUser,
  isCooldownPassed,
  isUserCooldownPassed,
  callViaNtfy,
  callViaCallMeBot,
  callViaTwilio,
  callViaPushover,
  triggerAlarmForUser,
  testAlarm
};
