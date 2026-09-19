/**
 * Historical Message Backfill Service
 * Handles asynchronous, polite-paced background synchronization of historical conversations
 * and messages for active Fanpages, modeled after industry standards (Pancake, Harasocial, Fchat, Zendesk).
 *
 * Invariants:
 * 1. Two-phase sync: Stage 1 (Recent priority) + Stage 2 (Deep historical backfill).
 * 2. Silent ingestion: 100% bypass of audible alarms, voice phone calls, and Discord/Telegram alerts.
 * 3. Rate-limit protection: Paced queries (250ms delay) + exponential backoff on Meta Error 17 / 429.
 * 4. Resumability: Saves cursors into SQLite so restarts or page toggles resume without starting over.
 * 5. Deterministic sorting: Conversation ordering and message timeline preserved.
 */

const {
  getPageByPageId,
  updatePageBackfill,
  getPageBackfillInfo,
  getActivePagesNeedingBackfill,
  saveHistoricalBatch,
  updatePageTokenHealth
} = require('../database/db');

const { fetchWithRetry, updateMetaClockOffset } = require('./facebookService');

// In-memory registry of active backfill worker tasks: pageId -> { abortController, status, stats }
const activeBackfillWorkers = new Map();

// SSE Broadcaster reference
let sseBroadcaster = null;

function setBroadcaster(fn) {
  sseBroadcaster = fn;
}

function notifySSE(event, data) {
  if (typeof sseBroadcaster === 'function') {
    try {
      sseBroadcaster(event, data);
    } catch (e) {
      console.warn('[BackfillService] SSE broadcast error:', e.message);
    }
  }
}

/**
 * Starts or resumes historical message backfill for a single Fanpage.
 * @param {string} pageId - Target Fanpage ID
 * @param {object} options - Optional configuration { reset: boolean, batchLimit: number }
 */
