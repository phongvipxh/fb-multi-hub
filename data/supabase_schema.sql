-- =============================================================================
-- Supabase / PostgreSQL Schema for FB Multi-Page Management Tool
-- Dùng để khởi tạo cơ sở dữ liệu trên Supabase Cloud khi cần triển khai
-- =============================================================================

-- 1. Table: settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 2. Table: users (Multi-User Model with Per-User Notification & Alarm Config)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_code TEXT DEFAULT '1234',
  role TEXT DEFAULT 'member', -- 'admin' | 'member'
  color_tag TEXT DEFAULT '#3b82f6',
  telegram_bot_token TEXT DEFAULT '',
  telegram_chat_id TEXT DEFAULT '',
  telegram_enabled TEXT DEFAULT 'true',
  alarm_enabled TEXT DEFAULT 'false',
  alarm_schedule_enabled TEXT DEFAULT 'false',
  alarm_start_time TEXT DEFAULT '23:00',
  alarm_end_time TEXT DEFAULT '07:00',
  alarm_method TEXT DEFAULT 'callmebot', -- 'callmebot' | 'twilio' | 'pushover'
  callmebot_username TEXT DEFAULT '',
  twilio_to_number TEXT DEFAULT '',
  pushover_user_key TEXT DEFAULT '',
  web_sound_enabled TEXT DEFAULT 'true',
  web_sound_volume INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table: pages (Connected Facebook Pages)
CREATE TABLE IF NOT EXISTS pages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET DEFAULT DEFAULT 1,
  page_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  account_label TEXT DEFAULT '',
  color_tag TEXT DEFAULT '#3b82f6',
  token_status TEXT DEFAULT 'VALID', -- 'VALID' | 'EXPIRED'
  token_checked_at TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  avatar_url TEXT DEFAULT '',
  subscribed_at TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table: page_shifts (N:M Assignment with Working Shift Hours)
CREATE TABLE IF NOT EXISTS page_shifts (
  id BIGSERIAL PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES pages(page_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_name TEXT DEFAULT 'Ca trực',
  shift_start TEXT DEFAULT '00:00',
  shift_end TEXT DEFAULT '23:59',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_page_shift UNIQUE(page_id, user_id, shift_start, shift_end)
);

-- 5. Table: conversations (2-Column Chat Thread Aggregate)
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  page_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT DEFAULT 'Khách hàng',
  last_message_text TEXT DEFAULT '',
  last_message_time BIGINT DEFAULT 0,
  is_replied INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_conv_page_sender UNIQUE(page_id, sender_id)
);

-- 6. Table: messages (Detailed Chat Transcript)
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  mid TEXT UNIQUE,
  page_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT DEFAULT 'Khách hàng',
  text TEXT DEFAULT '',
  attachments TEXT DEFAULT '[]',
  timestamp BIGINT,
  is_echo INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Table: quick_replies (Canned Responses)
CREATE TABLE IF NOT EXISTS quick_replies (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT DEFAULT 0, -- 0 for global, or specific user_id
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Table: alarm_logs (History of Alerts & Calls)
CREATE TABLE IF NOT EXISTS alarm_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT DEFAULT 0,
  page_id TEXT,
  sender_id TEXT,
  method TEXT,
  status TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_messages_page_sender ON messages(page_id, sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_page_id ON conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_conversations_replied ON conversations(is_replied);
CREATE INDEX IF NOT EXISTS idx_page_shifts_lookup ON page_shifts(page_id, is_active);

-- Initial seed admin user
INSERT INTO users (id, username, name, pin_code, role, color_tag, telegram_enabled, web_sound_enabled)
VALUES (1, 'admin', 'Quản Trị Viên (Admin)', '1234', 'admin', '#3b82f6', 'true', 'true')
ON CONFLICT (id) DO NOTHING;
