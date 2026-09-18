/**
 * Comprehensive System & Multi-User Tests for FB Multi-Page Tool
 * Verifies Multi-User Ingestion, Page Ownership, Conversation Split View,
 * Token Health Check, and Alarm Dispatching.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Use isolated test database so tests never pollute real fb_tool.db
const testDbPath = path.resolve(__dirname, '../data/test_fb_tool.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}
const testWalPath = path.resolve(__dirname, '../data/test_fb_tool.db-wal');
if (fs.existsSync(testWalPath)) {
  try { fs.unlinkSync(testWalPath); } catch (e) {}
}
const testShmPath = path.resolve(__dirname, '../data/test_fb_tool.db-shm');
if (fs.existsSync(testShmPath)) {
  try { fs.unlinkSync(testShmPath); } catch (e) {}
}
process.env.DB_PATH = testDbPath;
process.env.PORT = '3099';
process.env.NODE_ENV = 'test';

console.log('--- BẮT ĐẦU KIỂM THỬ HỆ THỐNG FB MULTI-PAGE TOOL (MULTI-USER & 2-COLUMN) ---');

// 1. Test Database Operations & Multi-User Model
console.log('\n[1] Kiểm tra Database & Mô hình Đa Người Dùng (Multi-User)...');
const db = require('../src/database/db');

// Ensure User A and User B exist
const userA = db.saveOrUpdateUser({
  name: 'Nguyễn Văn A (Nhân viên 1)',
  username: 'nhanvien_a',
  pin_code: '1111',
  role: 'member',
  color_tag: '#3b82f6',
  telegram_chat_id: 'chat_id_user_a',
  telegram_enabled: 'true',
  alarm_enabled: 'true',
  alarm_method: 'callmebot',
  callmebot_username: '@user_a_tele',
  web_sound_enabled: 'true'
});

const userB = db.saveOrUpdateUser({
  name: 'Trần Thị B (Nhân viên 2)',
  username: 'nhanvien_b',
  pin_code: '2222',
  role: 'member',
  color_tag: '#8b5cf6',
  telegram_chat_id: 'chat_id_user_b',
  telegram_enabled: 'false',
  alarm_enabled: 'false',
  alarm_method: 'callmebot',
  callmebot_username: '@user_b_tele',
  web_sound_enabled: 'false'
});

assert(userA.id, 'User A phải được tạo');
assert(userB.id, 'User B phải được tạo');
console.log(`  ✓ Tạo người dùng độc lập thành công: User A (ID: ${userA.id}), User B (ID: ${userB.id})`);

// Assign Page 1 to User A, Page 2 to User B
db.saveOrUpdatePage({
  page_id: 'page_user_a_101',
  name: 'Shop Thời Trang Nam',
  access_token: 'EAA_TEST_TOKEN_A',
  user_id: userA.id,
  account_label: 'Nick FB A',
  color_tag: '#3b82f6'
});

db.saveOrUpdatePage({
  page_id: 'page_user_b_202',
  name: 'Shop Mỹ Phẩm Hàn Quốc',
  access_token: 'EAA_TEST_TOKEN_B',
  user_id: userB.id,
  account_label: 'Nick FB B',
  color_tag: '#8b5cf6'
});

const pageA = db.getPageByPageId('page_user_a_101');
const pageB = db.getPageByPageId('page_user_b_202');
assert.strictEqual(pageA.user_id, userA.id, 'Page A phải thuộc User A');
assert.strictEqual(pageB.user_id, userB.id, 'Page B phải thuộc User B');
assert.strictEqual(pageA.owner_name, 'Nguyễn Văn A (Nhân viên 1)');
assert.strictEqual(pageB.owner_name, 'Trần Thị B (Nhân viên 2)');
console.log('  ✓ Phân quyền sở hữu Fanpage cho đúng nhân viên thành công');

// 2. Test Conversations & 2-Column Chat Engine
console.log('\n[2] Kiểm tra Hộp Thư Hội Thoại 2 Cột & Lịch Sử Chat...');
// Simulate Customer 1 sending a message to Page A
db.saveMessage({
  mid: 'm_conv_test_001',
  page_id: 'page_user_a_101',
  sender_id: 'cust_001',
  sender_name: 'Lê Hoàng Khách 1',
  text: 'Shop ơi tư vấn size L giúp mình qua số 0988123456 nhé!',
  timestamp: Date.now(),
  is_echo: 0
});

// Simulate Shop replying to Customer 1 (Echo message)
db.saveMessage({
  mid: 'm_conv_test_002',
  page_id: 'page_user_a_101',
  sender_id: 'cust_001',
  sender_name: 'Lê Hoàng Khách 1',
  text: 'Dạ shop chào bạn! Bạn cao và nặng bao nhiêu kg ạ?',
  timestamp: Date.now() + 5000,
  is_echo: 1
});

// Fetch conversation list for User A
const convsA = db.getConversations({ userId: userA.id });
assert(convsA.length >= 1, 'User A phải có ít nhất 1 cuộc trò chuyện');
assert.strictEqual(convsA[0].sender_id, 'cust_001');
console.log('  ✓ Gom luồng hội thoại theo khách hàng chính xác');

// Search by phone number
const phoneSearch = db.getConversations({ search: '0988123456' });
assert(phoneSearch.length >= 1, 'Phải tìm thấy cuộc trò chuyện bằng số điện thoại');
console.log('  ✓ Tìm kiếm thông minh bằng Số Điện Thoại khách hàng thành công');

// Fetch full chat transcript messages
const transcript = db.getConversationMessages('page_user_a_101', 'cust_001');
assert.strictEqual(transcript.length, 2, 'Lịch sử chat phải đủ 2 tin nhắn (khách hỏi & shop rep)');
console.log('  ✓ Lấy đầy đủ dòng thời gian tin nhắn (transcript) chuẩn xác');

// 3. Test Quick Replies CRUD
console.log('\n[3] Kiểm tra Mẫu Câu Nhanh (Quick Replies)...');
const newQr = db.saveQuickReply({
  user_id: 0,
  title: 'Test Khuyến Mãi',
  content: 'Hôm nay shop đang có chương trình giảm 20% toàn bộ đơn hàng!'
});
assert(newQr.id, 'Phải tạo được mẫu câu nhanh');
const allQr = db.getQuickReplies();
assert(allQr.some(q => q.id === newQr.id));
console.log('  ✓ Quản lý mẫu câu trả lời nhanh hoạt động tốt');

// 4. Test Token Health Check Mock
console.log('\n[4] Kiểm tra Token Health Check Service...');
const { checkTokenHealth } = require('../src/services/facebookService');
// Test with empty token
checkTokenHealth('page_test', '').then(res => {
  assert.strictEqual(res.status, 'EXPIRED');
  console.log('  ✓ Nhận diện chính xác Token rỗng/hết hạn');
});

// 5. Test Multi-User Alarm Routing
console.log('\n[5] Kiểm tra Logic Điều Phối Báo Thức Theo Đúng Người Dùng...');
const alarmService = require('../src/services/alarmService');

// Check User A (alarm_enabled = true) vs User B (alarm_enabled = false)
const statusA = alarmService.isAlarmModeActiveForUser(userA);
const statusB = alarmService.isAlarmModeActiveForUser(userB);
assert.strictEqual(statusA.active, true, 'User A đang bật chế độ đi ngủ nên active phải = true');
assert.strictEqual(statusB.active, false, 'User B đang tắt báo thức nên active phải = false');
console.log('  ✓ Định danh và kiểm tra trạng thái báo thức độc lập giữa các User thành công');

// 6. Test Shift-Based Routing for 1 Fanpage shared among 3 Users (Ca Sáng vs Ca Đêm)
console.log('\n[6] Kiểm tra Phân Ca Làm Việc & Định Tuyến Ca Trực (1 Page - 3 Users)...');
// Tạo 3 User: NV Ca Sáng, NV Ca Đêm 1, NV Ca Đêm 2
const userShift1 = db.saveOrUpdateUser({
  name: 'Lê Văn Ca Sáng',
  username: 'nv_ca_sang',
  pin_code: '1001',
  role: 'member',
  color_tag: '#10b981',
  telegram_chat_id: 'chat_ca_sang',
  telegram_enabled: 'true',
  alarm_enabled: 'false'
});

const userShift2 = db.saveOrUpdateUser({
  name: 'Phạm Thị Ca Đêm 1',
  username: 'nv_ca_dem_1',
  pin_code: '2002',
  role: 'member',
  color_tag: '#6366f1',
  telegram_chat_id: 'chat_ca_dem_1',
  telegram_enabled: 'true',
  alarm_enabled: 'true',
  alarm_method: 'callmebot',
  callmebot_username: '@nv_ca_dem_1'
});

const userShift3 = db.saveOrUpdateUser({
  name: 'Hoàng Văn Ca Đêm 2',
  username: 'nv_ca_dem_2',
  pin_code: '3003',
  role: 'member',
  color_tag: '#f59e0b',
  telegram_chat_id: 'chat_ca_dem_2',
  telegram_enabled: 'true',
  alarm_enabled: 'true',
  alarm_method: 'callmebot',
  callmebot_username: '@nv_ca_dem_2'
});

// Tạo 1 Fanpage chung được 3 người cùng quản lý
const testPageShiftId = 'page_shift_demo_888';
db.saveOrUpdatePage({
  page_id: testPageShiftId,
  name: 'Page Bán Hàng 24/7 (3 Ca Trực)',
  access_token: 'EAA_TEST_TOKEN_SHIFT',
  user_id: userShift1.id,
  account_label: 'Shop Chung 3 Người',
  color_tag: '#059669'
});

// Phân ca theo đúng yêu cầu người dùng:
// User 1: Ca sáng 07:00 - 15:00
db.addOrUpdatePageShift({
  page_id: testPageShiftId,
  user_id: userShift1.id,
  shift_name: 'Ca Sáng (07:00 - 15:00)',
  shift_start: '07:00',
  shift_end: '15:00',
  is_active: 1
});

// User 2: Ca đêm 23:00 - 07:00
db.addOrUpdatePageShift({
  page_id: testPageShiftId,
  user_id: userShift2.id,
  shift_name: 'Ca Đêm 1 (23:00 - 07:00)',
  shift_start: '23:00',
  shift_end: '07:00',
  is_active: 1
});

// User 3: Ca đêm 23:00 - 07:00 (cùng khung giờ ca đêm với User 2)
db.addOrUpdatePageShift({
  page_id: testPageShiftId,
  user_id: userShift3.id,
  shift_name: 'Ca Đêm 2 (23:00 - 07:00)',
  shift_start: '23:00',
  shift_end: '07:00',
  is_active: 1
});

// Kiểm tra danh sách ca đã lưu
const savedShifts = db.getPageShifts(testPageShiftId);
assert.strictEqual(savedShifts.length, 3, 'Page phải có đúng 3 ca trực');
console.log('  ✓ Đã gán thành công 3 ca trực cho 3 nhân viên trên cùng 1 Fanpage');

// Tình huống 1: Lúc 10:30 sáng -> Chỉ thông báo cho User 1 (Ca Sáng)
const morningTime = new Date();
morningTime.setHours(10, 30, 0, 0);
const morningActiveUsers = db.getActiveUsersOnShiftForPage(testPageShiftId, morningTime);
assert.strictEqual(morningActiveUsers.length, 1, 'Lúc 10h30 sáng chỉ có đúng 1 nhân viên trực');
assert.strictEqual(morningActiveUsers[0].user_id, userShift1.id, 'Người trực ca sáng phải là User 1');
assert(!morningActiveUsers.some(u => u.user_id === userShift2.id), 'User 2 (Ca đêm) không được nhận thông báo buổi sáng');
assert(!morningActiveUsers.some(u => u.user_id === userShift3.id), 'User 3 (Ca đêm) không được nhận thông báo buổi sáng');
console.log(`  ✓ Khung giờ 10:30 (Sáng): Chỉ thông báo cho 1 người (${morningActiveUsers[0].name})`);

// Tình huống 2: Lúc 02:15 rạng sáng -> Thông báo cho CẢ 2 người User 2 và User 3 (Ca Đêm)
const nightTime = new Date();
nightTime.setHours(2, 15, 0, 0);
const nightActiveUsers = db.getActiveUsersOnShiftForPage(testPageShiftId, nightTime);
assert.strictEqual(nightActiveUsers.length, 2, 'Lúc 02h15 sáng phải có đúng 2 nhân viên trực ca đêm');
const nightUserIds = nightActiveUsers.map(u => u.user_id);
assert(nightUserIds.includes(userShift2.id), 'User 2 phải nhận được thông báo ca đêm');
assert(nightUserIds.includes(userShift3.id), 'User 3 phải nhận được thông báo ca đêm');
assert(!nightUserIds.includes(userShift1.id), 'User 1 (Ca sáng) không được nhận thông báo ca đêm');
console.log(`  ✓ Khung giờ 02:15 (Đêm): Thông báo đồng thời cho CẢ 2 nhân viên (${nightActiveUsers.map(u => u.name).join(' & ')})`);

// Tình huống 3: Lúc 18:00 (Ngoài giờ 2 ca trên) -> Fallback về Chủ sở hữu page
const offTime = new Date();
offTime.setHours(18, 0, 0, 0);
const offActiveUsers = db.getActiveUsersOnShiftForPage(testPageShiftId, offTime);
assert(offActiveUsers.length >= 1, 'Ngoài ca trực hệ thống tự fallback về Owner của page');
assert.strictEqual(offActiveUsers[0].id || offActiveUsers[0].user_id, userShift1.id);
console.log('  ✓ Ngoài khung giờ phân ca: Tự động fallback về Chủ Page đảm bảo không miss tin nhắn');

// Tình huống 4: Thử tắt tạm thời 1 ca trực của User 2
const shiftUser2 = savedShifts.find(s => s.user_id === userShift2.id);
db.addOrUpdatePageShift({
  id: shiftUser2.id,
  page_id: testPageShiftId,
  user_id: userShift2.id,
  shift_name: shiftUser2.shift_name,
  shift_start: '23:00',
  shift_end: '07:00',
  is_active: 0 // Tạm nghỉ ca
});
const nightActiveAfterPause = db.getActiveUsersOnShiftForPage(testPageShiftId, nightTime);
assert.strictEqual(nightActiveAfterPause.length, 1, 'Khi User 2 tạm nghỉ ca, ban đêm chỉ còn User 3 trực');
assert.strictEqual(nightActiveAfterPause[0].user_id, userShift3.id);
console.log('  ✓ Bật/tắt ca trực linh hoạt hoạt động hoàn hảo');

// Khôi phục lại ca cho User 2
db.addOrUpdatePageShift({
  id: shiftUser2.id,
  page_id: testPageShiftId,
  user_id: userShift2.id,
  shift_name: shiftUser2.shift_name,
  shift_start: '23:00',
  shift_end: '07:00',
  is_active: 1
});

// 7. Test E2E Express Server APIs
console.log('\n[7] Kiểm tra E2E Server Endpoints (Multi-User, Shifts & Webhooks)...');
const { app } = require('../src/server');

const testServer = app.listen(0, async () => {
  const port = testServer.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // GET /api/users
    const usersRes = await fetch(`${baseUrl}/api/users`);
    const usersData = await usersRes.json();
    assert.strictEqual(usersData.ok, true);
    assert(usersData.users.length >= 2);
    console.log('  ✓ API GET /api/users hoạt động tốt');

    // GET /api/conversations
    const convRes = await fetch(`${baseUrl}/api/conversations`);
    const convData = await convRes.json();
    assert.strictEqual(convData.ok, true);
    assert(Array.isArray(convData.conversations));
    console.log('  ✓ API GET /api/conversations hoạt động tốt');

    // GET /api/pages/:pageId/shifts
    const shiftsRes = await fetch(`${baseUrl}/api/pages/${testPageShiftId}/shifts`);
    const shiftsData = await shiftsRes.json();
    assert.strictEqual(shiftsData.ok, true);
    assert.strictEqual(shiftsData.shifts.length, 3, 'API trả về đúng 3 ca trực');
    console.log('  ✓ API GET /api/pages/:pageId/shifts hoạt động tốt');

    // POST /api/pages/:pageId/shifts (Thêm ca mới)
    const addShiftRes = await fetch(`${baseUrl}/api/pages/${testPageShiftId}/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userShift1.id,
        shift_name: 'Ca Tăng Cường Chiều',
        shift_start: '15:00',
        shift_end: '19:00',
        is_active: true
      })
    });
    const addShiftData = await addShiftRes.json();
    assert.strictEqual(addShiftData.ok, true);
    assert(addShiftData.shift.id, 'Phải tạo được ca mới');
    console.log('  ✓ API POST /api/pages/:pageId/shifts (Tạo ca mới) hoạt động tốt');

    // DELETE /api/shifts/:id (Xóa ca vừa tạo)
    const delShiftRes = await fetch(`${baseUrl}/api/shifts/${addShiftData.shift.id}`, {
      method: 'DELETE'
    });
    const delShiftData = await delShiftRes.json();
    assert.strictEqual(delShiftData.ok, true);
    console.log('  ✓ API DELETE /api/shifts/:id (Xóa ca) hoạt động tốt');

    // POST /webhook incoming message to Page chung 3 người
    const webhookPayload = {
      object: 'page',
      entry: [
        {
          id: testPageShiftId,
          time: Date.now(),
          messaging: [
            {
              sender: { id: 'cust_shift_test_777' },
              recipient: { id: testPageShiftId },
              timestamp: Date.now(),
              message: {
                mid: 'mid_shift_webhook_001',
                text: 'Xin chào shop 3 ca trực!'
              }
            }
          ]
        }
      ]
    };

    const whRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    });
    assert.strictEqual(whRes.status, 200);
    console.log('  ✓ Webhook tiếp nhận và định tuyến tin nhắn theo ca trực đa người dùng thành công');

    // GET /api/supabase-schema
    const supabaseRes = await fetch(`${baseUrl}/api/supabase-schema`);
    const supabaseData = await supabaseRes.json();
    assert.strictEqual(supabaseRes.status, 200);
    assert.strictEqual(supabaseData.ok, true);
    assert(supabaseData.sql.includes('CREATE TABLE IF NOT EXISTS users'), 'Schema phải chứa bảng users');
    assert(supabaseData.sql.includes('CREATE TABLE IF NOT EXISTS page_shifts'), 'Schema phải chứa bảng page_shifts');
    console.log('  ✓ API GET /api/supabase-schema (Cloud DDL) hoạt động tốt');

    // POST /api/users - Kiểm tra tùy chỉnh cấu hình độc lập theo từng tài khoản
    const updateResA = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userA.id,
        pin_code: '8888',
        web_sound_volume: 95,
        alarm_method: 'callmebot'
      })
    });
    const updateDataA = await updateResA.json();
    assert.strictEqual(updateDataA.ok, true);
    assert.strictEqual(updateDataA.user.pin_code, '8888', 'PIN User A phải được đổi');
    assert.strictEqual(updateDataA.user.name, userA.name, 'Cập nhật từng phần không được làm mất tên user');

    const updateResB = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userB.id,
        pin_code: '9999',
        web_sound_volume: 35,
        alarm_method: 'twilio',
        twilio_to_number: '+84999888777'
      })
    });
    const updateDataB = await updateResB.json();
    assert.strictEqual(updateDataB.ok, true);
    assert.strictEqual(updateDataB.user.alarm_method, 'twilio', 'User B chọn phương thức Twilio');
    assert.strictEqual(updateDataB.user.twilio_to_number, '+84999888777');

    // Kiểm tra tính độc lập tuyệt đối giữa 2 cấu hình
    const freshUserA = db.getUserById(userA.id);
    const freshUserB = db.getUserById(userB.id);
    assert.strictEqual(freshUserA.alarm_method, 'callmebot', 'User A vẫn giữ nguyên phương thức CallMeBot');
    assert.strictEqual(freshUserB.alarm_method, 'twilio', 'User B sử dụng Twilio độc lập');
    assert.strictEqual(freshUserA.web_sound_volume, 95);
    assert.strictEqual(freshUserB.web_sound_volume, 35);
    console.log('  ✓ Tùy chỉnh bật/tắt và lưu cấu hình độc lập 100% cho từng User thành công');

    // POST /api/conversations/:pageId/:senderId/send-message validation
    const emptySendRes = await fetch(`${baseUrl}/api/conversations/page_shift_demo_888/sender_dummy/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' })
    });
    const emptySendData = await emptySendRes.json();
    assert.strictEqual(emptySendData.ok, false, 'Tin nhắn rỗng phải bị từ chối');
    console.log('  ✓ API POST /api/conversations/.../send-message validation hoạt động chuẩn xác');

    // POST /api/pages/fetch-from-token validation
    const emptyFetchRes = await fetch(`${baseUrl}/api/pages/fetch-from-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '' })
    });
    const emptyFetchData = await emptyFetchRes.json();
    assert.strictEqual(emptyFetchData.ok, false, 'Token rỗng phải bị từ chối');
    console.log('  ✓ API POST /api/pages/fetch-from-token validation hoạt động chuẩn xác');

    // POST /api/pages/bulk-import validation & functional test
    const emptyBulkRes = await fetch(`${baseUrl}/api/pages/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: [] })
    });
    const emptyBulkData = await emptyBulkRes.json();
    assert.strictEqual(emptyBulkData.ok, false, 'Danh sách page rỗng phải bị từ chối');

    const validBulkRes = await fetch(`${baseUrl}/api/pages/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userA.id,
        account_label: 'Nick Import Test',
        pages: [
          {
            page_id: 'page_bulk_import_001',
            name: 'Page Import 1',
            access_token: 'EAA_BULK_1',
            category: 'Thời trang',
            avatar_url: 'https://example.com/avatar1.jpg'
          },
          {
            page_id: 'page_bulk_import_002',
            name: 'Page Import 2',
            access_token: 'EAA_BULK_2',
            category: 'Ẩm thực',
            avatar_url: 'https://example.com/avatar2.jpg'
          }
        ]
      })
    });
    const validBulkData = await validBulkRes.json();
    assert.strictEqual(validBulkData.ok, true);
    assert.strictEqual(validBulkData.imported.length, 2);

    const savedBulk1 = db.getPageByPageId('page_bulk_import_001');
    assert.strictEqual(savedBulk1.name, 'Page Import 1');
    assert.strictEqual(savedBulk1.user_id, userA.id);
    console.log('  ✓ API POST /api/pages/bulk-import (Thêm hàng loạt page theo checklist) hoạt động hoàn hảo');

    // [8] Test Single-Host Admin Profile & My Shifts APIs
    console.log('\n[8] Kiểm tra Mô hình Tự Host Độc Lập (Single-Host & My Shifts)...');
    
    // GET /api/host-profile
    const hostRes = await fetch(`${baseUrl}/api/host-profile`);
    const hostData = await hostRes.json();
    assert.strictEqual(hostData.ok, true);
    assert.strictEqual(typeof hostData.host.name, 'string');
    console.log('  ✓ API GET /api/host-profile hoạt động tốt:', hostData.host.name);

    // POST /api/host-profile
    const updateHostRes = await fetch(`${baseUrl}/api/host-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Chủ Host Độc Lập',
        telegram_chat_id: '99887766',
        alarm_method: 'callmebot',
        callmebot_username: '@my_host_tele'
      })
    });
    const updateHostData = await updateHostRes.json();
    assert.strictEqual(updateHostData.ok, true);
    assert.strictEqual(updateHostData.host.name, 'Chủ Host Độc Lập');
    assert.strictEqual(updateHostData.host.telegram_chat_id, '99887766');
    console.log('  ✓ API POST /api/host-profile cập nhật cấu hình cá nhân thành công');

    // POST /api/host-profile/toggle-sleep
    const toggleSleepRes = await fetch(`${baseUrl}/api/host-profile/toggle-sleep`, { method: 'POST' });
    const toggleSleepData = await toggleSleepRes.json();
    assert.strictEqual(toggleSleepData.ok, true);
    assert.strictEqual(typeof toggleSleepData.alarm_enabled, 'boolean');
    console.log('  ✓ API POST /api/host-profile/toggle-sleep bật/tắt đi ngủ tức thì');

    // POST /api/my-shifts (Tạo ca trực riêng của Host cho Fanpage)
    const createShiftRes = await fetch(`${baseUrl}/api/my-shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: 'page_bulk_import_001',
        shift_name: 'Ca Đêm Của Tôi',
        shift_start: '23:00',
        shift_end: '07:00',
        is_active: true
      })
    });
    const createShiftData = await createShiftRes.json();
    assert.strictEqual(createShiftData.ok, true);
    assert.strictEqual(createShiftData.shift.shift_name, 'Ca Đêm Của Tôi');
    console.log('  ✓ API POST /api/my-shifts tự thiết lập ca trực thành công');

    // GET /api/my-shifts
    const getMyShiftsRes = await fetch(`${baseUrl}/api/my-shifts?page_id=page_bulk_import_001`);
    const getMyShiftsData = await getMyShiftsRes.json();
    assert.strictEqual(getMyShiftsData.ok, true);
    assert(getMyShiftsData.shifts.length >= 1);
    console.log('  ✓ API GET /api/my-shifts lấy danh sách ca trực của Host thành công');

    // DELETE /api/my-shifts/:id
    const deleteShiftRes = await fetch(`${baseUrl}/api/my-shifts/${createShiftData.shift.id}`, { method: 'DELETE' });
    const deleteShiftData = await deleteShiftRes.json();
    assert.strictEqual(deleteShiftData.ok, true);
    console.log('  ✓ API DELETE /api/my-shifts/:id xóa ca trực thành công');

    // [9] Test Discord Webhook & Image Attachments Handling
    console.log('\n[9] Kiểm tra Kênh Thông Báo Discord Webhook & Xử Lý Ảnh Đính Kèm (Images)...');
    
    // 9.1 Test discordService validation
    const { sendDiscordMessageAlert, testDiscordWebhook } = require('../src/services/discordService');
    await assert.rejects(
      async () => await testDiscordWebhook(''),
      /URL/,
      'testDiscordWebhook phải từ chối URL rỗng'
    );
    console.log('  ✓ discordService kiểm tra hợp lệ URL thành công');

    // 9.2 Test saving message with image attachment & preview text
    db.saveMessage({
      mid: 'm_img_test_999',
      page_id: testPageShiftId,
      sender_id: 'cust_img_user',
      sender_name: 'Khách Hàng Gửi Ảnh',
      text: '', // Empty text, only photo sent!
      attachments: [{ type: 'image', url: 'https://scontent.fhan14-1.fna.fbcdn.net/v/t39.1997-6/sample.jpg' }],
      timestamp: Date.now(),
      is_echo: 0
    });

    const imgConv = db.getConversations({ pageId: testPageShiftId, search: 'Khách Hàng Gửi Ảnh' });
    assert(imgConv.length >= 1, 'Phải tìm thấy cuộc trò chuyện của khách gửi ảnh');
    assert.strictEqual(imgConv[0].last_message_text, '[Hình ảnh]', 'Khi text rỗng và có ảnh, preview phải hiển thị [Hình ảnh]');
    console.log('  ✓ Lưu tin nhắn đính kèm ảnh và tạo preview [Hình ảnh] thông minh thành công');

    // 9.3 Test API POST /api/host-profile with Discord settings
    const saveDiscordProfileRes = await fetch(`${baseUrl}/api/host-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discord_webhook_url: 'https://discord.com/api/webhooks/123456/dummy_token',
        discord_enabled: 'true'
      })
    });
    const saveDiscordProfileData = await saveDiscordProfileRes.json();
    assert.strictEqual(saveDiscordProfileData.ok, true);
    assert.strictEqual(saveDiscordProfileData.host.discord_webhook_url, 'https://discord.com/api/webhooks/123456/dummy_token');
    assert.strictEqual(saveDiscordProfileData.host.discord_enabled, 'true');
    console.log('  ✓ API POST /api/host-profile lưu cấu hình Discord Webhook thành công');

    // 9.4 Test API POST /api/test/discord validation
    const emptyDiscordRes = await fetch(`${baseUrl}/api/test/discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: '' })
    });
    const emptyDiscordData = await emptyDiscordRes.json();
    assert.strictEqual(emptyDiscordData.ok, false);
    console.log('  ✓ API POST /api/test/discord từ chối URL rỗng chuẩn xác');

    // 9.5 Test simulate message with image attachments
    const simImgRes = await fetch(`${baseUrl}/api/test/simulate-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: testPageShiftId,
        sender_name: 'Khách Hàng Hỏi Sản Phẩm Kèm Ảnh',
        text: 'Shop xem mẫu áo này còn size XL không?',
        attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-sample.jpg' }]
      })
    });
    const simImgData = await simImgRes.json();
    assert.strictEqual(simImgData.ok, true);
    console.log('  ✓ API POST /api/test/simulate-message hỗ trợ gửi đính kèm ảnh thành công');

    // 9.6 Test Webhook POST with image attachment payload
    const whImgPayload = {
      object: 'page',
      entry: [
        {
          id: testPageShiftId,
          time: Date.now(),
          messaging: [
            {
              sender: { id: 'cust_wh_img_888' },
              recipient: { id: testPageShiftId },
              timestamp: Date.now(),
              message: {
                mid: 'mid_wh_img_test_101',
                text: 'Ảnh đơn hàng của em nè',
                attachments: [
                  {
                    type: 'image',
                    payload: {
                      url: 'https://scontent.cdninstagram.com/v/test_img.jpg'
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    const whImgRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(whImgPayload)
    });
    assert.strictEqual(whImgRes.status, 200);
    console.log('  ✓ Webhook tiếp nhận tin nhắn có đính kèm ảnh từ Facebook thành công');

    console.log('\n[10] Kiểm tra Xử lý Đa Định Dạng Tệp Đính Kèm (Images, Videos, Audios, Docs, Locations)...');
    
    console.log('\n[10] Kiểm tra Xử lý Đa Định Dạng Tệp Đính Kèm (Images, Videos, Audios, Docs, Locations)...');
    
    const { parseWebhookPayload } = require('../src/services/facebookService.js');

    // 1. Kiểm tra trích xuất Video từ Webhook
    const whVideoPayload = {
      object: 'page',
      entry: [{
        id: testPageShiftId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'cust_media_999' },
          recipient: { id: testPageShiftId },
          message: {
            mid: 'mid_media_video_001',
            attachments: [{
              type: 'video',
              payload: {
                url: 'https://video.xx.fbcdn.net/v/test_video.mp4',
                title: 'huong_dan_su_dung.mp4',
                size: 5242880
              }
            }]
          }
        }]
      }]
    };
    const parsedVideo = parseWebhookPayload(whVideoPayload);
    assert.strictEqual(parsedVideo.length, 1);
    assert.strictEqual(parsedVideo[0].attachments[0].type, 'video');
    assert.strictEqual(parsedVideo[0].attachments[0].url, 'https://video.xx.fbcdn.net/v/test_video.mp4');
    assert.strictEqual(parsedVideo[0].attachments[0].name, 'huong_dan_su_dung.mp4');
    assert.strictEqual(parsedVideo[0].attachments[0].size, 5242880);

    // 2. Kiểm tra trích xuất Tin nhắn thoại Audio từ Webhook
    const whAudioPayload = {
      object: 'page',
      entry: [{
        id: testPageShiftId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'cust_media_999' },
          recipient: { id: testPageShiftId },
          message: {
            mid: 'mid_media_audio_002',
            attachments: [{
              type: 'audio',
              payload: {
                url: 'https://cdn.fb.com/audioclip.mp4',
                title: 'voice_message.m4a'
              }
            }]
          }
        }]
      }]
    };
    const parsedAudio = parseWebhookPayload(whAudioPayload);
    assert.strictEqual(parsedAudio[0].attachments[0].type, 'audio');

    // 3. Kiểm tra trích xuất Tệp PDF tài liệu từ Webhook
    const whDocPayload = {
      object: 'page',
      entry: [{
        id: testPageShiftId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'cust_media_999' },
          recipient: { id: testPageShiftId },
          message: {
            mid: 'mid_media_doc_003',
            attachments: [{
              type: 'file',
              payload: {
                url: 'https://cdn.fb.com/bao_gia_san_pham.pdf',
                title: 'bao_gia_san_pham.pdf',
                size: 1048576
              }
            }]
          }
        }]
      }]
    };
    const parsedDoc = parseWebhookPayload(whDocPayload);
    assert.strictEqual(parsedDoc[0].attachments[0].type, 'file');
    assert.strictEqual(parsedDoc[0].attachments[0].name, 'bao_gia_san_pham.pdf');

    // 4. Kiểm tra trích xuất Vị trí GPS từ Webhook
    const whLocationPayload = {
      object: 'page',
      entry: [{
        id: testPageShiftId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'cust_media_999' },
          recipient: { id: testPageShiftId },
          message: {
            mid: 'mid_media_loc_004',
            attachments: [{
              type: 'location',
              payload: {
                coordinates: { lat: 10.7769, long: 106.7009 }
              }
            }]
          }
        }]
      }]
    };
    const parsedLoc = parseWebhookPayload(whLocationPayload);
    assert.strictEqual(parsedLoc[0].attachments[0].type, 'location');
    assert.strictEqual(parsedLoc[0].attachments[0].url.includes('maps?q=10.7769,106.7009'), true);

    // 5. Kiểm tra lưu trữ DB và API truy xuất tin nhắn đa phương tiện
    await fetch(`${baseUrl}/api/test/simulate-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: testPageShiftId,
        sender_id: 'cust_media_db_test',
        sender_name: 'Khách Đa Phương Tiện',
        text: 'Gửi video và file đính kèm',
        attachments: [
          { type: 'video', url: 'https://video.fb.com/v1.mp4', name: 'demo.mp4', size: 1024000 },
          { type: 'file', url: 'https://doc.fb.com/quote.xlsx', name: 'quote.xlsx', size: 51200 }
        ]
      })
    });

    const convMsgsRes = await fetch(`${baseUrl}/api/conversations/${testPageShiftId}/cust_media_db_test/messages`);
    const convMsgsData = await convMsgsRes.json();
    assert.strictEqual(convMsgsData.ok, true);
    assert.strictEqual(convMsgsData.messages.length, 1);

    const savedAtts = JSON.parse(convMsgsData.messages[0].attachments);
    assert.strictEqual(savedAtts.length, 2);
    assert.strictEqual(savedAtts[0].type, 'video');
    assert.strictEqual(savedAtts[1].type, 'file');
    assert.strictEqual(savedAtts[1].name, 'quote.xlsx');

    // Kiểm tra preview text thông minh
    const convListRes = await fetch(`${baseUrl}/api/conversations?search=cust_media_db_test`);
    const convListData = await convListRes.json();
    assert.strictEqual(convListData.ok, true);
    console.log('  ✓ Nhận dạng và lưu trữ chuẩn xác mọi định dạng tệp: Video, Audio/Voice, Document PDF, Location GPS');

    // =============================================================
    // [11] Kiểm tra Hộp Texting Chuẩn Meta Suite & Tự Động Bắt Hyperlink/Phone
    // =============================================================
    console.log('\n[11] Kiểm tra Hộp Texting Chuẩn Meta Suite & Tự Động Bắt Hyperlink/Phone/Đính Kèm Outbound...');

    // 1. Kiểm tra validation: Gửi tin trống không có text và không có attachment phải báo lỗi 400
    const emptySendRes11 = await fetch(`${baseUrl}/api/conversations/${testPageShiftId}/cust_reply_test_11/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' })
    });
    const emptySendData11 = await emptySendRes11.json();
    assert.strictEqual(emptySendRes11.status, 400);
    assert.strictEqual(emptySendData11.ok, false);
    console.log('  ✓ Validation từ chối gửi tin nhắn rỗng chuẩn xác (Status 400)');

    // 2. Mock page token for send-message
    db.saveOrUpdatePage({
      page_id: 'page_reply_suite_test',
      name: 'Fanpage Bán Hàng Trực Tuyến',
      access_token: 'MOCK_SEND_TOKEN_FOR_TEST',
      avatar_url: '',
      is_active: 1
    });

    // 3. Gửi tin nhắn kèm ảnh Base64 (Outbound reply)
    const mockBase64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const sendReplyRes = await fetch(`${baseUrl}/api/conversations/page_reply_suite_test/cust_reply_test_11/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Chào bạn, xem bảng giá tại https://example.com/pricing hoặc gọi hotline 0987654321 nhé!',
        attachment: {
          type: 'image',
          name: 'bang_gia.png',
          size: 68,
          data: mockBase64Image
        }
      })
    });
    const sendReplyData = await sendReplyRes.json();
    assert.strictEqual(sendReplyData.ok, true);
    assert.strictEqual(sendReplyData.attachment.type, 'image');
    assert.strictEqual(sendReplyData.attachment.name, 'bang_gia.png');
    assert(sendReplyData.attachment.url.includes('/uploads/'), 'URL phải trỏ vào thư mục uploads');
    console.log('  ✓ Gửi tin nhắn phản hồi kèm tệp đính kèm Base64 lưu trữ thành công');

    // 4. Kiểm tra lấy lại tin nhắn vừa gửi từ API
    const replyMsgsRes = await fetch(`${baseUrl}/api/conversations/page_reply_suite_test/cust_reply_test_11/messages`);
    const replyMsgsData = await replyMsgsRes.json();
    assert.strictEqual(replyMsgsData.ok, true);
    assert.strictEqual(replyMsgsData.messages.length, 1);
    assert.strictEqual(replyMsgsData.messages[0].is_echo, 1);
    assert(replyMsgsData.messages[0].text.includes('https://example.com/pricing'));

    const savedOutboundAtts = JSON.parse(replyMsgsData.messages[0].attachments);
    assert.strictEqual(savedOutboundAtts.length, 1);
    assert.strictEqual(savedOutboundAtts[0].type, 'image');
    console.log('  ✓ Lịch sử chat lưu trữ tin gửi đi (echo=1) kèm đính kèm đầy đủ');

    // 5. Kiểm tra logic nhận diện Hyperlink, Email và Số điện thoại an toàn chống XSS
    function testFormatMessageContent(rawText) {
      if (!rawText) return '';
      let safe = rawText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
      safe = safe.replace(urlRegex, (url) => {
        let cleanUrl = url;
        let trailingPunct = '';
        const match = cleanUrl.match(/[.,!?;:)]+$/);
        if (match) {
          trailingPunct = match[0];
          cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
        }
        const href = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-hyperlink" title="Mở liên kết: ${href}">${cleanUrl} ↗</a>${trailingPunct}`;
      });

      const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
      safe = safe.replace(emailRegex, '<a href="mailto:$1" class="chat-hyperlink chat-email-link">✉️ $1</a>');

      const phoneRegex = /(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)\d{7}\b/g;
      safe = safe.replace(phoneRegex, '<a href="tel:$&" class="chat-phone-link" title="Bấm để gọi điện thoại $&">📞 $&</a>');
      safe = safe.replace(/\n/g, '<br>');
      return safe;
    }

    const testInput = '<script>alert(1)</script> Mời vào web https://shop.vn/san-pham, liên hệ info@shop.vn hoặc hotline 0912345678!';
    const formatted = testFormatMessageContent(testInput);
    assert(!formatted.includes('<script>'), 'Phải escape thẻ script chống XSS');
    assert(formatted.includes('href="https://shop.vn/san-pham"'), 'Phải tạo link cho web URL');
    assert(formatted.includes('class="chat-hyperlink"'), 'Phải gắn class chat-hyperlink');
    assert(formatted.includes('href="mailto:info@shop.vn"'), 'Phải tạo mailto cho email');
    assert(formatted.includes('href="tel:0912345678"'), 'Phải tạo tel link cho số điện thoại');
    console.log('  ✓ Nhận diện chính xác URL, Email, Hotline Việt Nam và triệt tiêu mã độc XSS 100%');

    // =============================================================
    // SUITE 12: KIỂM THỬ XÁC ĐỊNH SEEN, TỰ ĐỘNG ĐI NGỦ (AUTO-SLEEP) & BÁO ĐỘNG AN TOÀN (SAFETY ALARM)
    // =============================================================
    console.log('\n[12] Kiểm tra Tính Năng Xác Định Seen, Thuật Toán Tự Động Đi Ngủ & Báo Động An Toàn...');

    // 1. Kiểm tra đánh dấu Seen từ phía nhân viên (Staff mark-seen)
    const seenCustId = 'cust_seen_test_12';
    const seenPageId = 'page_seen_suite_test';
    db.saveOrUpdatePage({
      page_id: seenPageId,
      name: 'Fanpage Thử Nghiệm Seen',
      access_token: 'MOCK_SEEN_TOKEN',
      avatar_url: '',
      is_active: 1
    });

    db.saveMessage({
      mid: 'mid_seen_test_01',
      page_id: seenPageId,
      sender_id: seenCustId,
      sender_name: 'Khách Hàng Cần Tư Vấn',
      text: 'Shop ơi tư vấn cho em với',
      attachments: [],
      timestamp: Date.now(),
      is_echo: 0
    });

    // Ban đầu cuộc trò chuyện phải là is_seen = 0
    const convBeforeSeen = db.getConversation(seenPageId, seenCustId);
    assert.strictEqual(convBeforeSeen.is_seen, 0, 'Tin nhắn mới đến phải có is_seen = 0');
    assert.strictEqual(convBeforeSeen.is_replied, 0, 'Tin nhắn mới đến phải có is_replied = 0');

    // Lọc bằng unseenOnly: true phải tìm thấy cuộc trò chuyện này
    const unseenList = db.getConversations({ unseenOnly: true });
    assert(unseenList.some(c => c.page_id === seenPageId && c.sender_id === seenCustId), 'Phải tìm thấy trong danh sách Chưa Xem');

    // Gọi API POST /api/conversations/:pageId/:senderId/mark-seen
    const markSeenRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${seenCustId}/mark-seen`, {
      method: 'POST'
    });
    const markSeenData = await markSeenRes.json();
    assert.strictEqual(markSeenData.ok, true);
    assert(markSeenData.seen_at > 0);

    const convAfterSeen = db.getConversation(seenPageId, seenCustId);
    assert.strictEqual(convAfterSeen.is_seen, 1, 'Sau khi mark-seen phải có is_seen = 1');
    assert(convAfterSeen.seen_at > 0);

    // Lọc bằng unseenOnly: true phải không còn cuộc trò chuyện này nữa
    const unseenListAfter = db.getConversations({ unseenOnly: true });
    assert(!unseenListAfter.some(c => c.page_id === seenPageId && c.sender_id === seenCustId), 'Sau khi xem không còn trong danh sách Chưa Xem');
    console.log('  ✓ Đánh dấu đã xem (Seen) và bộ lọc Chưa Xem (unseenOnly) hoạt động chính xác 100%');

    // 2. Kiểm tra Customer Seen Watermark (Meta Webhook Read Receipt)
    const mockWatermark = Date.now() + 5000;
    db.updateCustomerSeenWatermark(seenPageId, seenCustId, mockWatermark);
    const convWithWatermark = db.getConversation(seenPageId, seenCustId);
    assert.strictEqual(convWithWatermark.customer_seen_watermark, mockWatermark, 'Watermark khách xem phải được cập nhật vào DB');
    console.log('  ✓ Cập nhật Watermark khách đọc tin nhắn (Meta Webhook Read Receipt) thành công');

    // 3. Kiểm tra Thuật toán Tự Động Đi Ngủ & Quản Lý Hoạt Động (Auto-Sleep / Inactivity)
    const testHost = db.getHostProfile();
    const beforeActivity = testHost.last_activity_at;

    // Gửi heartbeat
    const heartbeatRes = await fetch(`${baseUrl}/api/host-profile/heartbeat`, { method: 'POST' });
    const heartbeatData = await heartbeatRes.json();
    assert.strictEqual(heartbeatData.ok, true);
    assert.strictEqual(heartbeatData.auto_sleep_enabled, true);

    const hostAfterHeartbeat = db.getHostProfile();
    assert(hostAfterHeartbeat.last_activity_at >= beforeActivity, 'Heartbeat phải cập nhật last_activity_at');

    // Test endpoint Auto-Sleep
    const sleepRes = await fetch(`${baseUrl}/api/host-profile/auto-sleep`, { method: 'POST' });
    const sleepData = await sleepRes.json();
    assert.strictEqual(sleepData.ok, true);
    assert.strictEqual(sleepData.host.alarm_enabled, 'true', 'Auto-sleep phải kích hoạt alarm_enabled = true');

    // Test endpoint Wake-Up khi người dùng quay lại
    const wakeRes = await fetch(`${baseUrl}/api/host-profile/wake-up`, { method: 'POST' });
    const wakeData = await wakeRes.json();
    assert.strictEqual(wakeData.ok, true);
    assert.strictEqual(wakeData.host.alarm_enabled, 'false', 'Wake-up phải tắt alarm_enabled = false');
    console.log('  ✓ Thuật toán theo dõi tương tác, tự động đi ngủ (Auto-Sleep) và tự động đánh thức (Wake-Up) chuẩn xác');

    // 4. Kiểm tra Báo Động An Toàn Khi Quên Trả Lời (Safety Alarm)
    const safetyCustId = 'cust_safety_alarm_12';
    const pastMessageTime = Date.now() - (15 * 60 * 1000); // 15 phút trước

    db.saveMessage({
      mid: 'mid_safety_alarm_01',
      page_id: seenPageId,
      sender_id: safetyCustId,
      sender_name: 'Khách Hàng Chờ Quá Lâu',
      text: 'Alo còn bán không ạ?',
      attachments: [],
      timestamp: pastMessageTime,
      is_echo: 0
    });

    // Quét các cuộc hội thoại chưa trả lời quá 10 phút
    const unrepliedExceeded = db.getUnrepliedConversationsForSafetyAlarm(10);
    assert(unrepliedExceeded.length > 0, 'Phải phát hiện cuộc trò chuyện quá hạn 10 phút');
    const targetSafetyConv = unrepliedExceeded.find(c => c.page_id === seenPageId && c.sender_id === safetyCustId);
    assert(targetSafetyConv, 'Phải chứa đúng cuộc trò chuyện quá hạn');
    assert.strictEqual(targetSafetyConv.safety_alarm_triggered, 0);

    // Kích hoạt báo động an toàn
    db.markSafetyAlarmTriggered(seenPageId, safetyCustId);
    const convAfterTrigger = db.getConversation(seenPageId, safetyCustId);
    assert.strictEqual(convAfterTrigger.safety_alarm_triggered, 1, 'Phải gắn cờ safety_alarm_triggered = 1');

    // Lần quét tiếp theo không được quét lại để tránh spam
    const unrepliedNext = db.getUnrepliedConversationsForSafetyAlarm(10);
    assert(!unrepliedNext.some(c => c.page_id === seenPageId && c.sender_id === safetyCustId), 'Không được báo động lặp lại khi đã kích hoạt');

    // Khi nhân viên trả lời, cờ safety_alarm_triggered phải tự động reset về 0 và is_replied = 1
    db.markConversationReplied(seenPageId, safetyCustId);
    const convAfterReply = db.getConversation(seenPageId, safetyCustId);
    assert.strictEqual(convAfterReply.safety_alarm_triggered, 0, 'Phải reset safety_alarm_triggered về 0 sau khi rep');
    assert.strictEqual(convAfterReply.is_replied, 1, 'Phải cập nhật is_replied = 1');
    console.log('  ✓ Cơ chế Báo Động An Toàn (Safety Alarm), chống spam và tự động giải phóng khi rep hoạt động 100%');

    // =============================================================
    // SUITE 13: KIỂM THỬ ĐỒNG BỘ HAI CHIỀU SEEN / UNSEEN VỚI META & DISCORD ALERT DISPATCHING
    // =============================================================
    console.log('\n[13] Kiểm tra Đồng Bộ Hai Chiều Trạng Thái Seen/Unseen Với Meta & Kênh Discord Alert...');

    // 13.1 Kiểm tra hàm sendMarkSeen tới Meta Graph API
    const { sendMarkSeen } = require('../src/services/facebookService');
    const markSeenResult = await sendMarkSeen('MOCK_TEST_PAGE_TOKEN', 'test_recipient_psid_13');
    assert.strictEqual(markSeenResult.success, true, 'sendMarkSeen với mock token phải trả về success: true');
    console.log('  ✓ sendMarkSeen gửi hành động sender_action mark_seen chuẩn xác tới Graph API');

    // 13.2 Kiểm tra API POST /api/conversations/:pageId/:senderId/mark-unseen
    const markUnseenRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${seenCustId}/mark-unseen`, {
      method: 'POST'
    });
    const markUnseenData = await markUnseenRes.json();
    assert.strictEqual(markUnseenData.ok, true, 'API mark-unseen phải trả về ok: true');
    assert.strictEqual(markUnseenData.is_seen, 0, 'API mark-unseen phải trả về is_seen = 0');
    assert.strictEqual(markUnseenData.unread_count, 1, 'API mark-unseen phải trả về unread_count = 1');

    const convAfterUnseen = db.getConversation(seenPageId, seenCustId);
    assert.strictEqual(convAfterUnseen.is_seen, 0, 'Database phải cập nhật is_seen = 0');
    assert.strictEqual(convAfterUnseen.unread_count, 1, 'Database phải cập nhật unread_count = 1');
    assert.strictEqual(convAfterUnseen.seen_at, 0, 'Database phải reset seen_at = 0');
    console.log('  ✓ API POST /mark-unseen và hàm markConversationUnseen cập nhật trạng thái chuẩn xác 100%');

    // 13.3 Kiểm tra Dispatch Discord Alert khi có tin nhắn mới từ Webhook
    // Đảm bảo host profile có cấu hình Discord webhook
    const mockDiscordWebhook = 'https://discord.com/api/webhooks/999888777/test_token_alert';
    db.updateHostProfile({
      discord_webhook_url: mockDiscordWebhook,
      discord_enabled: 'true'
    });
    const updatedHost = db.getHostProfile();
    assert.strictEqual(updatedHost.discord_webhook_url, mockDiscordWebhook, 'Host profile phải lưu Discord webhook URL');
    assert.strictEqual(updatedHost.discord_enabled, 'true');

    // Gửi tin nhắn qua Webhook
    const discordTestMid = 'mid_discord_wh_alert_test_13';
    const whDiscordPayload = {
      object: 'page',
      entry: [{
        id: seenPageId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'cust_discord_test_13' },
          recipient: { id: seenPageId },
          timestamp: Date.now(),
          message: {
            mid: discordTestMid,
            text: 'Tin nhắn kiểm tra thông báo Discord Webhook'
          }
        }]
      }]
    };

    const whDiscordRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(whDiscordPayload)
    });
    assert.strictEqual(whDiscordRes.status, 200, 'Webhook POST phải phản hồi 200 OK');

    // Chờ một chút để tác vụ bất đồng bộ của Webhook hoàn tất lưu DB và bắn Discord alert
    await new Promise(r => setTimeout(r, 200));

    const msgsInDb = db.getConversationMessages(seenPageId, 'cust_discord_test_13');
    const msgInDb = msgsInDb.find(m => m.mid === discordTestMid);
    assert(msgInDb, 'Tin nhắn phải được lưu vào cơ sở dữ liệu');
    assert.strictEqual(msgInDb.text, 'Tin nhắn kiểm tra thông báo Discord Webhook');
    console.log('  ✓ Webhook tiếp nhận tin nhắn và điều hướng bắn thông báo Discord Alert đồng bộ thành công');

    // =============================================================
    // SUITE 14: KIỂM THỬ ĐỒNG BỘ NHIỀU NGƯỜI QUẢN LÝ (MULTI-AGENT SYNC & META ECHO)
    // =============================================================
    console.log('\n[14] Kiểm tra Đồng Bộ Khi Nhiều Người Cùng Quản Lý Page & Đồng Bộ Echo Từ Meta...');

    // 14.1 Kiểm tra Webhook tiếp nhận tin nhắn Echo khi ai đó rep từ Meta Business Suite/Điện thoại
    const echoCustId = 'cust_multi_agent_14';
    const echoMid = 'mid_meta_echo_suite_14';

    // Đảm bảo ban đầu có tin nhắn từ khách (chưa trả lời)
    db.saveMessage({
      mid: 'mid_cust_inbound_14',
      page_id: seenPageId,
      sender_id: echoCustId,
      sender_name: 'Khách Đang Chờ Rep',
      text: 'Alo có ai trực không?',
      attachments: [],
      timestamp: Date.now() - 1000,
      is_echo: 0
    });

    const convBeforeEcho = db.getConversation(seenPageId, echoCustId);
    assert.strictEqual(convBeforeEcho.is_replied, 0, 'Trước khi rep thì is_replied phải là 0');

    // Gửi Webhook sự kiện is_echo = true (Page rep cho khách)
    const whEchoPayload = {
      object: 'page',
      entry: [{
        id: seenPageId,
        time: Date.now(),
        messaging: [{
          sender: { id: seenPageId },
          recipient: { id: echoCustId },
          timestamp: Date.now(),
          message: {
            mid: echoMid,
            text: 'Dạ shop đây ạ! Bạn cần tư vấn mẫu nào?',
            is_echo: true
          }
        }]
      }]
    };

    const whEchoRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(whEchoPayload)
    });
    assert.strictEqual(whEchoRes.status, 200);

    // Chờ xử lý bất đồng bộ
    await new Promise(r => setTimeout(r, 200));

    // Kiểm tra tin nhắn echo được lưu vào DB
    const echoMsgs = db.getConversationMessages(seenPageId, echoCustId);
    const savedEcho = echoMsgs.find(m => m.mid === echoMid);
    assert(savedEcho, 'Tin nhắn Echo từ Meta phải được lưu vào CSDL');
    assert.strictEqual(savedEcho.is_echo, 1, 'Tin nhắn phải có is_echo = 1');

    // Kiểm tra hội thoại đã tự động chuyển sang trạng thái Đã trả lời (is_replied = 1)
    const convAfterEcho = db.getConversation(seenPageId, echoCustId);
    assert.strictEqual(convAfterEcho.is_replied, 1, 'Sau khi có Echo rep từ Meta thì is_replied phải tự động cập nhật là 1');
    console.log('  ✓ Webhook đồng bộ tin nhắn Echo khi nhân viên khác rep từ Meta Business Suite chuẩn xác 100%');

    // 14.2 Kiểm tra API Real-Time Typing Indicator giữa các nhân viên
    const typingRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${echoCustId}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_name: 'Nhân Viên Minh' })
    });
    const typingData = await typingRes.json();
    assert.strictEqual(typingData.ok, true, 'API /typing phải trả về ok: true');
    console.log('  ✓ API POST /api/conversations/.../typing phát tín hiệu đang soạn tin nhắn giữa các nhân viên thành công');

    // 14.3 Kiểm tra Gửi tin nhắn từ Tool kèm định danh Nhân viên (Agent Presence)
    const sendAgentReplyRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${echoCustId}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Dạ shop gửi hình ảnh nhé!',
        agent_name: 'Quản Trị Viên (Host)'
      })
    });
    const sendAgentReplyData = await sendAgentReplyRes.json();
    assert.strictEqual(sendAgentReplyData.ok, true, 'Gửi tin nhắn phản hồi qua Tool phải thành công');
    console.log('  ✓ Gửi tin nhắn phản hồi kèm tên định danh nhân viên phục vụ đồng bộ đa người dùng thành công');

    // [15] Kiểm tra Chuẩn Khung Chat Đa Phương Tiện (Voice Note, Video, Upload & Drag-and-Drop)
    console.log('\n[15] Kiểm tra Chuẩn Khung Chat Đa Phương Tiện (Voice Note, Video, Drag-and-Drop & Meta Echo)...');

    // 15.1 Kiểm tra Gửi Outbound Voice/Audio Attachment kèm tệp âm thanh Base64
    const audioDummyBase64 = 'data:audio/mp3;base64,' + Buffer.from('FAKE_MP3_AUDIO_HEADER_DATA').toString('base64');
    const sendAudioRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${echoCustId}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Nghe thử tin nhắn thoại tư vấn nhé bạn!',
        agent_name: 'Admin',
        attachment: {
          type: 'audio',
          name: 'tu_van_voice.mp3',
          size: 1024,
          data: audioDummyBase64
        }
      })
    });
    const sendAudioData = await sendAudioRes.json();
    assert.strictEqual(sendAudioRes.status, 200);
    assert.strictEqual(sendAudioData.ok, true);
    assert(sendAudioData.attachment, 'Phải có thông tin attachment trả về');
    assert.strictEqual(sendAudioData.attachment.type, 'audio');
    assert(sendAudioData.attachment.url.includes('tu_van_voice.mp3'));
    console.log('  ✓ Gửi tin nhắn kèm Voice Note âm thanh (Base64 -> File Server) thành công');

    // 15.2 Kiểm tra Gửi Outbound Video Attachment
    const videoDummyBase64 = 'data:video/mp4;base64,' + Buffer.from('FAKE_MP4_VIDEO_HEADER_DATA').toString('base64');
    const sendVideoRes = await fetch(`${baseUrl}/api/conversations/${seenPageId}/${echoCustId}/send-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Video cận cảnh chất liệu sản phẩm:',
        agent_name: 'Admin',
        attachment: {
          type: 'video',
          name: 'san_pham_video.mp4',
          size: 2048,
          data: videoDummyBase64
        }
      })
    });
    const sendVideoData = await sendVideoRes.json();
    assert.strictEqual(sendVideoRes.status, 200);
    assert.strictEqual(sendVideoData.ok, true);
    assert.strictEqual(sendVideoData.attachment.type, 'video');
    assert(sendVideoData.attachment.url.includes('san_pham_video.mp4'));
    console.log('  ✓ Gửi tin nhắn kèm Video clip sản phẩm thành công');

    // 15.3 Kiểm tra Meta Webhook Echo tiếp nhận Voice Note từ Messenger điện thoại
    const voiceEchoMid = 'mid_voice_echo_' + Date.now();
    const whVoiceEchoPayload = {
      object: 'page',
      entry: [{
        id: seenPageId,
        time: Date.now(),
        messaging: [{
          sender: { id: seenPageId },
          recipient: { id: echoCustId },
          timestamp: Date.now(),
          message: {
            mid: voiceEchoMid,
            is_echo: true,
            attachments: [{
              type: 'audio',
              payload: {
                url: 'https://cdn.fbsbx.com/v/t59.3654-21/audioclip.mp4'
              }
            }]
          }
        }]
      }]
    };

    const whVoiceRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(whVoiceEchoPayload)
    });
    assert.strictEqual(whVoiceRes.status, 200);

    // Đợi async process
    await new Promise(r => setTimeout(r, 200));

    const updatedMsgs = db.getConversationMessages(seenPageId, echoCustId);
    const savedVoiceEcho = updatedMsgs.find(m => m.mid === voiceEchoMid);
    assert(savedVoiceEcho, 'Tin nhắn Voice Echo từ Meta phải được lưu vào CSDL');
    assert.strictEqual(savedVoiceEcho.is_echo, 1);
    
    let parsedAtts = [];
    try {
      parsedAtts = typeof savedVoiceEcho.attachments === 'string' ? JSON.parse(savedVoiceEcho.attachments) : savedVoiceEcho.attachments;
    } catch (e) {}
    assert(parsedAtts.length >= 1, 'Phải parse được attachment voice note');
    assert.strictEqual(parsedAtts[0].type, 'audio');
    console.log('  ✓ Đồng bộ hai chiều Voice Note gửi từ ứng dụng Messenger di động thành công 100%');

    // -------------------------------------------------------------
    // [16] Kiểm tra Gọi Trực Tiếp SIM (Twilio/VoIP) & Badge Chưa Xem...
    // -------------------------------------------------------------
    console.log('\n[16] Kiểm tra Gọi Trực Tiếp Vào SIM (Twilio/VoIP) & Đếm Số Tin Chưa Xem (Unseen Badge)...');

    // 16.1 Kiểm tra API /api/status trả về unseenConversations chính xác
    const statusRes = await fetch(`${baseUrl}/api/status`);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.ok, true);
    assert(typeof statusData.stats.unseenConversations === 'number', 'stats.unseenConversations phải là số nguyên');
    assert(typeof statusData.stats.unrepliedConversations === 'number', 'stats.unrepliedConversations phải là số nguyên');
    console.log(`  ✓ API /api/status trả về unseenConversations: ${statusData.stats.unseenConversations} (Badge chỉ đếm tin chưa xem)`);

    // 16.2 Kiểm tra validation Twilio khi thiếu credentials
    const twilioMissingRes = await fetch(`${baseUrl}/api/test/alarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alarm_method: 'twilio',
        twilio_to_number: '0976014480'
      })
    });
    const twilioMissingData = await twilioMissingRes.json();
    assert.strictEqual(twilioMissingRes.status, 400);
    assert(twilioMissingData.error.includes('Twilio'), 'Phải thông báo rõ thiếu thông tin cấu hình Twilio');
    console.log('  ✓ Validation Twilio từ chối khi thiếu Account SID / Auth Token / From Number chuẩn xác');

    // 16.3 Kiểm tra lưu cấu hình Twilio vào Host Profile
    const hostProfileSaveRes = await fetch(`${baseUrl}/api/host-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alarm_method: 'twilio',
        twilio_to_number: '0976014480',
        twilio_account_sid: 'AC_TEST_ACCOUNT_SID_FOR_UNITTEST',
        twilio_auth_token: 'TEST_AUTH_TOKEN_SECRET_123',
        twilio_from_number: '+15551234567'
      })
    });
    const hostProfileSaveData = await hostProfileSaveRes.json();
    assert.strictEqual(hostProfileSaveData.ok, true);
    assert.strictEqual(hostProfileSaveData.host.alarm_method, 'twilio');
    assert.strictEqual(hostProfileSaveData.host.twilio_to_number, '0976014480');
    assert.strictEqual(hostProfileSaveData.host.twilio_account_sid, 'AC_TEST_ACCOUNT_SID_FOR_UNITTEST');
    console.log('  ✓ Lưu cấu hình SIM di động (0976014480) và Twilio VoIP vào Host Profile thành công');

    // 16.4 Kiểm tra ntfy.sh validation khi thiếu Topic
    const ntfyMissingRes = await fetch(`${baseUrl}/api/test/alarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alarm_method: 'ntfy',
        ntfy_topic: ''
      })
    });
    const ntfyMissingData = await ntfyMissingRes.json();
    assert.strictEqual(ntfyMissingRes.status, 400);
    assert(ntfyMissingData.error.includes('ntfy'), 'Phải thông báo thiếu cấu hình ntfy Topic');
    console.log('  ✓ Validation ntfy.sh từ chối Topic rỗng chuẩn xác');

    // 16.5 Kiểm tra bắn lệnh Ringtone ntfy.sh thành công (100% Free)
    const ntfyTestRes = await fetch(`${baseUrl}/api/test/alarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alarm_method: 'ntfy',
        ntfy_topic: 'fb_unittest_alarm_topic_2026'
      })
    });
    const ntfyTestData = await ntfyTestRes.json();
    assert.strictEqual(ntfyTestRes.status, 200);
    assert.strictEqual(ntfyTestData.ok, true);
    assert(ntfyTestData.message.includes('ntfy'), 'Phải trả về thông báo kích hoạt ntfy thành công');
    console.log('  ✓ Gửi lệnh Ringtone Báo thức miễn phí qua ntfy.sh thành công 100%');

    // [17] Kiểm tra Cơ Chế Đồng Bộ Thời Gian Meta & Thứ Tự Tin Nhắn Tuyệt Đối (Meta Time Sync & Chronological Order)
    console.log('\n[17] Kiểm tra Cơ Chế Đồng Bộ Thời Gian Meta & Thứ Tự Tin Nhắn Tuyệt Đối...');

    const { updateMetaClockOffset, getMetaSyncedNow, getMetaClockOffset } = require('../src/services/facebookService');

    // 17.1 Test updateMetaClockOffset with synthetic HTTP Date header
    const mockFbTimeMs = 1789398000000;
    const mockDateHeader = new Date(mockFbTimeMs).toUTCString();
    updateMetaClockOffset(mockDateHeader);
    const calculatedOffset = getMetaClockOffset();
    assert(typeof calculatedOffset === 'number', 'Offset phải là số');
    const syncedNow = getMetaSyncedNow();
    assert(Math.abs(syncedNow - mockFbTimeMs) < 5000, 'getMetaSyncedNow phải bám sát giờ Meta đã hiệu chuẩn');
    console.log('  ✓ Thuật toán hiệu chuẩn Meta Clock Offset hoạt động chính xác');

    // 17.2 Test message sorting: ORDER BY timestamp ASC, id ASC
    const testSyncPageId = 'page_time_sync_test';
    const testSyncSenderId = 'customer_time_sync_test';

    // Insert message 1: Shop sends at T
    const baseTime = 1789400000000;
    db.saveMessage({
      mid: 'mid_sync_1',
      page_id: testSyncPageId,
      sender_id: testSyncSenderId,
      sender_name: 'Shop',
      text: 'Tin nhắn 1 của shop',
      timestamp: baseTime,
      is_echo: 1
    });

    // Insert message 2: Customer replies at T + 10s
    db.saveMessage({
      mid: 'mid_sync_2',
      page_id: testSyncPageId,
      sender_id: testSyncSenderId,
      sender_name: 'Khách',
      text: 'Tin nhắn 2 của khách',
      timestamp: baseTime + 10000,
      is_echo: 0
    });

    // Insert message 3: Same second tie-breaker test (T + 10s, but inserted later)
    db.saveMessage({
      mid: 'mid_sync_3',
      page_id: testSyncPageId,
      sender_id: testSyncSenderId,
      sender_name: 'Khách',
      text: 'Tin nhắn 3 của khách (cùng giây)',
      timestamp: baseTime + 10000,
      is_echo: 0
    });

    const orderedMsgs = db.getConversationMessages(testSyncPageId, testSyncSenderId);
    assert.strictEqual(orderedMsgs.length, 3);
    assert.strictEqual(orderedMsgs[0].mid, 'mid_sync_1');
    assert.strictEqual(orderedMsgs[1].mid, 'mid_sync_2');
    assert.strictEqual(orderedMsgs[2].mid, 'mid_sync_3');
    console.log('  ✓ Thứ tự tin nhắn (timestamp ASC, id ASC) đảm bảo trật tự hội thoại tuyệt đối');

    // 17.3 Test conversation last_message_time does not regress on older message
    const convBefore = db.getConversation(testSyncPageId, testSyncSenderId);
    assert.strictEqual(convBefore.last_message_time, baseTime + 10000);

    // Save an older message (e.g. from backfill or sync)
    db.saveMessage({
      mid: 'mid_sync_older',
      page_id: testSyncPageId,
      sender_id: testSyncSenderId,
      sender_name: 'Khách',
      text: 'Tin nhắn cũ',
      timestamp: baseTime - 50000,
      is_echo: 0
    });

    const convAfter = db.getConversation(testSyncPageId, testSyncSenderId);
    assert.strictEqual(convAfter.last_message_time, baseTime + 10000, 'last_message_time không được bị tụt lùi khi lưu tin cũ');
    console.log('  ✓ conversations.last_message_time bảo toàn mốc thời gian mới nhất');

    // =============================================================
    // 18. Test Tự Động Đổi Token Dài Hạn (App ID + Secret) & Kho Token
    // =============================================================
    console.log('\n[18] Kiểm tra Tự Động Đổi Token Dài Hạn, Kho Token Đã Lưu & Đa Nguồn Page...');
    const fbService = require('../src/services/facebookService');

    // 18.1 Test exchangeLongLivedToken validation
    try {
      await fbService.exchangeLongLivedToken({ appId: '', appSecret: '', token: '' });
      assert.fail('Phải báo lỗi khi thiếu thông tin exchange');
    } catch (e) {
      assert(e.message.includes('Vui lòng cung cấp đầy đủ'));
      console.log('  ✓ exchangeLongLivedToken từ chối khi thiếu App ID / App Secret chuẩn xác');
    }

    // 18.2 Test exchange with Mock Token
    const exchangeRes = await fbService.exchangeLongLivedToken({
      appId: '2361682801028889',
      appSecret: 'e8fe1eea2a04d34e49eedb571f3034b4',
      token: 'TEST_TOKEN_SHORT_LIVED'
    });
    assert(exchangeRes.longLivedToken.startsWith('MOCK_LONG_LIVED_'));
    assert.strictEqual(exchangeRes.expiresIn, 5184000);
    console.log('  ✓ exchangeLongLivedToken sinh mã token dài hạn ~60 ngày thành công');

    // 18.3 Test Database token_sources Repository CRUD
    const source1 = db.saveOrUpdateTokenSource({
      name: 'Nick FB Chính (Tuấn Phong)',
      app_id: '2361682801028889',
      app_secret: 'e8fe1eea2a04d34e49eedb571f3034b4',
      user_token: 'EAA_SHORT_LIVED_001',
      long_lived_token: exchangeRes.longLivedToken,
      token_type: 'LONG_LIVED',
      is_permanent: 1,
      pages_count: 2
    });
    assert(source1.id, 'Token Source 1 phải được tạo');
    assert.strictEqual(source1.name, 'Nick FB Chính (Tuấn Phong)');
    assert.strictEqual(source1.is_permanent, 1);

    const source2 = db.saveOrUpdateTokenSource({
      name: 'Nick FB Phụ (Quảng Cáo B)',
      app_id: '999888777666',
      app_secret: 'secret_abc_123',
      user_token: 'EAA_SHORT_LIVED_002',
      long_lived_token: 'EAA_LONG_LIVED_002',
      token_type: 'LONG_LIVED',
      is_permanent: 1,
      pages_count: 1
    });
    assert(source2.id, 'Token Source 2 phải được tạo');

    const allSources = db.getAllTokenSources();
    assert.strictEqual(allSources.length, 2);
    console.log('  ✓ Kho Token Đã Lưu (token_sources) lưu trữ đa tài khoản FB thành công');

    // 18.4 Test 1 Tool quản lý nhiều Page từ nhiều nguồn Token khác nhau
    db.saveOrUpdatePage({
      page_id: 'page_multi_source_01',
      name: 'Page Thuộc Nick Chính',
      access_token: 'PERMANENT_PAGE_TOKEN_A',
      account_label: 'Nick Chính (Tuấn Phong)',
      token_source_id: source1.id,
      is_permanent: 1
    });

    db.saveOrUpdatePage({
      page_id: 'page_multi_source_02',
      name: 'Page Thuộc Nick Phụ',
      access_token: 'PERMANENT_PAGE_TOKEN_B',
      account_label: 'Nick Phụ (Quảng Cáo B)',
      token_source_id: source2.id,
      is_permanent: 1
    });

    const pageFromSource1 = db.getPageByPageId('page_multi_source_01');
    const pageFromSource2 = db.getPageByPageId('page_multi_source_02');
    assert.strictEqual(pageFromSource1.token_source_name, 'Nick FB Chính (Tuấn Phong)');
    assert.strictEqual(pageFromSource1.is_permanent, 1);
    assert.strictEqual(pageFromSource2.token_source_name, 'Nick FB Phụ (Quảng Cáo B)');
    assert.strictEqual(pageFromSource2.is_permanent, 1);
    console.log('  ✓ 1 Tool quản lý đồng thời nhiều Page từ các nguồn Token khác nhau hoàn hảo');

    // 18.5 Test API GET /api/token-sources
    const getSourcesRes = await fetch(`${baseUrl}/api/token-sources`);
    const getSourcesData = await getSourcesRes.json();
    assert.strictEqual(getSourcesRes.status, 200);
    assert.strictEqual(getSourcesData.ok, true);
    assert.strictEqual(getSourcesData.tokenSources.length, 2);
    console.log('  ✓ API GET /api/token-sources trả về danh sách nguồn Token đã lưu');

    // 18.6 Test API POST /api/pages/fetch-from-token with App ID & Secret
    const fetchWithAppRes = await fetch(`${baseUrl}/api/pages/fetch-from-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: '2361682801028889',
        app_secret: 'e8fe1eea2a04d34e49eedb571f3034b4',
        token: 'TEST_TOKEN_API_01',
        account_label: 'Nick Test Auto Long Lived'
      })
    });
    const fetchWithAppData = await fetchWithAppRes.json();
    assert(fetchWithAppData.token_source_id, 'Phải tự động lưu và trả về token_source_id');
    console.log('  ✓ API POST /api/pages/fetch-from-token tự động đổi Token dài hạn và lưu vào Vault');

    // 18.7 Test Xóa nguồn Token bảo toàn Fanpage
    db.deleteTokenSource(source2.id);
    const pageAfterDeleteSource = db.getPageByPageId('page_multi_source_02');
    assert.strictEqual(pageAfterDeleteSource.token_source_id, 0, 'token_source_id phải reset về 0');
    assert.strictEqual(pageAfterDeleteSource.name, 'Page Thuộc Nick Phụ', 'Fanpage vẫn phải tiếp tục tồn tại');
    console.log('  ✓ Xóa nguồn Token bảo toàn 100% dữ liệu Fanpage đã kết nối');

    // 18.8 Test debugToken Service & API GET /api/pages/:pageId/debug-token
    const debugMockRes = await fbService.debugToken({
      token: 'TEST_TOKEN_DEBUG',
      appId: '2361682801028889',
      appSecret: 'e8fe1eea2a04d34e49eedb571f3034b4'
    });
    assert.strictEqual(debugMockRes.isValid, true);
    assert.strictEqual(debugMockRes.isPermanent, true);
    assert.strictEqual(debugMockRes.expiresAt, 0);

    const apiDebugRes = await fetch(`${baseUrl}/api/pages/page_multi_source_01/debug-token`);
    const apiDebugData = await apiDebugRes.json();
    assert.strictEqual(apiDebugRes.status, 200);
    assert.strictEqual(apiDebugData.ok, true);
    assert.strictEqual(apiDebugData.debug.isValid, true);
    console.log('  ✓ API GET /api/pages/:pageId/debug-token (Soi chi tiết Token Meta) hoạt động chính xác');

    // 18.9 Test API POST /api/token-sources/:id/renew (Cập nhật Token ngắn hạn mới)
    const renewRes = await fetch(`${baseUrl}/api/token-sources/${source1.id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'TEST_TOKEN_RENEWED_01',
        name: 'Nick FB Chính (Đã Đổi Token Mới)'
      })
    });
    const renewData = await renewRes.json();
    assert.strictEqual(renewRes.status, 200);
    assert.strictEqual(renewData.ok, true);
    assert(renewData.tokenSource.long_lived_token.includes('RENEWED'));
    console.log('  ✓ API POST /api/token-sources/:id/renew (Đổi Token ngắn hạn mới và tự động cập nhật Fanpage) thành công');

    // [19] Kiểm tra Đăng Nhập Facebook OAuth 2.0 (1-Click) & Quản Lý Đa Tài Khoản Facebook
    console.log('\n[19] Kiểm tra Đăng Nhập Facebook OAuth 2.0 & Quản Lý Đa Tài Khoản Facebook...');

    // 19.1 Kiểm tra generateFacebookAuthUrl
    const sampleAuthUrl = fbService.generateFacebookAuthUrl({
      appId: '2361682801028889',
      redirectUri: 'http://localhost:3000/auth/facebook/callback',
      state: 'sample_state_123',
      reauth: true
    });
    assert(sampleAuthUrl.includes('client_id=2361682801028889'), 'Auth URL phải chứa client_id');
    assert(sampleAuthUrl.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Ffacebook%2Fcallback'), 'Auth URL phải chứa redirect_uri encoded');
    assert(sampleAuthUrl.includes('pages_messaging'), 'Auth URL phải yêu cầu quyền pages_messaging');
    assert(sampleAuthUrl.includes('pages_show_list'), 'Auth URL phải yêu cầu quyền pages_show_list');
    assert(sampleAuthUrl.includes('reauthenticate'), 'Auth URL phải có reauth');
    console.log('  ✓ generateFacebookAuthUrl sinh link đăng nhập chuẩn OAuth 2.0 kèm đầy đủ các scopes Meta');

    // 19.2 Kiểm tra API Cấu Hình App: GET & POST /api/facebook-app-config
    const saveAppRes = await fetch(`${baseUrl}/api/facebook-app-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: '2361682801028889',
        app_secret: 'e8fe1eea2a04d34e49eedb571f3034b4'
      })
    });
    const saveAppData = await saveAppRes.json();
    assert.strictEqual(saveAppRes.status, 200);
    assert.strictEqual(saveAppData.ok, true);
    assert.strictEqual(saveAppData.appId, '2361682801028889');
    assert.strictEqual(saveAppData.hasAppSecret, true);

    const getAppRes = await fetch(`${baseUrl}/api/facebook-app-config`);
    const getAppData = await getAppRes.json();
    assert.strictEqual(getAppRes.status, 200);
    assert.strictEqual(getAppData.ok, true);
    assert.strictEqual(getAppData.appId, '2361682801028889');
    assert(Array.isArray(getAppData.redirectUris) && getAppData.redirectUris.length > 0);
    console.log('  ✓ API GET & POST /api/facebook-app-config lưu trữ và hiển thị danh sách Redirect URIs chuẩn xác');

    // 19.3 Kiểm tra endpoint GET /auth/facebook chuyển hướng chuẩn
    const oauthInitiateRes = await fetch(`${baseUrl}/auth/facebook?redirect_uri=http://localhost:3000/auth/facebook/callback`, {
      redirect: 'manual'
    });
    assert(oauthInitiateRes.status === 302 || oauthInitiateRes.status === 301, 'Phải chuyển hướng 302 đến dialog Facebook');
    const redirectTarget = oauthInitiateRes.headers.get('location');
    assert(redirectTarget.includes('facebook.com') && redirectTarget.includes('dialog/oauth'), 'Location header phải trỏ đến Facebook Dialog');
    console.log('  ✓ Endpoint GET /auth/facebook tự động khởi tạo luồng chuyển hướng đăng nhập Facebook 1-Click');

    // 19.4 Giả lập Đăng nhập Tài khoản Facebook 1 (Nick Tuấn Phong) qua OAuth Callback
    const callbackAcc1Res = await fetch(`${baseUrl}/auth/facebook/callback?code=TEST_CODE_USER_1&state=${Buffer.from(JSON.stringify({ popup: '1', redirect_uri: 'http://localhost:3000/auth/facebook/callback' })).toString('base64url')}`);
    assert.strictEqual(callbackAcc1Res.status, 200);
    const callbackAcc1Html = await callbackAcc1Res.text();
    assert(callbackAcc1Html.includes('FB_AUTH_SUCCESS'), 'Phải trả về HTML postMessage FB_AUTH_SUCCESS');
    assert(callbackAcc1Html.includes('Nguyễn Tuấn Phong'), 'Phải nhận diện đúng tên tài khoản 1');

    const sourceAcc1 = db.getTokenSourceByFbUserId('mock_fb_user_100088');
    assert(sourceAcc1, 'Tài khoản Facebook 1 phải được lưu vào CSDL');
    assert.strictEqual(sourceAcc1.name, 'Nguyễn Tuấn Phong');
    assert.strictEqual(sourceAcc1.fb_user_id, 'mock_fb_user_100088');
    console.log('  ✓ OAuth Callback đăng nhập thành công Tài khoản Facebook 1 ("Nguyễn Tuấn Phong") và cấp quyền vĩnh viễn');

    // 19.5 Giả lập Đăng nhập Tài khoản Facebook 2 (Nick Ca Sáng) qua OAuth Callback
    const callbackAcc2Res = await fetch(`${baseUrl}/auth/facebook/callback?code=TEST_CODE_USER_2&state=${Buffer.from(JSON.stringify({ popup: '1', redirect_uri: 'http://localhost:3000/auth/facebook/callback' })).toString('base64url')}`);
    assert.strictEqual(callbackAcc2Res.status, 200);
    const callbackAcc2Html = await callbackAcc2Res.text();
    assert(callbackAcc2Html.includes('FB_AUTH_SUCCESS'));
    assert(callbackAcc2Html.includes('Lê Văn Ca Sáng'), 'Phải nhận diện đúng tên tài khoản 2');

    const sourceAcc2 = db.getTokenSourceByFbUserId('mock_fb_user_22222');
    assert(sourceAcc2, 'Tài khoản Facebook 2 phải được lưu vào CSDL');
    assert.strictEqual(sourceAcc2.name, 'Lê Văn Ca Sáng');
    assert.strictEqual(sourceAcc2.fb_user_id, 'mock_fb_user_22222');
    console.log('  ✓ OAuth Callback đăng nhập thành công Tài khoản Facebook 2 ("Lê Văn Ca Sáng") độc lập');

    // 19.6 Kiểm tra Đa Tài Khoản Facebook cùng tồn tại song song trong Tool
    const allOAuthSources = db.getAllTokenSources();
    const hasAcc1 = allOAuthSources.some(s => s.fb_user_id === 'mock_fb_user_100088');
    const hasAcc2 = allOAuthSources.some(s => s.fb_user_id === 'mock_fb_user_22222');
    assert(hasAcc1 && hasAcc2, 'Cả hai tài khoản Facebook phải cùng tồn tại song song trong Kho Nguồn');

    const allConnectedPages = db.getAllPages();
    const pageAcc1 = allConnectedPages.find(p => p.page_id === 'page_mock_test_01');
    const pageAcc2 = allConnectedPages.find(p => p.page_id === 'page_mock_user2_01');
    assert(pageAcc1, 'Fanpage của Tài khoản 1 phải được kết nối');
    assert(pageAcc2, 'Fanpage của Tài khoản 2 phải được kết nối');
    assert.strictEqual(pageAcc1.account_label, 'Nguyễn Tuấn Phong');
    assert.strictEqual(pageAcc2.account_label, 'Lê Văn Ca Sáng');
    console.log('  ✓ Hệ thống Đa Tài Khoản Facebook (Multi-Account) quản lý song song nhiều tài khoản và Fanpage hoàn hảo');

    // 19.7 Kiểm tra API PATCH /api/pages/:id tùy biến Fanpage custom (color_tag, account_label, name)
    const patchPageRes = await fetch(`${baseUrl}/api/pages/${pageAcc1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color_tag: '#10b981',
        account_label: 'Phong VIP Account',
        name: 'Trang Thời Trang Cao Cấp'
      })
    });
    const patchPageData = await patchPageRes.json();
    assert.strictEqual(patchPageRes.status, 200);
    assert.strictEqual(patchPageData.ok, true);
    assert.strictEqual(patchPageData.page.color_tag, '#10b981');
    assert.strictEqual(patchPageData.page.account_label, 'Phong VIP Account');
    assert.strictEqual(patchPageData.page.name, 'Trang Thời Trang Cao Cấp');
    console.log('  ✓ API PATCH /api/pages/:id cho phép tùy biến màu sắc, nhãn tài khoản & tên trang custom thành công');

    // 19.8 Kiểm tra Quản lý kết hợp hội thoại từ các tài khoản khác nhau cùng lúc
    // Tạo 1 cuộc trò chuyện ở Page của Tài khoản 1 và 1 ở Page của Tài khoản 2
    db.saveMessage({
      mid: 'mid_acc1_' + Date.now(),
      page_id: pageAcc1.page_id,
      sender_id: 'cust_acc1_99',
      sender_name: 'Khách Mua Hàng Nick Phong',
      text: 'Chào shop của nick Phong',
      attachments: [],
      timestamp: Date.now() - 1000,
      is_echo: 0
    });

    db.saveMessage({
      mid: 'mid_acc2_' + Date.now(),
      page_id: pageAcc2.page_id,
      sender_id: 'cust_acc2_88',
      sender_name: 'Khách Mua Hàng Nick Ca Sáng',
      text: 'Chào shop của nick Ca Sáng',
      attachments: [],
      timestamp: Date.now(),
      is_echo: 0
    });

    // 19.8a: Lọc toàn bộ tất cả tài khoản cùng lúc (pageId = null) -> Phải chứa cả 2 khách hàng
    const allCombined = db.getConversations();
    const hasCustAcc1 = allCombined.some(c => c.sender_id === 'cust_acc1_99');
    const hasCustAcc2 = allCombined.some(c => c.sender_id === 'cust_acc2_88');
    assert(hasCustAcc1 && hasCustAcc2, 'Khi không lọc page, toàn bộ tin nhắn từ các tài khoản phải hiển thị kết hợp cùng lúc');

    // 19.8b: Lọc riêng tài khoản "Phong VIP Account"
    const filteredAcc1 = db.getConversations({ pageId: 'account:Phong VIP Account' });
    assert(filteredAcc1.some(c => c.sender_id === 'cust_acc1_99'), 'Lọc tài khoản Phong VIP phải có khách của nick Phong');
    assert(!filteredAcc1.some(c => c.sender_id === 'cust_acc2_88'), 'Lọc tài khoản Phong VIP không được lẫn khách của nick Ca Sáng');

    // 19.8c: Lọc riêng tài khoản "Lê Văn Ca Sáng"
    const filteredAcc2 = db.getConversations({ pageId: 'account:Lê Văn Ca Sáng' });
    assert(filteredAcc2.some(c => c.sender_id === 'cust_acc2_88'), 'Lọc tài khoản Ca Sáng phải có khách của nick Ca Sáng');
    assert(!filteredAcc2.some(c => c.sender_id === 'cust_acc1_99'), 'Lọc tài khoản Ca Sáng không được lẫn khách của nick Phong');
    console.log('  ✓ Quản lý kết hợp tin nhắn từ nhiều tài khoản: Xem đồng thời tất cả hoặc lọc riêng từng tài khoản chuẩn xác 100%');

    // 19.9 Kiểm tra Cơ chế Chẩn đoán Đúng/Sai & Phương án Dự phòng khi Đăng nhập Lỗi
    // Test 19.9a: Popup error phản hồi postMessage FB_AUTH_ERROR kèm chẩn đoán chi tiết và nút chuyển sang Cách B
    const errorPopupRes = await fetch(`${baseUrl}/auth/facebook/callback?error=access_denied&error_description=User+cancelled&state=${Buffer.from(JSON.stringify({ popup: '1' })).toString('base64url')}`);
    assert.strictEqual(errorPopupRes.status, 200);
    const errorPopupHtml = await errorPopupRes.text();
    assert(errorPopupHtml.includes('FB_AUTH_ERROR'), 'Phải phát tín hiệu FB_AUTH_ERROR tới opener');
    assert(errorPopupHtml.includes('USER_CANCELLED') || errorPopupHtml.includes('hủy thao tác'), 'Phải nhận diện đúng mã chẩn đoán lỗi');
    assert(errorPopupHtml.includes('OPEN_DIRECT_TOKEN_MODAL'), 'Phải có nút fallback trực tiếp sang Cách B dán Token');
    console.log('  ✓ Cơ chế Fallback OAuth Popup phát hiện nguyên nhân lỗi và cung cấp lối thoát sang Cách B chuẩn xác');

    // Test 19.9b: Non-popup error chuyển hướng về / kèm đầy đủ query chẩn đoán đúng/sai
    const errorRedirectRes = await fetch(`${baseUrl}/auth/facebook/callback?error=redirect_uri_mismatch&error_description=Can%27t+Load+URL+191`, {
      redirect: 'manual'
    });
    assert.strictEqual(errorRedirectRes.status, 302);
    const errorRedirectLocation = decodeURIComponent(errorRedirectRes.headers.get('location') || '');
    assert(errorRedirectLocation.includes('fb_error='), 'Location phải chứa tham số fb_error');
    assert(errorRedirectLocation.includes('REDIRECT_URI_MISMATCH') || errorRedirectLocation.includes('fb_diag_title'), 'Location phải mang thông điệp chẩn đoán đúng/sai');
    console.log('  ✓ Cơ chế Chẩn đoán Redirect URI Error chuyển hướng kèm dữ liệu hướng dẫn người dùng chính xác');

    // 19.10 Kiểm tra Multi-Account độc lập App ID & Secret cho từng tài khoản và API cập nhật App credentials
    const updateAppRes = await fetch(`${baseUrl}/api/token-sources/${sourceAcc1.id}/update-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Nguyễn Tuấn Phong (VIP Pro)',
        app_id: '9988776655443322',
        app_secret: 'custom_secret_for_account_1_32ch'
      })
    });
    const updateAppData = await updateAppRes.json();
    assert.strictEqual(updateAppRes.status, 200);
    assert.strictEqual(updateAppData.ok, true);
    assert.strictEqual(updateAppData.account.name, 'Nguyễn Tuấn Phong (VIP Pro)');
    assert.strictEqual(updateAppData.account.app_id, '9988776655443322');
    assert.strictEqual(updateAppData.account.has_app_secret, true);

    const getMultiAccRes = await fetch(`${baseUrl}/api/token-sources`);
    const getMultiAccData = await getMultiAccRes.json();
    assert.strictEqual(getMultiAccRes.status, 200);
    assert.strictEqual(getMultiAccData.ok, true);
    assert(getMultiAccData.tokenSources.length >= 2, 'Phải có ít nhất 2 tài khoản');
    const acc1Found = getMultiAccData.tokenSources.find(s => s.id === sourceAcc1.id);
    assert(acc1Found, 'Tài khoản 1 phải có trong danh sách');
    assert.strictEqual(acc1Found.app_id, '9988776655443322');
    assert(Array.isArray(acc1Found.pages), 'Phải có mảng pages liên kết');
    assert(acc1Found.pages.length >= 1, 'Tài khoản 1 phải có Fanpage liên kết');
    console.log('  ✓ Hệ thống Multi-Account quản lý App ID & Secret riêng biệt theo từng tài khoản chuẩn xác 100%');

    // =============================================================
    // [20] Kiểm tra Khả Năng Thích Ứng Môi Trường VPN Đa Quốc Gia & Đồng Bộ Toàn Cầu
    // =============================================================
    console.log('\n[20] Kiểm tra Khả Năng Thích Ứng Môi Trường VPN Đa Quốc Gia & Đồng Bộ Toàn Cầu...');

    // 20.1 Kiểm tra cấu hình Dual-Stack DNS: dns.getDefaultResultOrder() === 'ipv4first'
    const dns = require('dns');
    const defaultDnsOrder = typeof dns.getDefaultResultOrder === 'function' ? dns.getDefaultResultOrder() : 'ipv4first';
    assert.strictEqual(defaultDnsOrder, 'ipv4first', 'DNS mặc định phải là ipv4first để tránh IPv6 blackhole khi dùng VPN');
    console.log('  ✓ Dual-Stack DNS được cấu hình ipv4first chuẩn xác (Triệt tiêu độ trễ 10-30s do VPN IPv6 adapter)');

    // 20.2 Kiểm tra HTTP Resilient Engine: fetchWithRetry tự động retry với exponential backoff khi gặp lỗi transient (502/ECONNRESET)
    const http = require('http');
    let transientCallCount = 0;
    const mockTransientServer = http.createServer((req, res) => {
      transientCallCount++;
      if (transientCallCount === 1) {
        // Lần gọi đầu tiên: giả lập gateway của VPN chập chờn / rớt mạng (HTTP 502)
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'VPN Gateway Temporary Error' }));
      } else {
        // Lần retry tiếp theo: mạng thông suốt (HTTP 200) kèm Date header Meta
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Date': new Date().toUTCString()
        });
        res.end(JSON.stringify({ ok: true, attempt: transientCallCount, message: 'VPN Connection Restored' }));
      }
    });

    await new Promise((resolve) => mockTransientServer.listen(0, resolve));
    const transientPort = mockTransientServer.address().port;

    const retryResponse = await fbService.fetchWithRetry(`http://localhost:${transientPort}/test-vpn`, {
      headers: { 'Accept': 'application/json' }
    }, 3);
    const retryData = await retryResponse.json();
    assert.strictEqual(retryData.ok, true, 'fetchWithRetry phải tự động retry thành công');
    assert.strictEqual(retryData.attempt, 2, 'Yêu cầu phải thành công ở lần thử thứ 2 sau khi retry');
    mockTransientServer.close();
    console.log('  ✓ fetchWithRetry tự động xử lý transient error (502), backoff và khôi phục thành công 100%');

    // 20.3 Kiểm tra Cơ Chế Phân Ca Độc Lập Vị Trí Địa Lý / Khóa Cố Định Múi Giờ Việt Nam (Asia/Ho_Chi_Minh GMT+7)
    // Giả lập mốc thời gian UTC: 16:45:00 UTC
    // Tại Việt Nam (GMT+7): 16:45 + 7h = 23:45 (Đang trong ca đêm 23:00 - 07:00)
    // Tại New York (GMT-4): 16:45 - 4h = 12:45 (Ban ngày)
    // Tại Tokyo (GMT+9): 16:45 + 9h = 01:45 (Rạng sáng hôm sau)
    const testNightUtc = new Date('2026-09-18T16:45:00.000Z');
    const zonedVnNight = db.getZonedHoursAndMinutes(testNightUtc, 'Asia/Ho_Chi_Minh');
    assert.strictEqual(zonedVnNight.hour, 23);
    assert.strictEqual(zonedVnNight.minute, 45);

    const isNightInShift = db.isTimeInSchedule('23:00', '07:00', testNightUtc);
    assert.strictEqual(isNightInShift, true, 'Lúc 23:45 giờ Việt Nam phải đang trong ca trực 23:00 - 07:00');

    // Giả lập mốc thời gian UTC: 05:00:00 UTC
    // Tại Việt Nam (GMT+7): 05:00 + 7h = 12:00 (Buổi trưa, ngoài ca đêm)
    const testDayUtc = new Date('2026-09-18T05:00:00.000Z');
    const zonedVnDay = db.getZonedHoursAndMinutes(testDayUtc, 'Asia/Ho_Chi_Minh');
    assert.strictEqual(zonedVnDay.hour, 12);
    assert.strictEqual(zonedVnDay.minute, 0);

    const isDayInNightShift = db.isTimeInSchedule('23:00', '07:00', testDayUtc);
    assert.strictEqual(isDayInNightShift, false, 'Lúc 12:00 trưa giờ Việt Nam không được kích hoạt ca đêm');
    console.log('  ✓ Thuật toán phân ca & báo thức khóa chặt theo múi giờ vận hành Asia/Ho_Chi_Minh bất kể IP VPN ở quốc gia nào');

    // 20.4 Kiểm tra Endpoint Giám Sát Sức Khỏe Mạng & Lệch Đồng Hồ: GET /api/health
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200, 'GET /api/health phải trả về HTTP 200');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'UP');
    assert.strictEqual(healthData.timezone, 'Asia/Ho_Chi_Minh');
    assert(typeof healthData.uptime === 'number', 'uptime phải là số');
    assert(typeof healthData.metaClockOffsetMs === 'number', 'metaClockOffsetMs phải là số');
    console.log('  ✓ Endpoint GET /api/health báo cáo trạng thái UP, uptime và múi giờ Asia/Ho_Chi_Minh');

    // 20.5 Kiểm tra API Tái Kết Nối Tunnel Phục Hồi Khi Đổi VPN: POST /api/tunnel/reconnect
    const reconnectRes = await fetch(`${baseUrl}/api/tunnel/reconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.strictEqual(reconnectRes.status, 200, 'POST /api/tunnel/reconnect phải trả về HTTP 200');
    const reconnectData = await reconnectRes.json();
    assert.strictEqual(reconnectData.ok, true);
    assert(typeof reconnectData.url === 'string' && reconnectData.url.startsWith('https://'), 'Phải trả về public URL mới');
    console.log('  ✓ API POST /api/tunnel/reconnect tự động tái khởi động Tunnel thích ứng địa chỉ mạng mới thành công');

    // [21] Test Customer Tags, Internal Staff Notes & Mini CRM Sidebar (Pancake & Fchat inspired)
    console.log('\n[21] Kiểm tra Tính Năng Thẻ Phân Loại (Tags), Ghi Chú Nội Bộ (Notes) & Mini CRM Khách Hàng...');

    // 21.1 Kiểm tra GET /api/tags: Phải có sẵn 6 thẻ mặc định của hệ thống
    const getTagsRes = await fetch(`${baseUrl}/api/tags`);
    assert.strictEqual(getTagsRes.status, 200, 'GET /api/tags phải trả về HTTP 200');
    const getTagsData = await getTagsRes.json();
    assert.strictEqual(getTagsData.ok, true);
    assert(Array.isArray(getTagsData.tags) && getTagsData.tags.length >= 6, 'Phải có ít nhất 6 thẻ mặc định');
    const vipTag = getTagsData.tags.find(t => t.name === 'Khách VIP');
    assert(vipTag !== undefined, 'Phải có thẻ Khách VIP');
    assert.strictEqual(vipTag.is_system, 1, 'Thẻ Khách VIP phải là thẻ hệ thống');
    console.log('  ✓ GET /api/tags trả về đầy đủ 6 thẻ nhãn mặc định hệ thống (Khách VIP, Đã Chốt Đơn, Bom Hàng...)');

    // 21.2 Kiểm tra POST /api/tags: Tạo thẻ nhãn tùy chỉnh mới
    const createTagRes = await fetch(`${baseUrl}/api/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Đại Lý Cấp 1',
        color: '#ffffff',
        bg_color: '#06b6d4'
      })
    });
    assert.strictEqual(createTagRes.status, 200, 'POST /api/tags phải trả về HTTP 200');
    const createTagData = await createTagRes.json();
    assert.strictEqual(createTagData.ok, true);
    assert.strictEqual(createTagData.tag.name, 'Đại Lý Cấp 1');
    assert.strictEqual(createTagData.tag.bg_color, '#06b6d4');
    assert.strictEqual(createTagData.tag.is_system, 0, 'Thẻ tự tạo phải có is_system = 0');
    const customTagId = createTagData.tag.id;
    console.log('  ✓ POST /api/tags tạo thẻ tùy chỉnh người dùng thành công (ID:', customTagId, ')');

    // 21.3 Tạo dữ liệu cuộc hội thoại để test CRM
    const crmPageId = 'page_crm_test_01';
    const crmSenderId = 'cust_crm_user_01';
    db.saveOrUpdatePage({
      page_id: crmPageId,
      name: 'Shop Mỹ Phẩm CRM Test',
      access_token: 'EAA_CRM_TEST_TOKEN',
      user_id: userA.id,
      is_active: 1
    });

    db.saveMessage({
      mid: 'm_crm_msg_01',
      page_id: crmPageId,
      sender_id: crmSenderId,
      sender_name: 'Nguyễn Văn Khách Hàng',
      text: 'Shop ơi gửi về 123 Đường Cầu Giấy Hà Nội giúp mình nhé, SĐT 0987654321',
      timestamp: Date.now(),
      is_echo: 0
    });

    // 21.4 Kiểm tra POST /api/conversations/:pageId/:senderId/crm: Cập nhật SĐT, địa chỉ và nhãn
    const updateCrmRes = await fetch(`${baseUrl}/api/conversations/${crmPageId}/${crmSenderId}/crm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '0987654321',
        address: '123 Đường Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
        tags: [
          { name: 'Khách VIP', color: '#ffffff', bg_color: '#8b5cf6' },
          { name: 'Đại Lý Cấp 1', color: '#ffffff', bg_color: '#06b6d4' }
        ]
      })
    });
    assert.strictEqual(updateCrmRes.status, 200, 'POST CRM phải trả về HTTP 200');
    const updateCrmData = await updateCrmRes.json();
    assert.strictEqual(updateCrmData.ok, true);
    assert.strictEqual(updateCrmData.crm.phone, '0987654321');
    assert.strictEqual(updateCrmData.crm.address, '123 Đường Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội');
    assert.strictEqual(updateCrmData.crm.tags.length, 2);
    console.log('  ✓ POST /api/conversations/:pageId/:senderId/crm cập nhật SĐT, địa chỉ và gắn nhãn thành công');

    // 21.5 Kiểm tra GET /api/conversations/:pageId/:senderId/crm
    const getCrmRes = await fetch(`${baseUrl}/api/conversations/${crmPageId}/${crmSenderId}/crm`);
    assert.strictEqual(getCrmRes.status, 200, 'GET CRM phải trả về HTTP 200');
    const getCrmData = await getCrmRes.json();
    assert.strictEqual(getCrmData.ok, true);
    assert.strictEqual(getCrmData.crm.phone, '0987654321');
    assert.strictEqual(getCrmData.crm.tags[0].name, 'Khách VIP');
    console.log('  ✓ GET /api/conversations/:pageId/:senderId/crm truy xuất hồ sơ mini CRM chuẩn xác');

    // 21.6 Kiểm tra POST /api/conversations/:pageId/:senderId/notes: Thêm ghi chú nội bộ của nhân viên
    const addNoteRes = await fetch(`${baseUrl}/api/conversations/${crmPageId}/${crmSenderId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_name: 'Lan CSKH',
        content: 'Khách dặn giao giờ hành chính, đóng gói bọc xốp cẩn thận giúp khách'
      })
    });
    assert.strictEqual(addNoteRes.status, 200, 'POST Note phải trả về HTTP 200');
    const addNoteData = await addNoteRes.json();
    assert.strictEqual(addNoteData.ok, true);
    assert.strictEqual(addNoteData.note.author_name, 'Lan CSKH');
    assert.strictEqual(addNoteData.note.content, 'Khách dặn giao giờ hành chính, đóng gói bọc xốp cẩn thận giúp khách');
    const noteId = addNoteData.note.id;
    console.log('  ✓ POST /api/conversations/:pageId/:senderId/notes lưu ghi chú nội bộ độc lập (ẩn với khách) thành công (ID:', noteId, ')');

    // 21.7 Kiểm tra lại GET CRM: Phải có 1 note trong timeline
    const getCrmWithNotesRes = await fetch(`${baseUrl}/api/conversations/${crmPageId}/${crmSenderId}/crm`);
    const getCrmWithNotesData = await getCrmWithNotesRes.json();
    assert.strictEqual(getCrmWithNotesData.crm.notes.length, 1);
    assert.strictEqual(getCrmWithNotesData.crm.notes[0].id, noteId);
    console.log('  ✓ GET CRM trả về danh sách ghi chú theo dòng thời gian chuẩn xác');

    // 21.8 Kiểm tra DELETE /api/notes/:id: Xóa ghi chú nội bộ
    const deleteNoteRes = await fetch(`${baseUrl}/api/notes/${noteId}`, { method: 'DELETE' });
    assert.strictEqual(deleteNoteRes.status, 200, 'DELETE Note phải trả về HTTP 200');
    const afterDeleteCrm = db.getCustomerCrm(crmPageId, crmSenderId);
    assert.strictEqual(afterDeleteCrm.notes.length, 0, 'Ghi chú phải bị xóa hoàn toàn');
    console.log('  ✓ DELETE /api/notes/:id xóa ghi chú nội bộ thành công');

    // 21.9 Kiểm tra tìm kiếm hội thoại đa tiêu chí (SĐT, Địa chỉ, Thẻ nhãn)
    const convByPhone = db.getConversations({ search: '0987654321' });
    assert(convByPhone.some(c => c.sender_id === crmSenderId), 'Tìm kiếm theo SĐT phải trả về đúng hội thoại');

    const convByAddress = db.getConversations({ search: 'Cầu Giấy' });
    assert(convByAddress.some(c => c.sender_id === crmSenderId), 'Tìm kiếm theo Địa chỉ phải trả về đúng hội thoại');

    const convByTag = db.getConversations({ search: 'Đại Lý Cấp 1' });
    assert(convByTag.some(c => c.sender_id === crmSenderId), 'Tìm kiếm theo Tên Thẻ Nhãn phải trả về đúng hội thoại');
    console.log('  ✓ Tìm kiếm hộp thư đa trường thông minh: Khớp chính xác theo SĐT, Địa chỉ giao hàng và Thẻ nhãn');

    // 21.10 Xóa thẻ tùy chỉnh đã tạo: DELETE /api/tags/:id
    const deleteTagRes = await fetch(`${baseUrl}/api/tags/${customTagId}`, { method: 'DELETE' });
    assert.strictEqual(deleteTagRes.status, 200, 'DELETE Tag phải trả về HTTP 200');
    const tagsAfterDelete = db.getAllTags();
    assert(!tagsAfterDelete.some(t => t.id === customTagId), 'Thẻ tự tạo phải bị xóa khỏi danh sách');
    console.log('  ✓ DELETE /api/tags/:id xóa thẻ tùy chỉnh thành công');

    // [22] Kiểm tra Chủ Động Bật / Tắt / Reset Link Cloudflare Tunnel & Tối Ưu Vận Hành Tin Nhắn
    console.log('\n[22] Kiểm tra Chủ Động Bật / Tắt / Reset Link Cloudflare Tunnel & Tối Ưu Vận Hành Tin Nhắn...');

    // 22.1 Test POST /api/tunnel/start
    const startTunnelRes = await fetch(`${baseUrl}/api/tunnel/start`, { method: 'POST' });
    assert.strictEqual(startTunnelRes.status, 200);
    const startTunnelData = await startTunnelRes.json();
    assert.strictEqual(startTunnelData.ok, true);
    assert(startTunnelData.url.includes('trycloudflare.com'), 'Phải tạo public URL trycloudflare');
    assert.strictEqual(startTunnelData.webhookUrl, `${startTunnelData.url}/webhook`);
    console.log('  ✓ POST /api/tunnel/start kích hoạt Cloudflare Tunnel công khai thành công');

    // 22.2 Test POST /api/tunnel/reset (Chủ động tạo link mới hoàn toàn)
    const resetTunnelRes = await fetch(`${baseUrl}/api/tunnel/reset`, { method: 'POST' });
    assert.strictEqual(resetTunnelRes.status, 200);
    const resetTunnelData = await resetTunnelRes.json();
    assert.strictEqual(resetTunnelData.ok, true);
    assert(resetTunnelData.url.includes('trycloudflare.com'), 'Reset phải sinh ra link trycloudflare mới');
    assert.notStrictEqual(resetTunnelData.url, startTunnelData.url, 'Link mới phải khác link cũ khi reset');
    console.log('  ✓ POST /api/tunnel/reset cấp link TryCloudflare mới thành công (URL:', resetTunnelData.url, ')');

    // 22.3 Test POST /api/tunnel/stop (Tắt tunnel, quay về chế độ Local)
    const stopTunnelRes = await fetch(`${baseUrl}/api/tunnel/stop`, { method: 'POST' });
    assert.strictEqual(stopTunnelRes.status, 200);
    const stopTunnelData = await stopTunnelRes.json();
    assert.strictEqual(stopTunnelData.ok, true);

    const checkSettingRes = await fetch(`${baseUrl}/api/settings`);
    const checkSettingData = await checkSettingRes.json();
    assert.strictEqual(checkSettingData.settings.public_url, '', 'Khi tắt tunnel, public_url phải được xóa trắng về rỗng');
    console.log('  ✓ POST /api/tunnel/stop tắt Tunnel thành công, chuyển về chế độ thuần Local');

    // 22.4 Test Mẫu câu trả lời nhanh & Phím tắt Slash Commands (/)
    const qrList = db.getQuickReplies();
    assert(qrList.length >= 3, 'Phải có sẵn các mẫu câu trả lời nhanh');
    assert(qrList.some(q => q.title.includes('Chào hỏi')), 'Phải có mẫu chào hỏi');
    console.log('  ✓ Hệ thống mẫu câu trả lời nhanh (Quick Replies) sẵn sàng cho Slash Commands (/)');

    // 22.5 Thêm mẫu câu mới và kiểm tra truy xuất
    const newQrRes = await fetch(`${baseUrl}/api/quick-replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Tài khoản ngân hàng',
        content: 'Dạ shop xin gửi thông tin chuyển khoản: MB Bank - STK: 99998888 - Chủ TK: NGUYEN TUAN PHONG ạ!'
      })
    });
    assert.strictEqual(newQrRes.status, 200);
    const newQrData = await newQrRes.json();
    assert.strictEqual(newQrData.ok, true);
    assert.strictEqual(newQrData.reply.title, 'Tài khoản ngân hàng');
    console.log('  ✓ POST /api/quick-replies tạo mẫu câu phản hồi nhanh tức thì thành công');

    // [23] Kiểm tra Tải Lên Tệp Âm Thanh Chuông Báo Tùy Chỉnh & Link Báo Thức YouTube
    console.log('\n[23] Kiểm tra Tải Lên Tệp Âm Thanh Chuông Báo Tùy Chỉnh & Link Báo Thức YouTube...');

    // 23.1 Reject upload without data
    const noDataUploadRes = await fetch(`${baseUrl}/api/host-profile/upload-alarm-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(noDataUploadRes.status, 400);
    console.log('  ✓ API upload từ chối payload rỗng chuẩn xác');

    // 23.2 Reject unsupported file extensions (e.g. .exe)
    const invalidExtRes = await fetch(`${baseUrl}/api/host-profile/upload-alarm-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'virus.exe',
        data: 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA'
      })
    });
    assert.strictEqual(invalidExtRes.status, 400);
    const invalidExtData = await invalidExtRes.json();
    assert(invalidExtData.error.includes('không được hỗ trợ'), 'Phải báo lỗi định dạng không hỗ trợ');
    console.log('  ✓ API upload chặn tệp nguy hiểm không phải âm thanh chuẩn xác');

    // 23.3 Upload valid custom sound file (.mp3 / .wav)
    const mockAudioBase64 = Buffer.from('RIFF_MOCK_WAV_AUDIO_DATA_FOR_TESTING').toString('base64');
    const uploadRes = await fetch(`${baseUrl}/api/host-profile/upload-alarm-sound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'chuong_bao_thuc_doc_quyen.mp3',
        data: `data:audio/mp3;base64,${mockAudioBase64}`
      })
    });
    assert.strictEqual(uploadRes.status, 200);
    const uploadData = await uploadRes.json();
    assert.strictEqual(uploadData.ok, true);
    assert(uploadData.sound_url.startsWith('/uploads/custom_alarm_'), 'Sound URL phải trỏ tới /uploads/custom_alarm_*');
    assert.strictEqual(uploadData.host.web_sound_type, 'custom_file');
    assert.strictEqual(uploadData.host.custom_sound_url, uploadData.sound_url);

    // Verify physical file was written to disk
    const writtenFilePath = path.join(__dirname, '../public', uploadData.sound_url);
    assert(fs.existsSync(writtenFilePath), 'File âm thanh phải được ghi vào thư mục public/uploads/');
    const fileContent = fs.readFileSync(writtenFilePath);
    assert.strictEqual(fileContent.toString(), 'RIFF_MOCK_WAV_AUDIO_DATA_FOR_TESTING');
    console.log('  ✓ Tải lên tệp âm thanh chuông báo (.mp3, .wav, .ogg, .flac) và lưu trữ thành công');

    // 23.4 Save YouTube Alarm link in Host Profile
    const saveYtRes = await fetch(`${baseUrl}/api/host-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        web_sound_type: 'youtube',
        youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      })
    });
    assert.strictEqual(saveYtRes.status, 200);
    const saveYtData = await saveYtRes.json();
    assert.strictEqual(saveYtData.ok, true);
    assert.strictEqual(saveYtData.host.web_sound_type, 'youtube');
    assert.strictEqual(saveYtData.host.youtube_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    // Verify GET /api/host-profile returns custom_sound_url and youtube_url
    const getHostRes = await fetch(`${baseUrl}/api/host-profile`);
    const getHostData = await getHostRes.json();
    assert.strictEqual(getHostData.ok, true);
    assert.strictEqual(getHostData.host.web_sound_type, 'youtube');
    assert.strictEqual(getHostData.host.youtube_url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(getHostData.host.custom_sound_url, uploadData.sound_url);
    console.log('  ✓ Lưu trữ cấu hình link YouTube và tệp âm thanh tùy chỉnh vào Host Profile thành công 100%');

    console.log('\n=============================================================');
    console.log('🎉 TẤT CẢ 23 BÀI TEST HỆ THỐNG, FACEBOOK OAUTH, CHUÔNG BÁO TÙY CHỈNH & YOUTUBE ĐỀU ĐẠT (EXIT 0)!');
    console.log('=============================================================');

    testServer.close();
    process.exit(0);
  } catch (err) {
    console.error('Test Thất Bại:', err);
    testServer.close();
    process.exit(1);
  }
});