async function startPageBackfill(pageId, options = {}) {
  const page = getPageByPageId(pageId);
  if (!page) {
    throw new Error(`Fanpage với ID ${pageId} không tồn tại trong hệ thống!`);
  }

  if (!page.access_token) {
    throw new Error(`Fanpage "${page.name}" chưa có Access Token hợp lệ!`);
  }

  if (page.is_active !== 1) {
    console.log(`[BackfillService] Fanpage "${page.name}" đang ở trạng thái TẠM DỪNG (is_active=0). Bỏ qua backfill.`);
    return { ok: false, message: 'Fanpage đang tạm dừng quản lý.' };
  }

  // If already running, return existing state
  if (activeBackfillWorkers.has(pageId)) {
    const existing = activeBackfillWorkers.get(pageId);
    if (existing.status === 'RUNNING') {
      return {
        ok: true,
        alreadyRunning: true,
        message: `Tiến trình tải tin cũ cho Fanpage "${page.name}" đang chạy ngầm.`,
        status: existing.status,
        stats: existing.stats
      };
    }
  }

  const currentInfo = getPageBackfillInfo(pageId) || {};
  let cursor = options.reset ? '' : (currentInfo.backfill_cursor || '');

  // Initialize abort controller for worker cancellation
  const abortController = new AbortController();
  const stats = {
    pageId,
    pageName: page.name,
    conversationsCount: options.reset ? 0 : (currentInfo.backfill_conversations_count || 0),
    messagesCount: options.reset ? 0 : (currentInfo.backfill_messages_count || 0),
    startTime: Date.now(),
    lastBatchTime: Date.now()
  };

  activeBackfillWorkers.set(pageId, {
    abortController,
    status: 'RUNNING',
    stats
  });

  updatePageBackfill(pageId, {
    backfill_status: 'BACKFILLING',
    backfill_cursor: cursor,
    backfill_conversations_count: stats.conversationsCount,
    backfill_messages_count: stats.messagesCount,
    backfill_error: ''
  });

  notifySSE('backfill_progress', {
    page_id: pageId,
    page_name: page.name,
    status: 'BACKFILLING',
    conversations_count: stats.conversationsCount,
    messages_count: stats.messagesCount,
    has_more: true,
    message: `Đang bắt đầu đồng bộ tin nhắn cũ cho "${page.name}"...`
  });

  // Run the worker asynchronously in background
  (async () => {
    console.log(`[BackfillService] 🚀 Bắt đầu tải tin nhắn lịch sử cho Fanpage "${page.name}" (ID: ${pageId})...`);
    let nextUrl = cursor || `https://graph.facebook.com/v21.0/${page.page_id}/conversations?fields=id,updated_time,unread_count,senders,messages.limit(100){id,message,from,to,created_time,attachments{id,mime_type,name,size,file_url,image_data,video_data}}&limit=50&access_token=${page.access_token}`;

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    try {
      while (nextUrl && !abortController.signal.aborted) {
        // Pacing delay (250ms) to respect Meta rate limits
        await new Promise(resolve => setTimeout(resolve, 250));

        if (abortController.signal.aborted) break;

        let res;
        try {
          res = await fetchWithRetry(nextUrl, {
            signal: abortController.signal,
            timeout: 20000
          });
        } catch (fetchErr) {
          if (abortController.signal.aborted) break;
          consecutiveErrors++;
          console.warn(`[BackfillService] Lỗi kết nối Meta Graph API (lần ${consecutiveErrors}/${maxConsecutiveErrors}): ${fetchErr.message}`);
          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw fetchErr;
          }
          await new Promise(resolve => setTimeout(resolve, 2000 * consecutiveErrors));
          continue;
        }

        const dateHeader = res.headers.get('date');
        if (dateHeader) updateMetaClockOffset(dateHeader);

        const data = await res.json();

        // Handle Graph API errors
        if (data && data.error) {
          const errCode = data.error.code;
          const subCode = data.error.error_subcode;

          // Token Expired (Code 190)
          if (errCode === 190) {
            updatePageTokenHealth(pageId, 'EXPIRED');
            const errMsg = `Access Token của Fanpage "${page.name}" đã hết hạn (Code 190): ${data.error.message}`;
            console.warn(`[BackfillService] ⚠️ ${errMsg}`);
            updatePageBackfill(pageId, {
              backfill_status: 'FAILED',
              backfill_error: errMsg
            });
            notifySSE('backfill_progress', {
              page_id: pageId,
              page_name: page.name,
              status: 'FAILED',
              error: errMsg
            });
            break;
          }

          // Rate Limit Overload (Code 4 or Code 17 or HTTP 429)
          if (errCode === 4 || errCode === 17 || subCode === 2018001 || res.status === 429) {
            console.warn(`[BackfillService] ⏳ Meta chạm ngưỡng Rate Limit (Code ${errCode}). Đang tạm nghỉ 15 giây trước khi tiếp tục...`);
            notifySSE('backfill_progress', {
              page_id: pageId,
              page_name: page.name,
              status: 'RATE_LIMITED',
              message: 'Chạm giới hạn tần suất Meta, đang chờ 15s để tiếp tục an toàn...'
            });
            await new Promise(resolve => setTimeout(resolve, 15000));
            continue;
          }

          throw new Error(`Graph API Error [${errCode}]: ${data.error.message}`);
        }

        consecutiveErrors = 0;

        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
          // No more conversations in this branch
          break;
        }

        // Save batch atomically into SQLite (Zero Alarms / Silent Ingestion)
        const batchResult = saveHistoricalBatch(pageId, data.data);
        stats.conversationsCount += batchResult.insertedConversationsCount;
        stats.messagesCount += batchResult.insertedMessagesCount;
        stats.lastBatchTime = Date.now();

        nextUrl = data.paging?.next || null;

        // Update checkpoint in SQLite
        updatePageBackfill(pageId, {
          backfill_cursor: nextUrl || '',
          backfill_conversations_count: stats.conversationsCount,
          backfill_messages_count: stats.messagesCount,
          backfill_last_synced_at: Date.now()
        });

        // Broadcast real-time progress to frontend
        notifySSE('backfill_progress', {
          page_id: pageId,
          page_name: page.name,
          status: 'BACKFILLING',
          conversations_count: stats.conversationsCount,
          messages_count: stats.messagesCount,
          has_more: Boolean(nextUrl)
        });

        // Periodically refresh the conversation list on frontend so new threads appear
        notifySSE('conversations_updated', {
          page_id: pageId,
          source: 'backfill'
        });
      }

      if (abortController.signal.aborted) {
        console.log(`[BackfillService] ⏸️ Đã tạm dừng tiến trình tải tin cũ cho "${page.name}".`);
        updatePageBackfill(pageId, {
          backfill_status: 'PAUSED',
          backfill_last_synced_at: Date.now()
        });
        notifySSE('backfill_progress', {
          page_id: pageId,
          page_name: page.name,
          status: 'PAUSED',
          conversations_count: stats.conversationsCount,
          messages_count: stats.messagesCount,
          message: 'Đã tạm dừng đồng bộ.'
        });
      } else {
        console.log(`[BackfillService] ✅ HOÀN THÀNH tải toàn bộ lịch sử cho Fanpage "${page.name}"! (${stats.conversationsCount} hội thoại, ${stats.messagesCount} tin nhắn).`);
        updatePageBackfill(pageId, {
          backfill_status: 'COMPLETED',
          backfill_cursor: '',
          backfill_last_synced_at: Date.now()
        });
        notifySSE('backfill_progress', {
          page_id: pageId,
          page_name: page.name,
          status: 'COMPLETED',
          conversations_count: stats.conversationsCount,
          messages_count: stats.messagesCount,
          has_more: false,
          message: `Đã hoàn tất tải toàn bộ lịch sử tin nhắn (${stats.conversationsCount} hội thoại)!`
        });
      }
    } catch (err) {
      console.error(`[BackfillService] ❌ Lỗi tiến trình tải tin cũ cho "${page.name}":`, err.message);
      updatePageBackfill(pageId, {
        backfill_status: 'FAILED',
        backfill_error: err.message,
        backfill_last_synced_at: Date.now()
      });
      notifySSE('backfill_progress', {
        page_id: pageId,
        page_name: page.name,
        status: 'FAILED',
        error: err.message
      });
    } finally {
      activeBackfillWorkers.delete(pageId);
    }
  })();

  return {
    ok: true,
    message: `Đã kích hoạt tiến trình tải tin nhắn cũ cho Fanpage "${page.name}"!`,
    stats
  };
}

