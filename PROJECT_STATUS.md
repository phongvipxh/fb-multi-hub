# PROJECT_STATUS.md — FB Multi-Page Management Tool

## 1. Project Overview & Objectives
Cong cu quan ly tap trung nhieu Fanpage Facebook phuc vu tu dong hoa cham soc khach hang, thong bao thoi gian thuc, ho tro phan ca truc da nguoi dung (Multi-user) hoac che do tu Host doc lap (Single-Host), xu ly tin nhan da dinh dang, tich hop chuong bao thuc Web Audio Synthesizer, cuoc goi khan cap (Twilio, CallMeBot), Telegram Bot va Discord Webhook Alert.

## 2. Core Architecture & Stack
- Backend: Node.js, Express, better-sqlite3 (SQLite WAL mode + High-Performance Indexes)
- Frontend: Vanilla JS ES6+, HTML5 CSS3, Web Audio API, Server-Sent Events (SSE) voi 25s keepalive ping
- External Integrations:
  - Meta Graph API v19.0 (Messages, Send Attachment, sender_action: mark_seen, Webhooks, Echo Events)
  - Discord Webhooks (rich embeds, image thumbnails, direct action buttons)
  - Telegram Bot API (custom API root support)
  - ntfy.sh (100% Free Open-Source Persistent Ringtone Alarm with Zero Registration)
  - CallMeBot & Twilio (Voice call wake-up alarms)
  - Cloudflare Quick Tunnels (Zero-setup public ingress for Meta Webhooks)

## 3. Verified Features & Key Invariants
- Two-way Seen / Unseen Sync:
  - Outbound: sendMarkSeen gui sender_action: "mark_seen" toi Graph API /me/messages.
  - Inbound: Auto-Sync nền tốc độ cao Fast Polling (2.5 giây / lần) với cờ bảo vệ chống nghẽn isSyncing. Quét tin nhắn mới trực tiếp qua Meta Graph API bằng Page Token Vĩnh Viễn (expires_at: 0 - Never Expire). Khi unread_count == 0 trên Meta -> cập nhật is_seen = 1. Không tự ý hoàn tác is_seen về 0 nếu chưa có tin nhắn mới từ khách.
  - Active Chat Seen Guarantee: Khi người dùng đang mở khung chat hoặc tương tác với khung soạn thảo/danh sách tin, hệ thống tự động ghi nhận ĐÃ XEM (is_seen = 1) tức thì trên cả thanh trạng thái chi tiết, danh sách hội thoại bên trái và đồng bộ xuống cơ sở dữ liệu.
  - Sidebar Badge: Chi hien thi khi co tin nhan chua xem (is_seen = 0 AND is_replied = 0), tu dong an hoan toan (display: none) khi so tin chua xem ve 0.
- Phone Alarms (100% Free & Paid Options):
  - ntfy.sh: 100% Free, khong can tao tai khoan, khong can the ngan hang, do chuong bao thuc ringtone lien tuc cap do Urgent tren Android/iOS.
    - Cơ chế tắt chuông nhanh chuẩn Android: Vuốt ngang thông báo (Swipe Away) kích hoạt DeleteBroadcastReceiver ngắt MediaPlayer ngay lập tức mà không cần mở app; hoặc bấm nút âm lượng cứng (Volume Down/Up) bên hông máy để câm tiếng tức thì. Đã loại bỏ nút Action http gây lỗi mất thông báo nhưng không dừng âm thanh.
  - CallMeBot Telegram: 100% Free, goi thoai Telegram do chuong toan man hinh, doc giong noi tieng Viet.
  - Twilio VoIP: Goi truc tiep vao SIM vien thong quoc te (+84976014480) voi TwiML Amazon Polly Tho.
- Multi-Agent Concurrent Reply & Anti-Collision:
  - Meta Echo Webhook Sync: Bat toan bo tin nhan rep tu Meta Business Suite hoac dien thoai qua event.message.is_echo, dong bo lap tuc thanh is_replied = 1 tren moi man hinh.
  - Agent Presence & Typing Indicator: Phat tin hieu dang soan tin realtime qua SSE agent_typing giua cac nhan vien.
  - Collision Alert: Canh bao khi khach hang vua duoc nguoi khac tra loi neu nhan vien dang go do van ban.
