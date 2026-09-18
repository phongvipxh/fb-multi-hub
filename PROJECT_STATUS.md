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
- Proactive Cloudflare Tunnel Controls & Self-Hosted Local Mode:
  - Header & View 6 controls: Proactive Toggle ON / OFF and Reset (Đổi link mới - generates a fresh TryCloudflare link on demand).
  - Pure Local Mode: When Tunnel is OFF, tool runs 100% locally with zero open ports, continuously receiving messages via Fast Polling (2.5s) using permanent Page Access Tokens directly from Meta Graph API.
  - Tunnel Mode: When Tunnel is ON, enables zero-latency Meta Webhooks.
- Messaging Efficiency & Hands-On-Keyboard Slash Commands (`/`):
  - Typing `/` in the chat input automatically triggers a floating autocomplete popover.
  - Real-time filtering by shortcut (`/chao`, `/gia`, `/sdt`, `/stk`) or keyword.
  - Full keyboard navigation: `↑` / `↓` to cycle items, `Enter` / `Tab` to insert, `Esc` to dismiss.
- Flexible Bootstrapper & Universal Environment Runner (`setup_and_start.ps1`):
  - Accepts any system Node.js version with major >= 18 (e.g. Node 18, 20, 22, 23...).
  - Checks system PATH for `cloudflared` before downloading `bin/cloudflared.exe`.
  - Automatic ABI compatibility check for `better-sqlite3` (`node -e "require('better-sqlite3')"`), auto-rebuilding native bindings if transferred between different Node versions.

- Custom Alarm Audio & YouTube Alarm Support:
  - Tùy chỉnh tệp âm thanh chuông báo thức trực tiếp từ Web (.mp3, .wav, .ogg, .aac, .m4a, .flac, .webm) kèm trình nghe thử (Audio Player) trực quan.
  - Hỗ trợ dán đường dẫn video/nhạc từ YouTube (ví dụ: `https://www.youtube.com/watch?v=...`) tự động nhúng iframe player phát âm thanh chuông báo khi có tin nhắn hoặc quá hạn phản hồi.
- Facebook OAuth 2.0 Multi-Account & Smart Gateway Auto-Discovery:
  - Nút lưu độc lập App ID & App Secret tại Bước 1 (không cần bấm Đăng nhập mới lưu cấu hình).
  - Khối hướng dẫn cấu hình chi tiết từ tạo App đến xem App Secret được thiết kế collapsible (thu gọn mặc định) giúp giao diện gọn gàng.
  - Bộ chẩn đoán lỗi OAuth 5 nhóm (Invalid Redirect URI, Unverified/Development App, Scopes Permissions, User Cancelled, Unknown) tự động hiển thị nguyên nhân trực quan và nút chuyển đổi tức thì sang Cách B (Dán Token trực tiếp).
  - Giao diện Multi-Account trực quan tại View 2: Bảng hiển thị toàn bộ các tài khoản Facebook đang kết nối kèm Avatar, User ID, số lượng Fanpage, trạng thái Token và Cổng App riêng. Nút "➕ Thêm Tài Khoản Mới" mở modal đăng nhập tuần tự.
  - Tối ưu luồng Đăng Nhập 1-Click: Khi hệ thống chưa có App ID, hiển thị trực diện ô nhập App ID làm Cổng chung ngay trong Cách 1 kèm nút hướng dẫn nhanh và lối tắt chuyển sang Cách 2. Khi đã có App ID, tự động chuyển sang 1-Click thực thụ.
  - Token Auto-Discovery: Khi dán User Token ở Cách 2, backend tự động truy vấn `GET /app?access_token={token}` để trích xuất App ID và tự động lưu làm Cổng App chung cho hệ thống mà người dùng không cần nhập thủ công.
- Unified Single Alarm Dismiss Button & Cross-Tab Synchronization:
  - Gom toàn bộ các loại báo động (Khẩn cấp, Báo động an toàn, Tin nhắn mới) về duy nhất 1 thanh nổi đỏ toàn màn hình ở vị trí trên cùng (`#emergencyAlarmBar`) với duy nhất 1 nút bấm to, rõ: `[🔕 TẮT CHUÔNG NGAY]`.
  - Cơ chế `hardStopAllAudio` dập tắt triệt để Web Audio API, HTML5 Audio và YouTube Player iframe.
  - Đồng bộ đa tab tức thì qua `BroadcastChannel` và `localStorage` killswitch: bấm tắt ở 1 tab lập tức ngắt âm thanh ở mọi tab khác.
  - Đồng bộ backend qua `POST /api/alarm/silence` đánh dấu hội thoại quá hạn đã xử lý và áp dụng thời gian nghỉ (Grace period) chống lặp.