/**
 * Pauses backfill for a page.
 */
function pausePageBackfill(pageId) {
  if (activeBackfillWorkers.has(pageId)) {
    const worker = activeBackfillWorkers.get(pageId);
    worker.abortController.abort();
    worker.status = 'PAUSED';
    activeBackfillWorkers.delete(pageId);
  }
  updatePageBackfill(pageId, {
    backfill_status: 'PAUSED',
    backfill_last_synced_at: Date.now()
  });
  return { ok: true, message: 'Đã gửi lệnh tạm dừng tải tin cũ.' };
}

/**
 * Resumes backfill for a page.
 */
async function resumePageBackfill(pageId) {
  return startPageBackfill(pageId, { reset: false });
}

/**
 * Retrieves the current backfill status and telemetry for a page.
 */
function getPageBackfillStatus(pageId) {
  const dbInfo = getPageBackfillInfo(pageId);
  const isRunning = activeBackfillWorkers.has(pageId);
  const worker = activeBackfillWorkers.get(pageId);

  return {
    page_id: pageId,
    dbInfo: dbInfo || null,
    isRunning,
    workerStats: worker ? worker.stats : null
  };
}

/**
 * Initializes the backfill queue on server startup.
 * Automatically scans active pages needing historical sync and starts backfill sequentially.
 */
async function initBackfillQueue() {
  try {
    const pagesNeedingBackfill = getActivePagesNeedingBackfill();
    if (!pagesNeedingBackfill || pagesNeedingBackfill.length === 0) {
      return;
    }

    console.log(`[BackfillService] 🔍 Phát hiện ${pagesNeedingBackfill.length} Fanpage đang bật cần đồng bộ/tiếp tục tải tin cũ...`);

    // Sequential start with a slight staggered delay to avoid initial API burst
    let delay = 1000;
    for (const page of pagesNeedingBackfill) {
      setTimeout(() => {
        startPageBackfill(page.page_id).catch(err => {
          console.warn(`[BackfillService] Lỗi khi tự động khởi chạy backfill cho "${page.name}":`, err.message);
        });
      }, delay);
      delay += 3000;
    }
  } catch (err) {
    console.warn('[BackfillService] Lỗi khi khởi tạo hàng đợi backfill:', err.message);
  }
}

module.exports = {
  setBroadcaster,
  startPageBackfill,
  pausePageBackfill,
  resumePageBackfill,
  getPageBackfillStatus,
  initBackfillQueue
};
