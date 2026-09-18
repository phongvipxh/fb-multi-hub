const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'fb_tool.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.pragma('journal_mode = WAL');

// Initialize Base Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pin_code TEXT DEFAULT '1234',
    role TEXT DEFAULT 'member',
    color_tag TEXT DEFAULT '#3b82f6',
    telegram_bot_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    telegram_enabled TEXT DEFAULT 'true',
    discord_webhook_url TEXT DEFAULT '',
    discord_enabled TEXT DEFAULT 'true',
    alarm_enabled TEXT DEFAULT 'false',
    alarm_schedule_enabled TEXT DEFAULT 'false',
    alarm_start_time TEXT DEFAULT '23:00',
    alarm_end_time TEXT DEFAULT '07:00',
    alarm_method TEXT DEFAULT 'callmebot',
    callmebot_username TEXT DEFAULT '',
    twilio_to_number TEXT DEFAULT '',
    pushover_user_key TEXT DEFAULT '',
    web_sound_enabled TEXT DEFAULT 'true',
    web_sound_volume INTEGER DEFAULT 80,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT 1,
    page_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    account_label TEXT DEFAULT '',
    color_tag TEXT DEFAULT '#3b82f6',
    token_status TEXT DEFAULT 'VALID',
    token_checked_at TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    avatar_url TEXT DEFAULT '',
    subscribed_at TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mid TEXT UNIQUE,
    page_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT DEFAULT 'Khách hàng',
    text TEXT DEFAULT '',
    attachments TEXT DEFAULT '[]',
    timestamp INTEGER,
    is_echo INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT DEFAULT 'Khách hàng',
    last_message_text TEXT DEFAULT '',
    last_message_time INTEGER DEFAULT 0,
    is_replied INTEGER DEFAULT 0,
    unread_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, sender_id)
  );

  CREATE TABLE IF NOT EXISTS quick_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT 0,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alarm_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER DEFAULT 0,
    page_id TEXT,
    sender_id TEXT,
    method TEXT,
    status TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS page_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    shift_name TEXT DEFAULT 'Ca trực',
    shift_start TEXT DEFAULT '00:00',
    shift_end TEXT DEFAULT '23:59',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page_id, user_id, shift_start, shift_end)
  );

  CREATE TABLE IF NOT EXISTS token_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    app_id TEXT DEFAULT '',
    app_secret TEXT DEFAULT '',
    user_token TEXT NOT NULL,
    long_lived_token TEXT DEFAULT '',
    token_type TEXT DEFAULT 'LONG_LIVED',
    is_permanent INTEGER DEFAULT 1,
    pages_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration helper: add multi-account columns to token_sources if missing
const tokenSourceColumns = db.prepare('PRAGMA table_info(token_sources)').all().map(c => c.name);
if (!tokenSourceColumns.includes('fb_user_id')) {
  db.exec("ALTER TABLE token_sources ADD COLUMN fb_user_id TEXT DEFAULT ''");
}
if (!tokenSourceColumns.includes('avatar_url')) {
  db.exec("ALTER TABLE token_sources ADD COLUMN avatar_url TEXT DEFAULT ''");
}
if (!tokenSourceColumns.includes('email')) {
  db.exec("ALTER TABLE token_sources ADD COLUMN email TEXT DEFAULT ''");
}

// Migration helper: add columns to pages if missing
const pageColumns = db.prepare('PRAGMA table_info(pages)').all().map(c => c.name);
if (!pageColumns.includes('user_id')) {
  db.exec('ALTER TABLE pages ADD COLUMN user_id INTEGER DEFAULT 1');
}
if (!pageColumns.includes('color_tag')) {
  db.exec("ALTER TABLE pages ADD COLUMN color_tag TEXT DEFAULT '#3b82f6'");
}
if (!pageColumns.includes('token_status')) {
  db.exec("ALTER TABLE pages ADD COLUMN token_status TEXT DEFAULT 'VALID'");
}
if (!pageColumns.includes('token_checked_at')) {
  db.exec("ALTER TABLE pages ADD COLUMN token_checked_at TEXT DEFAULT ''");
}
if (!pageColumns.includes('token_source_id')) {
  db.exec('ALTER TABLE pages ADD COLUMN token_source_id INTEGER DEFAULT 0');
}
if (!pageColumns.includes('is_permanent')) {
  db.exec('ALTER TABLE pages ADD COLUMN is_permanent INTEGER DEFAULT 0');
}

// Migration helper: add user_id to alarm_logs if missing
const alarmLogColumns = db.prepare('PRAGMA table_info(alarm_logs)').all().map(c => c.name);
if (!alarmLogColumns.includes('user_id')) {
  db.exec('ALTER TABLE alarm_logs ADD COLUMN user_id INTEGER DEFAULT 0');
}

// Migration helper: add discord columns to users if missing
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColumns.includes('discord_webhook_url')) {
  db.exec("ALTER TABLE users ADD COLUMN discord_webhook_url TEXT DEFAULT ''");
}
if (!userColumns.includes('discord_enabled')) {
  db.exec("ALTER TABLE users ADD COLUMN discord_enabled TEXT DEFAULT 'true'");
}
if (!userColumns.includes('auto_sleep_enabled')) {
  db.exec("ALTER TABLE users ADD COLUMN auto_sleep_enabled TEXT DEFAULT 'true'");
}
if (!userColumns.includes('auto_sleep_idle_minutes')) {
  db.exec('ALTER TABLE users ADD COLUMN auto_sleep_idle_minutes INTEGER DEFAULT 10');
}
if (!userColumns.includes('last_activity_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_activity_at INTEGER DEFAULT 0');
}
if (!userColumns.includes('safety_alarm_enabled')) {
  db.exec("ALTER TABLE users ADD COLUMN safety_alarm_enabled TEXT DEFAULT 'true'");
}
if (!userColumns.includes('safety_alarm_delay_minutes')) {
  db.exec('ALTER TABLE users ADD COLUMN safety_alarm_delay_minutes INTEGER DEFAULT 10');
}
if (!userColumns.includes('twilio_account_sid')) {
  db.exec("ALTER TABLE users ADD COLUMN twilio_account_sid TEXT DEFAULT ''");
}
if (!userColumns.includes('twilio_auth_token')) {
  db.exec("ALTER TABLE users ADD COLUMN twilio_auth_token TEXT DEFAULT ''");
}
if (!userColumns.includes('twilio_from_number')) {
  db.exec("ALTER TABLE users ADD COLUMN twilio_from_number TEXT DEFAULT ''");
}
if (!userColumns.includes('ntfy_topic')) {
  db.exec("ALTER TABLE users ADD COLUMN ntfy_topic TEXT DEFAULT ''");
}
if (!userColumns.includes('web_sound_type')) {
  db.exec("ALTER TABLE users ADD COLUMN web_sound_type TEXT DEFAULT 'loud_chime'");
}