- Discord Alert Engine:
  - Tu dong phat tan qua dispatchDiscordAlert(...) gom tu Webhook tu Host Profile, Global Settings, .env, va nhan vien truc ca.
  - Loai bo trung lap Webhook URL. Hoat dong doc lap 100% khong phu thuoc vao viec co phan ca truc hay khong.
  - Kich hoat dong thoi o ca luong Webhook truc tiep va tien trinh Auto-Sync nen.
- Safety Alarm & Auto-Sleep:
  - Watchdog quet ngam 10s: canh bao tin nhan khach bo quen qua so phut quy dinh.
  - Tu dong di ngu khi khong co thao tac chuot/phim, tu dong danh thuc khi nguoi dung quay lai.
- Texting Apparatus:
  - Khung soan thao tu co gian (1 den 5 dong), phim tat Enter / Shift+Enter.
  - Nhan dien tu dong Hyperlink, Hotline Viet Nam, Email va triet tieu ma doc XSS.
  - Ho tro gui anh, tai lieu, voice audio, vi tri GPS.

- Meta Clock Synchronization & Deterministic Chronological Ordering:
  - Tự động theo dõi độ trôi lệch đồng hồ (Clock Skew) giữa máy tính Host và máy chủ Meta qua HTTP Date Header của Graph API.
  - Áp dụng thời gian Meta đã đồng bộ (Meta-synced timestamp) khi gửi tin nhắn từ Tool, triệt tiêu hoàn toàn hiện tượng tin nhắn gửi đi bị gán sai mốc thời gian dẫn đến đảo lộn trật tự tin nhắn giữa Tool và Facebook Messenger.
  - Cơ chế tự động hiệu chuẩn (Auto-Calibrate) trong Auto-Sync nền: Tự động so khớp và nắn chỉnh timestamp của các tin nhắn hiện có về đúng `created_time` chính thức của Meta nếu bị lệch > 500ms.
  - Sắp xếp hội thoại xác định tuyệt đối: Truy vấn cơ sở dữ liệu `ORDER BY timestamp ASC, id ASC` và client-side sort trước khi render timeline, bảo toàn trật tự hội thoại 100% không bị nhảy vị trí kể cả khi các tin nhắn đến trong cùng một giây.
- Mini CRM & Customer Tags Management (Pancake.vn & Fchat.vn style):
  - 3-Column Desktop App layout: Chat Inbox | Conversation Transcript | Mini CRM Sidebar (collapsible).
  - Pre-seeded 6 system tags (`Khách VIP`, `Đã Chốt Đơn`, `Cần Tư Vấn`, `Đã Cọc`, `Khách Bom Hàng`, `Đang Phân Vân`) with custom color badges displayed directly on inbox conversation items.
  - Custom tag creator modal with live color preview; default system tags protected from accidental deletion.
  - Internal staff notes timeline: hidden from Facebook customers, visible only to team members.
  - Auto-phone detection: scans customer messages for phone numbers (`09xx`, `08xx`...) and offers 1-click apply to CRM contact profile.
  - Direct click-to-call `📞` launcher.
  - Multi-field search matching customer name, message text, phone number, address, and tag name.

## 4. Repository & Deployment
- GitHub Remote: `https://github.com/phongvipxh/fb-multi-hub` (Private)
- Current Branch: `main`
- Latest Commit: `3955f41` (Up to date with origin/main)

## 5. Test Suite Telemetry
- Automated test script: `npm test` (`node test/system.test.js`)
- 21 Test Suites covering SQLite DB, Shifts, Meta API, Media, Seen Sync, Discord Alert, Safety Alarms, Multi-Agent Sync, Echo Webhooks, Twilio VoIP, ntfy.sh Free Ringtone, Unseen Badge, Meta Clock Sync, Token Vault & Long-Lived Token Exchange, Facebook OAuth 2.0 Multi-Account, VPN Multi-Region Resilience, and Mini CRM & Customer Tags.
- Last Status: 100% Pass — Mechanical Exit Code 0.
