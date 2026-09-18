# ⚡ FB Multi-Hub v2.0 - Hệ Thống Quản Trị Đa Fanpage Facebook & Báo Thức Xuyên Đêm Tự Host

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%20LTS-green.svg)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-blue.svg)](https://expressjs.com)
[![Database](https://img.shields.io/badge/Database-SQLite%20(Local)%20%7C%20Supabase%20Ready-orange.svg)](https://sqlite.org)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-TryCloudflare%20(No%20Login)-yellow.svg)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-21%2F21%20PASS%20(100%25)-brightgreen.svg)](test/system.test.js)

**FB Multi-Hub v2.0** là giải pháp phần mềm quản lý tập trung tin nhắn đa Fanpage Facebook chuyên nghiệp dành cho chủ shop, nhân viên trực ca và đội ngũ bán hàng 24/7. Được thiết kế theo mô hình **Tự Host Độc Lập (100% Self-Hosted)**, toàn bộ cơ sở dữ liệu được lưu an toàn tại máy chủ cá nhân của bạn, không lo rò rỉ dữ liệu khách hàng và **hoàn toàn miễn phí trọn đời** (không mất phí thuê bao hàng tháng như Pancake hay Fchat).

---

## 🌟 Các Tính Năng Trọng Tâm

### 1. 🔵 Đăng Nhập Facebook 1-Click (OAuth 2.0) & Quản Lý Đa Tài Khoản
- **Chuẩn xác thực Meta OAuth 2.0:** Đăng nhập an toàn trực tiếp qua cửa sổ Pop-up chính thức của Facebook.
- **Tự động đổi Token Vĩnh Viễn:** Tự động chuyển đổi Authorization Code sang Long-Lived User Token (~60 ngày) và truy xuất toàn bộ Page Access Token có thời hạn **vĩnh viễn (Never Expire)**.
- **Hỗ trợ Đa Tài Khoản Facebook song song:** Quản lý cùng lúc nhiều tài khoản Facebook cá nhân hoặc nick chạy quảng cáo trong cùng một hệ thống; tự động gắn nhãn phân loại tài khoản sở hữu cho từng Fanpage.
- **Kho Nguồn Token (Token Vault):** Lưu trữ, quản lý, đổi token mới (`Renew`) và kiểm tra chi tiết quyền hạn token (`🔍 Soi Token`) thông qua Meta Graph API Debugger.

### 2. 💬 Hộp Thư Hội Thoại 3 Cột Đa Phương Tiện & Mini CRM Bán Hàng (Pancake.vn Style)
- **Chuẩn Desktop App 3 cột:** Hộp thư tin nhắn (340px) | Khung Chat Trực Tiếp (Flex) | Mini CRM Sidebar (320px).
- **Thẻ phân loại khách hàng (Customer Tags):** Có sẵn 6 thẻ tiêu chuẩn (`Khách VIP`, `Đã Chốt Đơn`, `Cần Tư Vấn`, `Đã Cọc`, `Khách Bom Hàng`, `Đang Phân Vân`) hiển thị huy hiệu màu ngay trên danh sách hội thoại; hỗ trợ tạo nhãn tùy biến không giới hạn.
- **Ghi chú nội bộ nhân viên (Internal Notes):** Lưu lịch sử lưu ý của nhân viên theo dòng thời gian, bảo mật 100% (chỉ nhân viên nhìn thấy, ẩn hoàn toàn với khách hàng Facebook).
- **Tự động bắt số điện thoại (Auto-Phone Detection):** Tự động phát hiện số điện thoại trong tin nhắn khách gửi và cung cấp nút lưu 1-click vào hồ sơ CRM kèm nút gọi điện nhanh `📞`.
- **Tìm kiếm thông minh đa trường:** Tìm nhanh theo tên khách, từ khóa tin nhắn, số điện thoại (`09xx`), địa chỉ giao hàng và tên thẻ nhãn phân loại.
- **Đa phương tiện cao cấp:** Hỗ trợ gửi/nhận tin nhắn văn bản, hình ảnh, Video clip, tin nhắn âm thanh (**Voice Notes**), kéo thả tệp trực tiếp và thanh mẫu câu trả lời nhanh (**Quick Replies**).
- **Đồng bộ hai chiều trạng thái Seen/Unseen:** Tự động gửi `mark_seen` về Meta Graph API khi nhân viên mở xem hội thoại, đồng bộ thời gian thực watermark khi khách đọc tin nhắn.

### 3. 🚨 Hệ Thống Báo Thức Xuyên Đêm & Báo Động Khẩn Cấp Đa Kênh
- **Loa máy tính Web Audio (Compressor Booster >100%):** Kích hoạt chuông báo đanh to liên tục, tự động đẩy mức âm lượng vượt ngưỡng phần cứng để đánh thức nhân viên trực ca đêm khi có tin nhắn mới.
- **Báo động an toàn (Safety Alarm):** Tự động quét và kích hoạt còi báo động khẩn cấp nếu có tin nhắn của khách bị bỏ quên quá 10 phút chưa ai phản hồi.
- **Cuộc gọi viễn thông trực tiếp vào SIM di động (Twilio VoIP):** Tự động gọi điện đổ chuông vào số SIM điện thoại thật khi có tin nhắn ban đêm.
- **Chuông báo thức di động miễn phí qua app ntfy (iOS / Android):** Gửi thông báo kèm Ringtone ngân vang liên tục tới điện thoại hoàn toàn miễn phí mà không cần máy chủ riêng.
- **Cảnh báo đa nền tảng:** Tích hợp đồng thời Telegram Bot Alert và Discord Webhook Alert.

### 4. ⏰ Lịch Phân Ca Trực Khóa Cứng Giờ Việt Nam (GMT+7)
- **Linh hoạt ca kíp:** Thiết lập ca sáng (07:00 – 15:00), ca chiều, ca đêm (23:00 – 07:00), hoặc trực 24/7. Hỗ trợ nhiều nhân viên cùng trực chung một Fanpage trong một khung giờ.
- **Khóa cố định múi giờ vận hành:** Thuật toán phân ca độc lập vị trí địa lý, luôn đối chiếu theo múi giờ `Asia/Ho_Chi_Minh` (GMT+7) bất kể máy tính hoặc máy chủ đang đặt tại Mỹ, Nhật hay Châu Âu.

### 5. 🛡️ Tự Động Thích Ứng Môi Trường VPN Đa Quốc Gia
- **Tự động đi theo phần mềm VPN trên máy tính:** Bạn có thể bật/tắt hoặc đổi server VPN (Mỹ, Nhật, Singapore, Châu Âu...) trên phần mềm máy tính (ExpressVPN, NordVPN, WARP, v2ray...) như bình thường mà **không cần cấu hình gì trên Tool**.
- **DNS Dual-Stack `ipv4first`:** Triệt tiêu hoàn toàn lỗi treo timeout 10–30 giây do adapter mạng VPN làm rơi gói tin IPv6 trên Windows.
- **HTTP Resilient Engine (`fetchWithRetry`):** Tự động thử lại với exponential backoff khi gặp sự cố chập chờn mạng lúc đổi máy chủ VPN.
- **Cloudflare Tunnel Watchdog:** Luồng giám sát tự động kiểm tra và làm mới kết nối Tunnel qua trạm Cloudflare Edge gần nhất chỉ trong 20 giây khi phát hiện IP máy tính thay đổi.

---

## 🚀 Hướng Dẫn Khởi Động Nhanh (1-Click Run)

### Cách 1: Dành cho máy tính Windows (Khuyên dùng - 1 Click 100%)
*Phù hợp cho cả máy tính mới tinh chưa từng cài đặt bất kỳ phần mềm hay môi trường lập trình nào.*

1. Tải toàn bộ mã nguồn về máy (hoặc dùng lệnh `git clone`).
2. Nhấp đúp chuột vào tệp:
   ```cmd
   khoi_dong.bat
   ```
3. **Bộ cài tự động (`setup_and_start.ps1`) sẽ tự thực hiện từ A-Z:**
   - Kiểm tra Node.js: Nếu máy chưa có, tự động tải bản **Node.js Portable LTS v20** chính thức từ `nodejs.org`.
   - Kiểm tra Cloudflare Tunnel: Tự động tải bản nhị phân `cloudflared.exe` mới nhất từ Cloudflare GitHub.
   - Cài đặt thư viện phụ thuộc (`npm install`).
   - Khởi chạy server và tự động mở trình duyệt web tại địa chỉ: `http://localhost:3000`.

---

### Cách 2: Dành cho lập trình viên (Chạy bằng lệnh thủ công)

```bash
# 1. Clone mã nguồn về máy
git clone https://github.com/phongvipxh/fb-multi-hub.git
cd fb-multi-hub

# 2. Tạo tệp cấu hình môi trường
cp .env.example .env

# 3. Cài đặt các gói thư viện
npm install

# 4. Khởi động ứng dụng
npm start
```
Mở trình duyệt truy cập: **`http://localhost:3000`**

---

### Cách 3: Dành cho macOS / Linux / Cloud VPS

```bash
chmod +x start.sh
./start.sh
```

---

## 📋 Hướng Dẫn Cấu Hình Meta Developer (Để Nhận Tin Nhắn Trực Tiếp)

Hệ thống tự động kích hoạt **Cloudflare Tunnel** mỗi khi khởi động để cấp URL công khai HTTPS miễn phí không cần cấu hình Router (NAT Port Forwarding).

1. Mở giao diện Tool &rarr; Vào tab **🌐 Meta Webhook & Cloud**.
2. Nhấp **Sao chép** tại ô *URL Webhook Công Khai* (dạng `https://xxxx.trycloudflare.com/webhook`) và *Verify Token*.
3. Truy cập [Meta for Developers](https://developers.facebook.com/) &rarr; Chọn App của bạn:
   - **Cấu hình Webhook:** Chọn đối tượng **Page** &rarr; Bấm **Edit Subscription** &rarr; Dán *Webhook URL* và *Verify Token* &rarr; Nhấn **Verify and Save**.
   - **Đăng ký sự kiện:** Tìm và bấm **Subscribe** cho 2 trường: `messages` và `messaging_postbacks`.
4. **Cấu hình Đăng nhập Facebook (Facebook Login):**
   - Vào mục **Facebook Login for Business** &rarr; **Settings**.
   - Tại mục **Valid OAuth Redirect URIs**, dán cả 2 URL sau:
     - `http://localhost:3000/auth/facebook/callback`
     - `https://xxxx.trycloudflare.com/auth/facebook/callback` *(URL Tunnel hiện tại của bạn)*
5. **Chế độ Live (Công khai):** Đổi App Meta từ chế độ *In Development* sang **Live** để bất kỳ khách hàng nào nhắn tin vào Fanpage thì hệ thống cũng nhận được thông báo ngay lập tức.

---

## 🧪 Kiểm Thử Cơ Học Tự Động (Mechanical Gate)

Dự án tuân thủ kỷ luật kỹ thuật khắt khe, tích hợp bộ kiểm thử toàn diện **21 bài test hệ thống** bao phủ từ CSDL SQLite, Đa tài khoản OAuth 2.0, Webhook Echo, Đa phương tiện, Báo thức SIM VoIP, Đồng bộ giờ Meta, Khả năng thích ứng VPN đến Mini CRM & Thẻ phân loại khách hàng:

```bash
npm test
```
**Kết quả đầu ra tiêu chuẩn (Exit Code 0):**
```text
=============================================================
🎉 TẤT CẢ 21 BÀI TEST HỆ THỐNG, FACEBOOK OAUTH, VPN ĐA QUỐC GIA & MINI CRM ĐỀU ĐẠT (EXIT 0)!
=============================================================
```

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
fb-multi-hub/
├── bin/                          # Thư mục chứa binaries runtime (cloudflared, node portable)
├── data/                         # Thư mục cơ sở dữ liệu SQLite cục bộ
│   ├── supabase_schema.sql       # Kịch bản DDL chuẩn bị sẵn cho Cloud Supabase PostgreSQL
│   └── .gitkeep
├── public/                       # Giao diện Frontend Single Page Application (HTML/CSS/JS)
│   ├── index.html                # Giao diện chính 7 phân hệ
│   ├── app.js                    # Logic Frontend & Web Audio Engine
│   └── style.css                 # Hệ thống theme Dark Mode công thái học
├── src/                          # Mã nguồn Backend Node.js
│   ├── database/
│   │   └── db.js                 # SQLite Database Engine & Repository Pattern
│   ├── services/
│   │   ├── facebookService.js    # Graph API Client, OAuth 2.0 & Resilient Retry Engine
│   │   ├── alarmService.js       # Bộ điều phối chuông báo, ntfy & Twilio VoIP
│   │   └── telegramService.js    # Telegram Bot Alert Notification
│   └── server.js                 # Express Server, SSE Stream, Tunnel Watchdog & Routing
├── test/
│   └── system.test.js            # 20 Test Suites kiểm thử tự động toàn diện E2E
├── .env.example                  # File mẫu cấu hình biến môi trường
├── .gitignore                    # Bộ lọc bảo mật chặn lộ database và token
├── khoi_dong.bat                 # Trình khởi động 1-click tự động cho Windows
├── setup_and_start.ps1           # Script kiểm tra & cài đặt môi trường tự động
├── start.sh                      # Trình khởi động cho macOS / Linux
├── package.json                  # Metadata dự án & dependencies
└── README.md                     # Tài liệu hướng dẫn toàn diện
```

---

## 📜 Giấy Phép (License)

Phần mềm được phát hành theo giấy phép **[MIT License](LICENSE)**. Bạn hoàn toàn có quyền sử dụng, sửa đổi, thương mại hóa hoặc tự triển khai riêng tư theo nhu cầu của mình.