// Migration helper: add seen & safety alarm columns to conversations
const convColumns = db.prepare('PRAGMA table_info(conversations)').all().map(c => c.name);
if (!convColumns.includes('is_seen')) {
  db.exec('ALTER TABLE conversations ADD COLUMN is_seen INTEGER DEFAULT 0');
}
if (!convColumns.includes('seen_at')) {
  db.exec('ALTER TABLE conversations ADD COLUMN seen_at INTEGER DEFAULT 0');
}
if (!convColumns.includes('customer_seen_watermark')) {
  db.exec('ALTER TABLE conversations ADD COLUMN customer_seen_watermark INTEGER DEFAULT 0');
}
if (!convColumns.includes('safety_alarm_triggered')) {
  db.exec('ALTER TABLE conversations ADD COLUMN safety_alarm_triggered INTEGER DEFAULT 0');
}

// Migration helper: add seen columns to messages
const msgColumns = db.prepare('PRAGMA table_info(messages)').all().map(c => c.name);
if (!msgColumns.includes('is_seen')) {
  db.exec('ALTER TABLE messages ADD COLUMN is_seen INTEGER DEFAULT 0');
}
if (!msgColumns.includes('seen_at')) {
  db.exec('ALTER TABLE messages ADD COLUMN seen_at INTEGER DEFAULT 0');
}