- Selective Fanpage Management, Account Grouping & Modern Toggle Switch Controls:
  - Phân nhóm toàn bộ Fanpage theo từng Tài Khoản Facebook (`.account-group-card`): Mỗi tài khoản có header riêng gồm Avatar, Tên, User ID, App ID, huy hiệu tổng hợp `🟢 X / Y Trang Đang Bật Quản Lý` và bộ nút điều khiển nhanh `[☑️ Bật Tất Cả]`, `[⬜ Tắt Tất Cả]`, `[📋 Chọn Lọc Page]`.
  - Công tắc gạt Toggle Switch hiện đại (Fluent/iOS style): Bật (`🟢 Đang Bật` neon xanh) / Tắt (`⚪ Đã Tắt` xám) trực tiếp trên từng trang kèm animation trượt mượt mà.
  - Tự động mở Modal tích chọn Fanpage ngay khi đăng nhập tài khoản mới (cả OAuth 1-Click và dán Token Cách B), cho phép người dùng chọn nhanh các trang muốn enable trước khi bắt đầu vận hành.
  - Khóa chặt 3 tầng bảo vệ chống réo chuông cho các Fanpage tạm dừng (Database SQL, Server Webhook Engine, UI Banner).
- Account Hub Workspace & Dynamic Fanpage Synchronization:
  - Nút "Cập Nhật Trang Mới" (Sync Pages) cho từng tài khoản: Quét trực tiếp Meta Graph API `/me/accounts`, nạp các Fanpage mới được cấp quyền Admin, tự động cấp token vĩnh viễn, subscribe webhook và mở modal chọn trang.
  - Nút "Cập Nhật Trang Mới (Tất Cả)" trên Workspace Toolbar: Đồng bộ toàn bộ các tài khoản đang kết nối chỉ với 1 click.
  - Tái cấu trúc giao diện View 2: Xóa bỏ bảng table trùng lặp, thống nhất thành các Thẻ Hub Tài Khoản Facebook độc lập, phân cấp trực quan và thẩm mỹ.
  - Hỗ trợ đóng mở modal linh hoạt với generic `[data-modal]` handler và phím Esc.
- Layout Balance & Visual Alignment Stabilization:
  - Header trên cùng chuẩn hóa `flex-wrap: nowrap`, thu gọn badge tunnel chống vỡ dòng và đè chữ.
  - Lưới card Fanpage `.pages-grid` cân đối với `minmax(360px, 1fr)`, không bị méo lệch khi có ít card.
  - Đồng bộ nút bấm hành động `🗑️ Xóa` thành outline danger có icon, padding và chiều cao đồng nhất với các nút khác.
- Single-File Standalone Portable Packaging (Đóng gói 1 file chạy ngay):
  - File duy nhất: `dist/FB-Multi-Hub-Standalone.exe` (48.06 MB).
  - Tích hợp sẵn 100% môi trường: Node.js Portable x64 binary, Cloudflare Tunnel binary, SQLite native modules và node_modules hoàn chỉnh.

## 4. Repository & Deployment
- GitHub Remote: `https://github.com/phongvipxh/fb-multi-hub`
- Current Branch: `main`
- Verification: 26/26 Test Suites Passed (Exit Code 0)
- Latest Standalone Build: `dist/FB-Multi-Hub-Standalone.exe` (48.06 MB)

## 5. Test Suite Telemetry
- Automated test script: `npm test` (`node test/system.test.js`)
- 26 Test Suites covering SQLite DB, Shifts, Meta API, Media, Seen Sync, Discord Alert, Safety Alarms, Multi-Agent Sync, Echo Webhooks, Twilio VoIP, ntfy.sh Free Ringtone, Unseen Badge, Meta Clock Sync, Token Vault & Long-Lived Token Exchange, Facebook OAuth 2.0 Multi-Account, VPN Multi-Region Resilience, Mini CRM & Customer Tags, Proactive Tunnel, Custom Web Alarm Audio / YouTube Links, Selective Fanpage Management & Inactive Alarm Locking, Account-Grouped Fanpages with Toggle-All operations, and Fanpage Synchronization (Sync Pages / Sync All).
- Last Status: 100% Pass — Mechanical Exit Code 0.