// High-Performance Query Optimization Indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_lookup ON messages(page_id, sender_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_mid ON messages(mid);
  CREATE INDEX IF NOT EXISTS idx_conversations_lookup ON conversations(page_id, sender_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_order ON conversations(last_message_time DESC);
  CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(is_replied, is_seen);
`);

// Seed default admin user if no users exist
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  db.prepare(`
    INSERT INTO users (id, username, name, pin_code, role, color_tag, telegram_enabled, web_sound_enabled)
    VALUES (1, 'admin', 'Quản Trị Viên (Admin)', '1234', 'admin', '#3b82f6', 'true', 'true')
  `).run();

  // Also create a sample staff user
  db.prepare(`
    INSERT INTO users (id, username, name, pin_code, role, color_tag, telegram_enabled, web_sound_enabled)
    VALUES (2, 'nhanvien1', 'Nhân Viên Trực 1 (Minh)', '1234', 'member', '#8b5cf6', 'true', 'true')
  `).run();
}

// Seed default quick replies if empty
const qrCount = db.prepare('SELECT COUNT(*) as count FROM quick_replies').get().count;
if (qrCount === 0) {
  const seedQr = db.prepare('INSERT INTO quick_replies (user_id, title, content) VALUES (?, ?, ?)');
  seedQr.run(0, 'Chào hỏi ban đêm', 'Dạ chào bạn! Hiện tại ngoài giờ hành chính, shop đã ghi nhận tin nhắn và sẽ liên hệ hỗ trợ bạn sớm nhất vào đầu giờ sáng mai nhé ạ! ❤️');
  seedQr.run(0, 'Xin số điện thoại', 'Dạ bạn cho shop xin số điện thoại để nhân viên trực gọi tư vấn chi tiết và gửi ưu đãi tốt nhất cho mình nhé ạ!');
  seedQr.run(0, 'Báo giá & Vận chuyển', 'Dạ sản phẩm đang có sẵn và được freeship toàn quốc khi đặt trong hôm nay ạ. Bạn muốn nhận hàng tại địa chỉ nào để shop kiểm tra giao nhanh nhé?');
}

// Default Global settings
const defaultSettings = {
  verify_token: 'fb_tool_verify_secret_2026',
  public_url: '',
  global_telegram_bot_token: '',
  global_twilio_account_sid: '',
  global_twilio_auth_token: '',
  global_twilio_from_number: '',
  global_pushover_app_token: '',
  cooldown_minutes: '3',
  operational_timezone: 'Asia/Ho_Chi_Minh'
};

const insertSettingStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSettingStmt.run(key, value);
}

// -------------------------------------------------------------
// Settings Helpers
// -------------------------------------------------------------
const getSettings = () => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
};

const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const updateSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
};

const updateSettingsBatch = (settingsObj) => {
  const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction((entries) => {
    for (const [k, v] of entries) {
      updateStmt.run(k, String(v));
    }
  });
  transaction(Object.entries(settingsObj));
};

// -------------------------------------------------------------
// Users Helpers
// -------------------------------------------------------------
const getAllUsers = () => {
  return db.prepare(`
    SELECT u.*,
      (SELECT COUNT(DISTINCT p.id) FROM pages p WHERE p.user_id = u.id) as owned_pages_count,
      (SELECT COUNT(DISTINCT ps.page_id) FROM page_shifts ps WHERE ps.user_id = u.id AND ps.is_active = 1) as shift_pages_count
    FROM users u
    ORDER BY u.id ASC
  `).all();
};

const getUserById = (id) => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
};

const getUserByUsername = (username) => {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
};

const saveOrUpdateUser = (userData) => {
  let targetId = userData.id;
  if (!targetId && userData.username) {
    const existing = getUserByUsername(userData.username);
    if (existing) {
      targetId = existing.id;
    }
  }

  if (targetId) {
    const existing = getUserById(targetId);
    const u = { ...(existing || {}), ...userData };

    const stmt = db.prepare(`
      UPDATE users SET
        name = @name,
        username = @username,
        pin_code = @pin_code,
        role = @role,
        color_tag = @color_tag,
        telegram_bot_token = @telegram_bot_token,
        telegram_chat_id = @telegram_chat_id,
        telegram_enabled = @telegram_enabled,
        discord_webhook_url = @discord_webhook_url,
        discord_enabled = @discord_enabled,
        alarm_enabled = @alarm_enabled,
        alarm_schedule_enabled = @alarm_schedule_enabled,
        alarm_start_time = @alarm_start_time,
        alarm_end_time = @alarm_end_time,
        alarm_method = @alarm_method,
        callmebot_username = @callmebot_username,
        twilio_to_number = @twilio_to_number,
        twilio_account_sid = @twilio_account_sid,
        twilio_auth_token = @twilio_auth_token,
        twilio_from_number = @twilio_from_number,
        ntfy_topic = @ntfy_topic,
        pushover_user_key = @pushover_user_key,
        web_sound_enabled = @web_sound_enabled,
        web_sound_volume = @web_sound_volume,
        web_sound_type = @web_sound_type,
        auto_sleep_enabled = @auto_sleep_enabled,
        auto_sleep_idle_minutes = @auto_sleep_idle_minutes,
        last_activity_at = @last_activity_at,
        safety_alarm_enabled = @safety_alarm_enabled,
        safety_alarm_delay_minutes = @safety_alarm_delay_minutes
      WHERE id = @id
    `);
    stmt.run({
      id: targetId,
      name: u.name || 'Người dùng',
      username: u.username || '',
      pin_code: u.pin_code || '1234',
      role: u.role || 'member',
      color_tag: u.color_tag || '#3b82f6',
      telegram_bot_token: u.telegram_bot_token || '',
      telegram_chat_id: u.telegram_chat_id || '',
      telegram_enabled: u.telegram_enabled || 'true',
      discord_webhook_url: u.discord_webhook_url || '',
      discord_enabled: u.discord_enabled || 'true',
      alarm_enabled: u.alarm_enabled || 'false',
      alarm_schedule_enabled: u.alarm_schedule_enabled || 'false',
      alarm_start_time: u.alarm_start_time || '23:00',
      alarm_end_time: u.alarm_end_time || '07:00',
      alarm_method: u.alarm_method || 'twilio',
      callmebot_username: u.callmebot_username || '',
      twilio_to_number: u.twilio_to_number || '',
      twilio_account_sid: u.twilio_account_sid || '',
      twilio_auth_token: u.twilio_auth_token || '',
      twilio_from_number: u.twilio_from_number || '',
      ntfy_topic: u.ntfy_topic || '',
      pushover_user_key: u.pushover_user_key || '',
      web_sound_enabled: u.web_sound_enabled || 'true',
      web_sound_volume: u.web_sound_volume !== undefined ? Number(u.web_sound_volume) : 80,
      web_sound_type: u.web_sound_type || 'loud_chime',
      auto_sleep_enabled: u.auto_sleep_enabled !== undefined ? String(u.auto_sleep_enabled) : 'true',
      auto_sleep_idle_minutes: u.auto_sleep_idle_minutes !== undefined ? Number(u.auto_sleep_idle_minutes) : 10,
      last_activity_at: u.last_activity_at !== undefined ? Number(u.last_activity_at) : Date.now(),
      safety_alarm_enabled: u.safety_alarm_enabled !== undefined ? String(u.safety_alarm_enabled) : 'true',
      safety_alarm_delay_minutes: u.safety_alarm_delay_minutes !== undefined ? Number(u.safety_alarm_delay_minutes) : 10
    });
    return getUserById(targetId);
  } else {
    const stmt = db.prepare(`
      INSERT INTO users (
        name, username, pin_code, role, color_tag,
        telegram_bot_token, telegram_chat_id, telegram_enabled,
        discord_webhook_url, discord_enabled,
        alarm_enabled, alarm_schedule_enabled, alarm_start_time, alarm_end_time,
        alarm_method, callmebot_username,
        twilio_to_number, twilio_account_sid, twilio_auth_token, twilio_from_number,
        ntfy_topic,
        pushover_user_key,
        web_sound_enabled, web_sound_volume, web_sound_type,
        auto_sleep_enabled, auto_sleep_idle_minutes, last_activity_at,
        safety_alarm_enabled, safety_alarm_delay_minutes
      ) VALUES (
        @name, @username, @pin_code, @role, @color_tag,
        @telegram_bot_token, @telegram_chat_id, @telegram_enabled,
        @discord_webhook_url, @discord_enabled,
        @alarm_enabled, @alarm_schedule_enabled, @alarm_start_time, @alarm_end_time,
        @alarm_method, @callmebot_username,
        @twilio_to_number, @twilio_account_sid, @twilio_auth_token, @twilio_from_number,
        @ntfy_topic,
        @pushover_user_key,
        @web_sound_enabled, @web_sound_volume, @web_sound_type,
        @auto_sleep_enabled, @auto_sleep_idle_minutes, @last_activity_at,
        @safety_alarm_enabled, @safety_alarm_delay_minutes
      )
    `);
    const info = stmt.run({
      name: userData.name || 'Người dùng mới',
      username: userData.username,
      pin_code: userData.pin_code || '1234',
      role: userData.role || 'member',
      color_tag: userData.color_tag || '#10b981',
      telegram_bot_token: userData.telegram_bot_token || '',
      telegram_chat_id: userData.telegram_chat_id || '',
      telegram_enabled: userData.telegram_enabled || 'true',
      discord_webhook_url: userData.discord_webhook_url || '',
      discord_enabled: userData.discord_enabled || 'true',
      alarm_enabled: userData.alarm_enabled || 'false',
      alarm_schedule_enabled: userData.alarm_schedule_enabled || 'false',
      alarm_start_time: userData.alarm_start_time || '23:00',
      alarm_end_time: userData.alarm_end_time || '07:00',
      alarm_method: userData.alarm_method || 'twilio',
      callmebot_username: userData.callmebot_username || '',
      twilio_to_number: userData.twilio_to_number || '',
      twilio_account_sid: userData.twilio_account_sid || '',
      twilio_auth_token: userData.twilio_auth_token || '',
      twilio_from_number: userData.twilio_from_number || '',
      ntfy_topic: userData.ntfy_topic || '',
      pushover_user_key: userData.pushover_user_key || '',
      web_sound_enabled: userData.web_sound_enabled || 'true',
      web_sound_volume: userData.web_sound_volume !== undefined ? Number(userData.web_sound_volume) : 80,
      web_sound_type: userData.web_sound_type || 'loud_chime',
      auto_sleep_enabled: userData.auto_sleep_enabled !== undefined ? String(userData.auto_sleep_enabled) : 'true',
      auto_sleep_idle_minutes: userData.auto_sleep_idle_minutes !== undefined ? Number(userData.auto_sleep_idle_minutes) : 10,
      last_activity_at: userData.last_activity_at !== undefined ? Number(userData.last_activity_at) : Date.now(),
      safety_alarm_enabled: userData.safety_alarm_enabled !== undefined ? String(userData.safety_alarm_enabled) : 'true',
      safety_alarm_delay_minutes: userData.safety_alarm_delay_minutes !== undefined ? Number(userData.safety_alarm_delay_minutes) : 10
    });
    return getUserById(info.lastInsertRowid);
  }
};

const deleteUser = (id) => {
  // Reassign pages of this user to admin (id: 1) before delete
  db.prepare('UPDATE pages SET user_id = 1 WHERE user_id = ?').run(id);
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
};

const getPageShifts = (pageId) => {
  return db.prepare(`
    SELECT ps.*, u.name as user_name, u.username, u.color_tag as user_color, u.role
    FROM page_shifts ps
    JOIN users u ON ps.user_id = u.id
    WHERE ps.page_id = ?
    ORDER BY ps.shift_start ASC
  `).all(pageId);
};

const getAllShifts = () => {
  return db.prepare(`
    SELECT ps.*, u.name as user_name, u.username, u.color_tag as user_color, p.name as page_name
    FROM page_shifts ps
    JOIN users u ON ps.user_id = u.id
    JOIN pages p ON ps.page_id = p.page_id
    ORDER BY ps.id ASC
  `).all();
};

const addOrUpdatePageShift = ({ id, page_id, user_id, shift_name = 'Ca trực', shift_start = '00:00', shift_end = '23:59', is_active = 1 }) => {
  if (id) {
    db.prepare(`
      UPDATE page_shifts SET
        shift_name = ?,
        shift_start = ?,
        shift_end = ?,
        is_active = ?,
        user_id = ?
      WHERE id = ?
    `).run(shift_name, shift_start, shift_end, is_active ? 1 : 0, user_id, id);
    return db.prepare('SELECT * FROM page_shifts WHERE id = ?').get(id);
  } else {
    const stmt = db.prepare(`
      INSERT INTO page_shifts (page_id, user_id, shift_name, shift_start, shift_end, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(page_id, user_id, shift_start, shift_end) DO UPDATE SET
        shift_name = excluded.shift_name,
        is_active = excluded.is_active
    `);
    const info = stmt.run(page_id, user_id, shift_name, shift_start, shift_end, is_active ? 1 : 0);
    return db.prepare('SELECT * FROM page_shifts WHERE id = ?').get(info.lastInsertRowid);
  }
};

const deletePageShift = (id) => {
  return db.prepare('DELETE FROM page_shifts WHERE id = ?').run(id);
};

function getZonedHoursAndMinutes(date = new Date(), timeZone = 'Asia/Ho_Chi_Minh') {
  try {
    const tz = timeZone || 'Asia/Ho_Chi_Minh';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    let hour = 0;
    let minute = 0;
    for (const p of parts) {
      if (p.type === 'hour') {
        const h = parseInt(p.value, 10);
        hour = h === 24 ? 0 : h;
      } else if (p.type === 'minute') {
        minute = parseInt(p.value, 10);
      }
    }
    return { hour, minute };
  } catch (e) {
    return { hour: date.getHours(), minute: date.getMinutes() };
  }
}

function isTimeInSchedule(startTime, endTime, checkDate = new Date(), timeZone = null) {
  if (!startTime || !endTime) return false;

  const targetTz = timeZone || getSetting('operational_timezone') || 'Asia/Ho_Chi_Minh';
  const { hour, minute } = getZonedHoursAndMinutes(checkDate, targetTz);
  const currentTotalMinutes = hour * 60 + minute;

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startTotalMinutes = startH * 60 + startM;
  const endTotalMinutes = endH * 60 + endM;

  if (startTotalMinutes <= endTotalMinutes) {
    return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes <= endTotalMinutes;
  } else {
    return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes <= endTotalMinutes;
  }
}

const getActiveUsersOnShiftForPage = (pageId, checkDate = new Date(), fallbackToOwner = true) => {
  const shifts = db.prepare(`
    SELECT ps.*, u.id as user_id, u.name, u.username, u.role, u.color_tag,
           u.telegram_bot_token, u.telegram_chat_id, u.telegram_enabled,
           u.discord_webhook_url, u.discord_enabled,
           u.alarm_enabled, u.alarm_schedule_enabled, u.alarm_start_time, u.alarm_end_time,
           u.alarm_method, u.callmebot_username, u.twilio_to_number, u.pushover_user_key,
           u.web_sound_enabled, u.web_sound_volume
    FROM page_shifts ps
    JOIN users u ON ps.user_id = u.id
    WHERE ps.page_id = ? AND ps.is_active = 1
  `).all(pageId);

  const activeUsers = [];
  const seenUserIds = new Set();

  for (const shift of shifts) {
    if (isTimeInSchedule(shift.shift_start, shift.shift_end, checkDate)) {
      if (!seenUserIds.has(shift.user_id)) {
        seenUserIds.add(shift.user_id);
        activeUsers.push(shift);
      }
    }
  }

  // Fallback: If no shifts match and fallbackToOwner is true (or if no shifts configured at all)
  if (activeUsers.length === 0 && (fallbackToOwner || shifts.length === 0)) {
    const page = db.prepare('SELECT * FROM pages WHERE page_id = ?').get(pageId);
    if (page && page.user_id) {
      const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(page.user_id);
      if (owner) activeUsers.push(owner);
    }
  }

  // Guaranteed Final Fallback: If still no active users, fallback to Single-Host Admin
  if (activeUsers.length === 0) {
    const host = getHostProfile();
    if (host) activeUsers.push(host);
  }

  return activeUsers;
};

// -------------------------------------------------------------
// Single-Host Admin Profile & My Shifts Helpers
// -------------------------------------------------------------
const getHostProfile = () => {
  let host = db.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get();
  if (!host) {
    saveOrUpdateUser({
      name: 'Chủ Host',
      username: 'admin',
      role: 'admin',
      color_tag: '#3b82f6',
      web_sound_enabled: 'true',
      web_sound_volume: 80
    });
    host = db.prepare('SELECT * FROM users ORDER BY id ASC LIMIT 1').get();
  }
  return host;
};

const updateHostProfile = (data) => {
  const host = getHostProfile();
  return saveOrUpdateUser({
    ...data,
    id: host.id,
    role: 'admin'
  });
};

const getMyShifts = (pageId = null) => {
  const host = getHostProfile();
  if (pageId) {
    return db.prepare(`
      SELECT ps.*, p.name as page_name
      FROM page_shifts ps
      JOIN pages p ON ps.page_id = p.page_id
      WHERE ps.page_id = ? AND ps.user_id = ?
      ORDER BY ps.id ASC
    `).all(pageId, host.id);
  }
  return db.prepare(`
    SELECT ps.*, p.name as page_name
    FROM page_shifts ps
    JOIN pages p ON ps.page_id = p.page_id
    WHERE ps.user_id = ?
    ORDER BY ps.id ASC
  `).all(host.id);
};

const isHostOnShiftForPage = (pageId, checkDate = new Date()) => {
  const host = getHostProfile();
  const shifts = db.prepare(`
    SELECT * FROM page_shifts
    WHERE page_id = ? AND user_id = ? AND is_active = 1
  `).all(pageId, host.id);

  // If no shifts are configured specifically for this page, host is on duty 24/7 by default
  if (shifts.length === 0) {
    return { onShift: true, isDefault: true, host, matchingShift: null };
  }

  for (const shift of shifts) {
    if (isTimeInSchedule(shift.shift_start, shift.shift_end, checkDate)) {
      return { onShift: true, isDefault: false, host, matchingShift: shift };
    }
  }

  return { onShift: false, isDefault: false, host, matchingShift: null };
};


// -------------------------------------------------------------
// Pages Helpers (With User Ownership, Shifts & Color Tags)
// -------------------------------------------------------------
const getAllPages = (userId = null) => {
  let pages;
  if (userId) {
    pages = db.prepare(`
      SELECT p.*, u.name as owner_name, u.username as owner_username, u.color_tag as owner_color,
             ts.name as token_source_name, ts.app_id as token_source_app_id
      FROM pages p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN token_sources ts ON p.token_source_id = ts.id
      WHERE p.user_id = ? OR EXISTS (SELECT 1 FROM page_shifts ps WHERE ps.page_id = p.page_id AND ps.user_id = ?)
      ORDER BY p.id DESC
    `).all(userId, userId);
  } else {
    pages = db.prepare(`
      SELECT p.*, u.name as owner_name, u.username as owner_username, u.color_tag as owner_color,
             ts.name as token_source_name, ts.app_id as token_source_app_id
      FROM pages p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN token_sources ts ON p.token_source_id = ts.id
      ORDER BY p.id DESC
    `).all();
  }

  for (const p of pages) {
    p.shifts = getPageShifts(p.page_id);
  }

  return pages;
};

const getPageByPageId = (pageId) => {
  return db.prepare(`
    SELECT p.*, u.name as owner_name, u.username as owner_username, u.color_tag as owner_color,
           ts.name as token_source_name, ts.app_id as token_source_app_id,
           u.telegram_bot_token as user_bot_token, u.telegram_chat_id as user_chat_id,
           u.telegram_enabled as user_telegram_enabled,
           u.alarm_enabled as user_alarm_enabled, u.alarm_schedule_enabled as user_alarm_schedule_enabled,
           u.alarm_start_time as user_alarm_start_time, u.alarm_end_time as user_alarm_end_time,
           u.alarm_method as user_alarm_method, u.callmebot_username as user_callmebot_username,
           u.twilio_to_number as user_twilio_to_number, u.pushover_user_key as user_pushover_user_key
    FROM pages p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN token_sources ts ON p.token_source_id = ts.id
    WHERE p.page_id = ?
  `).get(pageId);
};

const saveOrUpdatePage = ({
  page_id,
  name,
  access_token,
  user_id = 1,
  account_label = '',
  color_tag = '#3b82f6',
  token_status = 'VALID',
  avatar_url = '',
  subscribed_at = '',
  token_source_id = 0,
  is_permanent = 0
}) => {
  const stmt = db.prepare(`
    INSERT INTO pages (page_id, name, access_token, user_id, account_label, color_tag, token_status, avatar_url, subscribed_at, token_source_id, is_permanent)
    VALUES (@page_id, @name, @access_token, @user_id, @account_label, @color_tag, @token_status, @avatar_url, @subscribed_at, @token_source_id, @is_permanent)
    ON CONFLICT(page_id) DO UPDATE SET
      name = excluded.name,
      access_token = excluded.access_token,
      user_id = excluded.user_id,
      account_label = CASE WHEN excluded.account_label != '' THEN excluded.account_label ELSE pages.account_label END,
      color_tag = excluded.color_tag,
      token_status = excluded.token_status,
      avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE pages.avatar_url END,
      subscribed_at = CASE WHEN excluded.subscribed_at != '' THEN excluded.subscribed_at ELSE pages.subscribed_at END,
      token_source_id = CASE WHEN excluded.token_source_id != 0 THEN excluded.token_source_id ELSE pages.token_source_id END,
      is_permanent = CASE WHEN excluded.is_permanent != 0 THEN excluded.is_permanent ELSE pages.is_permanent END
  `);
  return stmt.run({
    page_id,
    name,
    access_token,
    user_id,
    account_label,
    color_tag,
    token_status,
    avatar_url,
    subscribed_at,
    token_source_id,
    is_permanent
  });
};

const updatePageTokenHealth = (pageId, tokenStatus) => {
  return db.prepare(`
    UPDATE pages SET token_status = ?, token_checked_at = datetime('now', 'localtime') WHERE page_id = ?
  `).run(tokenStatus, pageId);
};

const assignPageOwner = (pageId, userId) => {
  return db.prepare('UPDATE pages SET user_id = ? WHERE page_id = ?').run(userId, pageId);
};

const deletePage = (id) => {
  return db.prepare('DELETE FROM pages WHERE id = ?').run(id);
};

const togglePageActive = (id, isActive) => {
  return db.prepare('UPDATE pages SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
};

// -------------------------------------------------------------
// Messages & Conversations Helpers (2-Column View)
// -------------------------------------------------------------
const saveMessage = ({
  mid,
  page_id,
  sender_id,
  sender_name = 'Khách hàng',
  text = '',
  attachments = '[]',
  timestamp = Date.now(),
  is_echo = 0
}) => {
  if (!sender_id || String(sender_id) === String(page_id)) {
    return;
  }

  // 1. Insert into raw messages
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO messages (mid, page_id, sender_id, sender_name, text, attachments, timestamp, is_echo, is_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    mid,
    page_id,
    sender_id,
    sender_name,
    text,
    typeof attachments === 'string' ? attachments : JSON.stringify(attachments),
    timestamp,
    is_echo ? 1 : 0,
    is_echo ? 1 : 0
  );

  // 2. Upsert into conversations thread
  let previewText = text;
  if (!previewText || !previewText.trim()) {
    let parsedAtts = [];
    if (Array.isArray(attachments)) parsedAtts = attachments;
    else if (typeof attachments === 'string') {
      try { parsedAtts = JSON.parse(attachments); } catch (e) {}
    }
    if (Array.isArray(parsedAtts) && parsedAtts.length > 0) {
      const firstAtt = parsedAtts[0];
      const type = (firstAtt.type || '').toLowerCase();
      if (type === 'image' || type === 'sticker') previewText = '[Hình ảnh]';
      else if (type === 'video') previewText = `[Video${firstAtt.name ? ': ' + firstAtt.name : ''}]`;
      else if (type === 'audio') previewText = '[Tin nhắn thoại / Âm thanh]';
      else if (type === 'location') previewText = '[Vị trí]';
      else previewText = `[Tệp: ${firstAtt.name || 'Đính kèm'}]`;
    }
  }

  const isEchoVal = is_echo ? 1 : 0;
  const convStmt = db.prepare(`
    INSERT INTO conversations (
      page_id, sender_id, sender_name, last_message_text, last_message_time,
      is_replied, is_seen, safety_alarm_triggered, unread_count, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(page_id, sender_id) DO UPDATE SET
      sender_name = CASE 
        WHEN ? = 1 THEN conversations.sender_name
        WHEN excluded.sender_name IS NOT NULL AND excluded.sender_name != '' AND excluded.sender_name != 'Khách hàng' 
          THEN excluded.sender_name 
        ELSE conversations.sender_name 
      END,
      last_message_text = excluded.last_message_text,
      last_message_time = CASE 
        WHEN excluded.last_message_time >= conversations.last_message_time THEN excluded.last_message_time 
        ELSE conversations.last_message_time 
      END,
      is_replied = excluded.is_replied,
      is_seen = CASE WHEN ? = 1 THEN conversations.is_seen ELSE 0 END,
      safety_alarm_triggered = CASE WHEN ? = 1 THEN conversations.safety_alarm_triggered ELSE 0 END,
      unread_count = CASE WHEN excluded.is_replied = 1 THEN 0 ELSE conversations.unread_count + 1 END,
      updated_at = datetime('now', 'localtime')
  `);
  convStmt.run(
    page_id,
    sender_id,
    isEchoVal ? 'Khách hàng' : (sender_name || 'Khách hàng'),
    previewText,
    timestamp,
    isEchoVal, // is_replied
    isEchoVal ? 1 : 0, // is_seen
    0, // safety_alarm_triggered
    isEchoVal ? 0 : 1, // unread_count
    isEchoVal, // CASE sender_name
    isEchoVal, // CASE is_seen
    isEchoVal  // CASE safety_alarm_triggered
  );
};

const markConversationSeen = (pageId, senderId) => {
  const seenAt = Date.now();
  db.prepare(`
    UPDATE conversations 
    SET is_seen = 1, seen_at = ?, unread_count = 0 
    WHERE page_id = ? AND sender_id = ?
  `).run(seenAt, pageId, senderId);

  db.prepare(`
    UPDATE messages 
    SET is_seen = 1, seen_at = ? 
    WHERE page_id = ? AND sender_id = ? AND is_seen = 0
  `).run(seenAt, pageId, senderId);

  return { ok: true, seenAt };
};

const markConversationUnseen = (pageId, senderId) => {
  db.prepare(`
    UPDATE conversations 
    SET is_seen = 0, seen_at = 0, unread_count = 1 
    WHERE page_id = ? AND sender_id = ?
  `).run(pageId, senderId);

  db.prepare(`
    UPDATE messages 
    SET is_seen = 0, seen_at = 0 
    WHERE page_id = ? AND sender_id = ?
  `).run(pageId, senderId);

  return { ok: true };
};

const updateCustomerSeenWatermark = (pageId, senderId, watermark) => {
  return db.prepare(`
    UPDATE conversations 
    SET customer_seen_watermark = CASE 
      WHEN ? > customer_seen_watermark THEN ? 
      ELSE customer_seen_watermark 
    END 
    WHERE page_id = ? AND sender_id = ?
  `).run(watermark, watermark, pageId, senderId);
};

const markConversationReplied = (pageId, senderId) => {
  return db.prepare(`
    UPDATE conversations 
    SET is_replied = 1, is_seen = 1, safety_alarm_triggered = 0, unread_count = 0 
    WHERE page_id = ? AND sender_id = ?
  `).run(pageId, senderId);
};

const getUnrepliedConversationsForSafetyAlarm = (delayMinutes = 10) => {
  const delayMs = Number(delayMinutes) * 60 * 1000;
  const cutoff = Date.now() - delayMs;
  return db.prepare(`
    SELECT c.*, p.name as page_name, p.user_id, p.color_tag as page_color,
           u.name as user_name, u.alarm_enabled, u.telegram_enabled, u.telegram_chat_id,
           u.discord_enabled, u.discord_webhook_url, u.safety_alarm_enabled, u.safety_alarm_delay_minutes
    FROM conversations c
    JOIN pages p ON c.page_id = p.page_id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE c.is_replied = 0
      AND c.safety_alarm_triggered = 0
      AND c.last_message_time > 0
      AND c.last_message_time <= ?
  `).all(cutoff);
};

const markSafetyAlarmTriggered = (pageId, senderId) => {
  return db.prepare(`
    UPDATE conversations SET safety_alarm_triggered = 1 WHERE page_id = ? AND sender_id = ?
  `).run(pageId, senderId);
};

const updateUserActivity = (userId = 1) => {
  return db.prepare(`
    UPDATE users SET last_activity_at = ? WHERE id = ?
  `).run(Date.now(), userId);
};

const getConversations = ({ userId = null, pageId = null, search = '', unrepliedOnly = false, unseenOnly = false, limit = 50 } = {}) => {
  let query = `
    SELECT c.*, p.name as page_name, p.account_label, p.color_tag as page_color,
           u.id as user_id, u.name as owner_name, u.color_tag as owner_color
    FROM conversations c
    JOIN pages p ON c.page_id = p.page_id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    query += ` AND p.user_id = ?`;
    params.push(userId);
  }

  if (pageId) {
    query += ` AND c.page_id = ?`;
    params.push(pageId);
  }

  if (unrepliedOnly) {
    query += ` AND c.is_replied = 0`;
  }

  if (unseenOnly) {
    query += ` AND (c.is_seen = 0 OR c.is_seen IS NULL)`;
  }

  if (search && search.trim() !== '') {
    query += ` AND (
      c.sender_name LIKE ?
      OR c.last_message_text LIKE ?
      OR c.sender_id LIKE ?
      OR EXISTS (
        SELECT 1 FROM messages m
        WHERE m.page_id = c.page_id AND m.sender_id = c.sender_id AND m.text LIKE ?
      )
    )`;
    const searchPattern = `%${search.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY c.last_message_time DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
};

const getConversation = (pageId, senderId) => {
  return db.prepare('SELECT * FROM conversations WHERE page_id = ? AND sender_id = ?').get(pageId, senderId);
};

const getConversationMessages = (pageId, senderId, limit = 100) => {
  return db.prepare(`
    SELECT * FROM messages
    WHERE page_id = ? AND sender_id = ?
    ORDER BY timestamp ASC, id ASC LIMIT ?
  `).all(pageId, senderId, limit);
};

const getRecentMessages = (limit = 50, pageId = null, userId = null) => {
  let query = `
    SELECT m.*, p.name as page_name, p.account_label, p.color_tag as page_color,
           u.name as owner_name, u.color_tag as owner_color
    FROM messages m
    LEFT JOIN pages p ON m.page_id = p.page_id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    query += ` AND p.user_id = ?`;
    params.push(userId);
  }
  if (pageId) {
    query += ` AND m.page_id = ?`;
    params.push(pageId);
  }

  query += ` ORDER BY m.id DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
};

// -------------------------------------------------------------
// Quick Replies Helpers
// -------------------------------------------------------------
const getQuickReplies = (userId = null) => {
  if (userId) {
    return db.prepare(`
      SELECT * FROM quick_replies WHERE user_id = 0 OR user_id = ? ORDER BY id ASC
    `).all(userId);
  }
  return db.prepare('SELECT * FROM quick_replies ORDER BY id ASC').all();
};

const saveQuickReply = ({ id, user_id = 0, title, content }) => {
  if (id) {
    db.prepare('UPDATE quick_replies SET title = ?, content = ? WHERE id = ?').run(title, content, id);
    return db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(id);
  } else {
    const info = db.prepare('INSERT INTO quick_replies (user_id, title, content) VALUES (?, ?, ?)').run(user_id, title, content);
    return db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(info.lastInsertRowid);
  }
};

const deleteQuickReply = (id) => {
  return db.prepare('DELETE FROM quick_replies WHERE id = ?').run(id);
};

// -------------------------------------------------------------
// Alarm Logs Helpers
// -------------------------------------------------------------
const logAlarm = ({ user_id = 0, page_id, sender_id, method, status, details = '' }) => {
  return db.prepare(`
    INSERT INTO alarm_logs (user_id, page_id, sender_id, method, status, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user_id, page_id, sender_id, method, status, details);
};

const getRecentAlarmLogs = (limit = 30, userId = null) => {
  if (userId) {
    return db.prepare(`
      SELECT l.*, u.name as user_name
      FROM alarm_logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.user_id = ?
      ORDER BY l.id DESC LIMIT ?
    `).all(userId, limit);
  }
  return db.prepare(`
    SELECT l.*, u.name as user_name
    FROM alarm_logs l
    LEFT JOIN users u ON l.user_id = u.id
    ORDER BY l.id DESC LIMIT ?
  `).all(limit);
};

const getLastSuccessfulAlarmTime = (userId = null) => {
  if (userId) {
    const row = db.prepare("SELECT created_at FROM alarm_logs WHERE status = 'SUCCESS' AND user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
    return row ? new Date(row.created_at).getTime() : 0;
  }
  const row = db.prepare("SELECT created_at FROM alarm_logs WHERE status = 'SUCCESS' ORDER BY id DESC LIMIT 1").get();
  return row ? new Date(row.created_at).getTime() : 0;
};

// -------------------------------------------------------------
// Token Sources Repository (Saved Tokens & Multi-Source Vault)
// -------------------------------------------------------------
const getAllTokenSources = () => {
  return db.prepare(`
    SELECT ts.*,
           (SELECT COUNT(*) FROM pages p WHERE p.token_source_id = ts.id) as current_pages_count
    FROM token_sources ts
    ORDER BY ts.id DESC
  `).all();
};

const getTokenSourceById = (id) => {
  return db.prepare(`
    SELECT ts.*,
           (SELECT COUNT(*) FROM pages p WHERE p.token_source_id = ts.id) as current_pages_count
    FROM token_sources ts
    WHERE ts.id = ?
  `).get(id);
};

const saveOrUpdateTokenSource = ({
  id,
  name,
  app_id = '',
  app_secret = '',
  user_token,
  long_lived_token = '',
  token_type = 'LONG_LIVED',
  is_permanent = 1,
  pages_count = 0,
  fb_user_id = '',
  avatar_url = '',
  email = ''
}) => {
  const cleanFbId = String(fb_user_id || '').trim();
  const cleanAvatar = String(avatar_url || '').trim();
  const cleanEmail = String(email || '').trim();

  if (id) {
    db.prepare(`
      UPDATE token_sources SET
        name = ?,
        app_id = ?,
        app_secret = ?,
        user_token = ?,
        long_lived_token = ?,
        token_type = ?,
        is_permanent = ?,
        pages_count = ?,
        fb_user_id = CASE WHEN ? != '' THEN ? ELSE fb_user_id END,
        avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
        email = CASE WHEN ? != '' THEN ? ELSE email END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, app_id, app_secret, user_token, long_lived_token, token_type, is_permanent, pages_count, cleanFbId, cleanFbId, cleanAvatar, cleanAvatar, cleanEmail, cleanEmail, id);
    return getTokenSourceById(id);
  } else {
    // Check if token source with same fb_user_id or name already exists
    let existing = null;
    if (cleanFbId) {
      existing = db.prepare('SELECT id FROM token_sources WHERE fb_user_id = ?').get(cleanFbId);
    } else if (name && name.trim()) {
      existing = db.prepare("SELECT id FROM token_sources WHERE name = ? AND (fb_user_id IS NULL OR fb_user_id = '')").get(name.trim());
    }

    if (existing) {
      db.prepare(`
        UPDATE token_sources SET
          name = ?,
          app_id = ?,
          app_secret = ?,
          user_token = ?,
          long_lived_token = ?,
          token_type = ?,
          is_permanent = ?,
          pages_count = ?,
          fb_user_id = CASE WHEN ? != '' THEN ? ELSE fb_user_id END,
          avatar_url = CASE WHEN ? != '' THEN ? ELSE avatar_url END,
          email = CASE WHEN ? != '' THEN ? ELSE email END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, app_id, app_secret, user_token, long_lived_token, token_type, is_permanent, pages_count, cleanFbId, cleanFbId, cleanAvatar, cleanAvatar, cleanEmail, cleanEmail, existing.id);
      return getTokenSourceById(existing.id);
    }

    const info = db.prepare(`
      INSERT INTO token_sources (name, app_id, app_secret, user_token, long_lived_token, token_type, is_permanent, pages_count, fb_user_id, avatar_url, email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, app_id, app_secret, user_token, long_lived_token, token_type, is_permanent, pages_count, cleanFbId, cleanAvatar, cleanEmail);
    return getTokenSourceById(info.lastInsertRowid);
  }
};

const getTokenSourceByFbUserId = (fbUserId) => {
  if (!fbUserId) return null;
  return db.prepare(`
    SELECT ts.*,
           (SELECT COUNT(*) FROM pages p WHERE p.token_source_id = ts.id) as current_pages_count
    FROM token_sources ts
    WHERE ts.fb_user_id = ?
  `).get(String(fbUserId).trim());
};

const getFacebookAppConfig = () => {
  const settings = getSettings();
  let appId = settings.fb_app_id || process.env.FB_APP_ID || '';
  let appSecret = settings.fb_app_secret || process.env.FB_APP_SECRET || '';

  // Auto-seed from existing token source if settings are empty
  if (!appId || !appSecret) {
    try {
      const existingWithApp = db.prepare("SELECT app_id, app_secret FROM token_sources WHERE app_id != '' AND app_secret != '' LIMIT 1").get();
      if (existingWithApp) {
        if (!appId && existingWithApp.app_id) {
          appId = existingWithApp.app_id;
          updateSetting('fb_app_id', appId);
        }
        if (!appSecret && existingWithApp.app_secret) {
          appSecret = existingWithApp.app_secret;
          updateSetting('fb_app_secret', appSecret);
        }
      }
    } catch (e) {}
  }

  return { appId, appSecret };
};

const saveFacebookAppConfig = ({ appId, appSecret }) => {
  if (appId !== undefined) updateSetting('fb_app_id', String(appId).trim());
  if (appSecret !== undefined) updateSetting('fb_app_secret', String(appSecret).trim());
  return getFacebookAppConfig();
};

const deleteTokenSource = (id) => {
  db.prepare('UPDATE pages SET token_source_id = 0 WHERE token_source_id = ?').run(id);
  return db.prepare('DELETE FROM token_sources WHERE id = ?').run(id);
};

module.exports = {
  db,
  getSettings,
  getSetting,
  updateSetting,
  updateSettingsBatch,
  saveSettings: updateSettingsBatch,
  getAllUsers,
  getUserById,
  getUserByUsername,
  saveOrUpdateUser,
  deleteUser,
  getAllPages,
  getPageByPageId,
  saveOrUpdatePage,
  updatePageTokenHealth,
  assignPageOwner,
  deletePage,
  togglePageActive,
  getPageShifts,
  getAllShifts,
  addOrUpdatePageShift,
  deletePageShift,
  getActiveUsersOnShiftForPage,
  isTimeInSchedule,
  saveMessage,
  markConversationReplied,
  getConversations,
  getConversation,
  getConversationMessages,
  getRecentMessages,
  getQuickReplies,
  saveQuickReply,
  deleteQuickReply,
  logAlarm,
  getRecentAlarmLogs,
  getLastSuccessfulAlarmTime,
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
  getAllTokenSources,
  getTokenSourceById,
  getTokenSourceByFbUserId,
  saveOrUpdateTokenSource,
  deleteTokenSource,
  getFacebookAppConfig,
  saveFacebookAppConfig,
  getZonedHoursAndMinutes
};
