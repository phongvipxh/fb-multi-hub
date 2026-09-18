// ========================================================
// FB MULTI-HUB - SINGLE-HOST ADMIN APPLICATION CONTROLLER
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
  // Global Application State (Single-Host Model)
  let hostProfile = null;
  let activeConversation = null; // { page_id, sender_id }
  let quickRepliesList = [];
  let currentFilter = 'all'; // 'all' | 'unreplied'
  let sseSource = null;
  let discoveredPagesCache = [];

  // -------------------------------------------------------------
  // 1. Web Audio Alarm Engine (Synthesized Loud Chime & Ringtone Engine)
  // -------------------------------------------------------------
  class WebAudioAlarmEngine {
    constructor() {
      this.audioCtx = null;
      this.compressor = null;
      this.masterGain = null;
      this.isPlaying = false;
      this.intervalId = null;
    }

    init() {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (!this.compressor) {
        // High-loudness audio compressor to maximize RMS loudness without clipping distortion
        this.compressor = this.audioCtx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, this.audioCtx.currentTime);
        this.compressor.knee.setValueAtTime(30, this.audioCtx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.audioCtx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

        this.masterGain = this.audioCtx.createGain();
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.audioCtx.destination);
      }
    }

    playSingleChime(volume = 1.0, soundType = 'loud_chime') {
      try {
        this.init();
        if (!this.audioCtx) return;

        // Apply master gain with boost capability (up to 150%)
        const effectiveVol = Math.max(0.1, volume);
        this.masterGain.gain.setValueAtTime(effectiveVol * 1.5, this.audioCtx.currentTime);

        const now = this.audioCtx.currentTime;

        switch (soundType) {
          case 'phone_ring':
            this._synthPhoneRing(now);
            break;
          case 'digital_alarm':
            this._synthDigitalAlarm(now);
            break;
          case 'siren':
            this._synthEmergencySiren(now);
            break;
          case 'loud_chime':
          default:
            this._synthLoudChime(now);
            break;
        }
      } catch (err) {
        console.warn('[WebAudio] Play chime error:', err);
      }
    }

    // 1. Chuông Đôi Ngân Vang Đanh To (High-Penetration Dual Bell)
    // 2 hồi chuông: Bính (B5) -> BOONG (E6/B6) với âm sắc giàu bồi âm metallic, ngân vang rõ nét
    _synthLoudChime(t0) {
      const playBellNote = (time, freq, decay = 0.9, amp = 0.95) => {
        const osc1 = this.audioCtx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, time);

        const osc2 = this.audioCtx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(freq * 2.01, time);

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq * 1.5, time);
        filter.Q.setValueAtTime(2.2, time);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(amp, time + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

        osc1.connect(gain);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + decay);
        osc2.stop(time + decay);
      };

      playBellNote(t0, 987.77, 0.9, 0.85);        // Bell 1: B5
      playBellNote(t0 + 0.18, 1318.51, 1.3, 1.0); // Bell 2: E6 (Loud resonant resolution)
      playBellNote(t0 + 0.18, 1975.53, 1.0, 0.5); // High sparkle B6
    }

    // 2. Chuông Điện Thoại Réo Rắt (Urgent Telephone Ringtone)
    // 2 nhịp chuông réo rắt dồn dập như cuộc gọi đến
    _synthPhoneRing(t0) {
      const playRingBurst = (time, duration = 0.42) => {
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const tremolo = this.audioCtx.createOscillator();
        const tremGain = this.audioCtx.createGain();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(853, time);
        osc2.frequency.setValueAtTime(960, time);

        tremolo.type = 'square';
        tremolo.frequency.setValueAtTime(24, time);
        tremGain.gain.setValueAtTime(0.4, time);
        tremolo.connect(tremGain);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.95, time + 0.02);
        gain.gain.setValueAtTime(0.95, time + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.compressor);

        osc1.start(time);
        osc2.start(time);
        tremolo.start(time);
        osc1.stop(time + duration);
        osc2.stop(time + duration);
        tremolo.stop(time + duration);
      };

      playRingBurst(t0, 0.38);
      playRingBurst(t0 + 0.52, 0.48);
    }

    // 3. Đồng Hồ Điện Tử Bíp Dồn Dập (Crisp 2.6kHz Digital Beep Alarm)
    // Tần số cực kỳ nhạy bén với màng nhĩ tai người
    _synthDigitalAlarm(t0) {
      const beeps = [0, 0.12, 0.24, 0.36];
      beeps.forEach((offset, idx) => {
        const time = t0 + offset;
        const dur = idx === 3 ? 0.14 : 0.08;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(2600, time);

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2600, time);
        filter.Q.setValueAtTime(3.5, time);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(1.0, time + 0.005);
        gain.gain.setValueAtTime(1.0, time + dur - 0.01);
        gain.gain.linearRampToValueAtTime(0.001, time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);

        osc.start(time);
        osc.stop(time + dur);
      });
    }

    // 4. Còi Hú Khẩn Cấp (High-Low Emergency Siren)
    // Tông đan xen dồn dập, đánh thức ca đêm
    _synthEmergencySiren(t0) {
      const notes = [
        { offset: 0, freq: 850, dur: 0.18 },
        { offset: 0.2, freq: 1350, dur: 0.18 },
        { offset: 0.4, freq: 850, dur: 0.18 },
        { offset: 0.6, freq: 1350, dur: 0.18 },
        { offset: 0.8, freq: 850, dur: 0.25 },
        { offset: 1.08, freq: 1350, dur: 0.35 }
      ];

      notes.forEach(({ offset, freq, dur }) => {
        const time = t0 + offset;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, time);

        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.9, time + 0.01);
        gain.gain.setValueAtTime(0.9, time + dur - 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.compressor);

        osc.start(time);
        osc.stop(time + dur);
      });
    }

    startContinuousAlarm(volume = 1.0, soundType = 'loud_chime') {
      if (this.isPlaying) return;
      this.init();
      this.isPlaying = true;

      // Play immediate chime
      this.playSingleChime(volume, soundType);

      // Repeat chime every 1.8 seconds
      this.intervalId = setInterval(() => {
        if (!this.isPlaying) {
          clearInterval(this.intervalId);
          return;
        }
        this.playSingleChime(volume, soundType);
      }, 1800);

      // Show Emergency Alarm Bar
      const alarmBar = document.getElementById('emergencyAlarmBar');
      if (alarmBar) alarmBar.style.display = 'flex';
    }

    stopContinuousAlarm() {
      this.isPlaying = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      const alarmBar = document.getElementById('emergencyAlarmBar');
      if (alarmBar) alarmBar.style.display = 'none';
    }
  }

  const alarmAudioEngine = new WebAudioAlarmEngine();

  // Desktop Web Notification
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: 'https://static.xx.fbcdn.net/rsrc.php/v3/y2/r/yvbOx5gahcW.png'
        });
      } catch (e) {}
    }
  }

  // Live Header Clock (Locked to Operational Timezone: Asia/Ho_Chi_Minh)
  function startLiveClock() {
    const clockEl = document.getElementById('headerLiveClock');
    if (!clockEl) return;
    const update = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) + ' (VN GMT+7)';
    };
    update();
    setInterval(update, 1000);
  }
  startLiveClock();

  // Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
  }

  // -------------------------------------------------------------
  // 2. Standardized Modal Dialogs System
  // -------------------------------------------------------------
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  function stopLightboxMedia() {
    const video = document.getElementById('lightboxVideo');
    if (video) {
      video.pause();
      video.src = '';
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (modalId === 'imageLightboxModal') {
      stopLightboxMedia();
    }
    modal.classList.remove('show');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 150);
  }

  function closeAllModals() {
    stopLightboxMedia();
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 150);
    });
  }

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  // Close modal when clicking directly on backdrop
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop.id);
      }
    });
  });

  // Wire close buttons
  document.getElementById('closeAddPageModalBtn')?.addEventListener('click', () => closeModal('addPageModal'));
  document.getElementById('cancelAddPageBtn')?.addEventListener('click', () => closeModal('addPageModal'));

  document.getElementById('closeQrModalBtn')?.addEventListener('click', () => closeModal('quickReplyModal'));
  document.getElementById('cancelQrBtn')?.addEventListener('click', () => closeModal('quickReplyModal'));

  document.getElementById('closeSupabaseModalBtn')?.addEventListener('click', () => closeModal('supabaseSchemaModal'));
  document.getElementById('closeSupabaseModalFooterBtn')?.addEventListener('click', () => closeModal('supabaseSchemaModal'));
  document.getElementById('closeLightboxBtn')?.addEventListener('click', () => closeModal('imageLightboxModal'));
  document.getElementById('lightboxBody')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightboxBody') {
      closeModal('imageLightboxModal');
    }
  });

  // Global Lightbox & Media Dialog Function (Image with Zoom & Video)
  let lightboxZoomLevel = 1.0;

  function updateLightboxZoom(scale) {
    lightboxZoomLevel = Math.max(0.4, Math.min(3.0, scale));
    const img = document.getElementById('lightboxImage');
    if (img) {
      img.style.transform = `scale(${lightboxZoomLevel})`;
      img.style.transformOrigin = 'center center';
    }
  }

  document.getElementById('lightboxZoomInBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateLightboxZoom(lightboxZoomLevel + 0.25);
  });

  document.getElementById('lightboxZoomOutBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateLightboxZoom(lightboxZoomLevel - 0.25);
  });

  document.getElementById('lightboxResetZoomBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateLightboxZoom(1.0);
  });

  window.openMediaLightbox = function(url, type = 'image', title = 'Tệp đính kèm') {
    const modal = document.getElementById('imageLightboxModal');
    const img = document.getElementById('lightboxImage');
    const video = document.getElementById('lightboxVideo');
    const iconEl = document.getElementById('lightboxMediaIcon');
    const titleEl = document.getElementById('lightboxTitle');
    const dlBtn = document.getElementById('lightboxDownloadBtn');
    const openBtn = document.getElementById('lightboxOpenTabBtn');
    const zoomControls = document.getElementById('lightboxZoomControls');

    if (!modal) return;

    if (titleEl) titleEl.textContent = title;
    if (dlBtn) dlBtn.href = url;
    if (openBtn) openBtn.href = url;

    updateLightboxZoom(1.0);

    if (type === 'video') {
      if (iconEl) iconEl.textContent = '🎥';
      if (img) {
        img.style.display = 'none';
        img.src = '';
      }
      if (zoomControls) zoomControls.style.display = 'none';
      if (video) {
        video.style.display = 'block';
        video.src = url;
        video.load();
        video.play().catch(() => {});
      }
    } else {
      if (iconEl) iconEl.textContent = '🖼️';
      if (video) {
        video.pause();
        video.style.display = 'none';
        video.src = '';
      }
      if (zoomControls) zoomControls.style.display = 'inline-flex';
      if (img) {
        img.style.display = 'block';
        img.src = url;
      }
    }

    openModal('imageLightboxModal');
  };

  // Backwards compatibility alias
  window.openImageLightbox = function(url, title = 'Ảnh đính kèm') {
    window.openMediaLightbox(url, 'image', title);
  };

  // -------------------------------------------------------------
  // Messenger-Style Voice Note Engine Helpers
  // -------------------------------------------------------------
  function formatAudioTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  window.toggleVoicePlay = function(btn, uid) {
    const audio = document.getElementById(`audio-${uid}`);
    const card = document.getElementById(`card-${uid}`);
    const prog = document.getElementById(`prog-${uid}`);
    const timeEl = document.getElementById(`time-${uid}`);

    if (!audio || !card) return;

    if (!audio.paused) {
      audio.pause();
      card.classList.remove('playing');
      btn.classList.remove('playing');
      btn.innerHTML = '<span class="play-icon">▶</span>';
      return;
    }

    // Stop any other currently playing voice notes
    document.querySelectorAll('.voice-hidden-audio').forEach(a => {
      if (a !== audio && !a.paused) {
        a.pause();
      }
    });
    document.querySelectorAll('.voice-player-card.playing').forEach(c => {
      if (c !== card) c.classList.remove('playing');
    });
    document.querySelectorAll('.voice-play-btn.playing').forEach(b => {
      if (b !== btn) {
        b.classList.remove('playing');
        b.innerHTML = '<span class="play-icon">▶</span>';
      }
    });

    // Wire listeners once
    if (!audio.dataset.wired) {
      audio.dataset.wired = 'true';

      audio.addEventListener('loadedmetadata', () => {
        if (timeEl && audio.duration) {
          timeEl.textContent = formatAudioTime(audio.duration);
        }
      });

      audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (prog) prog.style.width = `${pct}%`;
        if (timeEl) {
          timeEl.textContent = `${formatAudioTime(audio.currentTime)} / ${formatAudioTime(audio.duration)}`;
        }
      });

      audio.addEventListener('ended', () => {
        card.classList.remove('playing');
        btn.classList.remove('playing');
        btn.innerHTML = '<span class="play-icon">▶</span>';
        if (prog) prog.style.width = '0%';
        if (timeEl && audio.duration) {
          timeEl.textContent = formatAudioTime(audio.duration);
        }
      });
    }

    audio.play().then(() => {
      card.classList.add('playing');
      btn.classList.add('playing');
      btn.innerHTML = '<span class="play-icon">⏸</span>';
    }).catch(err => {
      console.warn('[VoicePlayer] Play error:', err);
    });
  };

  window.seekVoiceAudio = function(e, uid) {
    const audio = document.getElementById(`audio-${uid}`);
    if (!audio || !audio.duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = ratio * audio.duration;
  };

  window.changeVoiceSpeed = function(btn, uid) {
    const audio = document.getElementById(`audio-${uid}`);
    if (!audio) return;

    let rate = audio.playbackRate || 1.0;
    let nextRate = 1.0;
    if (rate === 1.0) nextRate = 1.5;
    else if (rate === 1.5) nextRate = 2.0;
    else nextRate = 1.0;

    audio.playbackRate = nextRate;
    btn.textContent = `${nextRate}x`;
  };

  // Emergency Alarm Bar actions
  document.getElementById('dismissAlarmBtn')?.addEventListener('click', () => {
    alarmAudioEngine.stopContinuousAlarm();
    showToast('Đã tắt chuông báo thức.', 'info');
  });

  document.getElementById('snoozeAlarmBtn')?.addEventListener('click', () => {
    alarmAudioEngine.stopContinuousAlarm();
    showToast('Đã hoãn báo thức. Sẽ báo lại sau 5 phút nếu vẫn có tin nhắn mới.', 'info');
    setTimeout(() => {
      if (hostProfile && hostProfile.alarm_enabled === 'true') {
        alarmAudioEngine.startContinuousAlarm(getEffectiveVolume(), getEffectiveSoundType());
      }
    }, 5 * 60 * 1000);
  });

  // -------------------------------------------------------------
  // 3. Navigation Rail & Views Routing
  // -------------------------------------------------------------
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const views = document.querySelectorAll('.app-view');
  const viewTitleEl = document.getElementById('currentViewTitle');
  const viewBreadcrumbEl = document.getElementById('currentViewBreadcrumb');

  const viewMeta = {
    'view-inbox': { title: 'Hộp Thư Tin Nhắn', breadcrumb: 'Hội thoại trực tiếp & Lịch sử trao đổi đa Fanpage' },
    'view-pages': { title: 'Quản Lý Fanpage', breadcrumb: 'Danh sách Fanpage của bạn, Sức khỏe Token & Thêm mới' },
    'view-shifts': { title: 'Lịch Trực Ca Của Tôi', breadcrumb: 'Cài đặt khung giờ trực ca của chính bạn cho từng Fanpage' },
    'view-alarms': { title: 'Cài Đặt Báo Thức', breadcrumb: 'Tùy chỉnh chuông Web Audio, CallMeBot & Lịch sử chuông của bạn' },
    'view-templates': { title: 'Mẫu Trả Lời Nhanh', breadcrumb: 'Mẫu câu phản hồi có sẵn cho bạn tư vấn khách hàng' },
    'view-webhook': { title: 'Meta Webhook & Cloud', breadcrumb: 'Kết nối Meta Developer Portal cho instance độc lập' },
    'view-guide': { title: 'Hướng Dẫn Vận Hành', breadcrumb: 'Quy trình vận hành công cụ cho người tự host' }
  };

  function switchView(targetViewId) {
    navItems.forEach(item => {
      if (item.dataset.view === targetViewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    views.forEach(v => {
      if (v.id === targetViewId) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    if (viewMeta[targetViewId]) {
      if (viewTitleEl) viewTitleEl.textContent = viewMeta[targetViewId].title;
      if (viewBreadcrumbEl) viewBreadcrumbEl.textContent = viewMeta[targetViewId].breadcrumb;
    }

    // Refresh data based on view
    if (targetViewId === 'view-inbox') {
      loadConversations();
    } else if (targetViewId === 'view-pages') {
      loadPages();
    } else if (targetViewId === 'view-shifts') {
      loadMyShifts();
      loadPages();
    } else if (targetViewId === 'view-alarms') {
      loadHostProfile();
      loadAlarmLogs();
    } else if (targetViewId === 'view-templates') {
      loadQuickRepliesTable();
    } else if (targetViewId === 'view-webhook') {
      loadSystemSettings();
    }
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;
      switchView(targetView);
    });
  });

  // -------------------------------------------------------------
  // 4. Host Profile Management (Single-Host Admin)
  // -------------------------------------------------------------
  async function loadHostProfile() {
    try {
      const res = await fetch('/api/host-profile');
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        renderHostUI(hostProfile);
      }
    } catch (err) {
      console.error('Error loading host profile:', err);
    }
  }

  function renderHostUI(host) {
    // Sidebar Host Info
    const hostNameEl = document.getElementById('sidebarHostName');
    if (hostNameEl) hostNameEl.textContent = host.name || 'Chủ Host';

    const hostAvatarEl = document.getElementById('sidebarHostAvatar');
    if (hostAvatarEl) {
      hostAvatarEl.style.backgroundColor = host.color_tag || '#3b82f6';
      hostAvatarEl.textContent = (host.name || 'C').charAt(0).toUpperCase();
    }

    // Quick Buttons State
    updateQuickControlsUI(host);

    // Form inputs in View 4 (Cài đặt báo thức)
    const nameInput = document.getElementById('hostProfileName');
    if (nameInput) nameInput.value = host.name || '';

    const pinInput = document.getElementById('hostProfilePin');
    if (pinInput) pinInput.value = host.pin_code || '1234';

    const webSoundToggle = document.getElementById('hostWebSoundToggle');
    if (webSoundToggle) webSoundToggle.checked = host.web_sound_enabled === 'true';

    const webSoundVol = document.getElementById('hostWebSoundVolume');
    if (webSoundVol) {
      webSoundVol.value = host.web_sound_volume || 100;
      const valEl = document.getElementById('webSoundVolumeVal');
      if (valEl) valEl.textContent = (host.web_sound_volume || 100) + '%';
    }

    const webSoundType = document.getElementById('hostWebSoundType');
    if (webSoundType) {
      webSoundType.value = host.web_sound_type || 'loud_chime';
    }

    const alarmEnabledToggle = document.getElementById('hostAlarmEnabledToggle');
    if (alarmEnabledToggle) alarmEnabledToggle.checked = host.alarm_enabled === 'true';

    const alarmScheduleToggle = document.getElementById('hostAlarmScheduleToggle');
    if (alarmScheduleToggle) alarmScheduleToggle.checked = host.alarm_schedule_enabled === 'true';

    const startTimeInput = document.getElementById('hostAlarmStartTime');
    if (startTimeInput) startTimeInput.value = host.alarm_start_time || '23:00';

    const endTimeInput = document.getElementById('hostAlarmEndTime');
    if (endTimeInput) endTimeInput.value = host.alarm_end_time || '07:00';

    const teleEnabledToggle = document.getElementById('hostTelegramEnabledToggle');
    if (teleEnabledToggle) teleEnabledToggle.checked = host.telegram_enabled === 'true';

    const teleChatId = document.getElementById('hostTelegramChatId');
    if (teleChatId) teleChatId.value = host.telegram_chat_id || '';

    const teleBotToken = document.getElementById('hostTelegramBotToken');
    if (teleBotToken) teleBotToken.value = host.telegram_bot_token || '';

    const teleApiRoot = document.getElementById('hostTelegramApiRoot');
    if (teleApiRoot) {
      fetch('/api/settings').then(r => r.json()).then(d => {
        if (d.ok && d.settings && d.settings.telegram_api_root) {
          teleApiRoot.value = d.settings.telegram_api_root;
        }
      }).catch(() => {});
    }

    // Alarm Method
    const method = host.alarm_method || 'ntfy';
    const radio = document.querySelector(`input[name="hostAlarmMethod"][value="${method}"]`);
    if (radio) radio.checked = true;
    toggleAlarmMethodPanes(method);

    const ntfyTopicInput = document.getElementById('hostNtfyTopic');
    if (ntfyTopicInput) ntfyTopicInput.value = host.ntfy_topic || 'fb-alarm-0976014480';

    const callmebotInput = document.getElementById('hostCallmebotUsername');
    if (callmebotInput) callmebotInput.value = host.callmebot_username || '';

    const twilioInput = document.getElementById('hostTwilioToNumber');
    if (twilioInput) twilioInput.value = host.twilio_to_number || '0976014480';

    const twilioSid = document.getElementById('hostTwilioAccountSid');
    if (twilioSid) twilioSid.value = host.twilio_account_sid || '';

    const twilioAuth = document.getElementById('hostTwilioAuthToken');
    if (twilioAuth) twilioAuth.value = host.twilio_auth_token || '';

    const twilioFrom = document.getElementById('hostTwilioFromNumber');
    if (twilioFrom) twilioFrom.value = host.twilio_from_number || '';

    const discordToggle = document.getElementById('hostDiscordEnabledToggle');
    if (discordToggle) discordToggle.checked = host.discord_enabled !== 'false';

    const discordWebhookUrl = document.getElementById('hostDiscordWebhookUrl');
    if (discordWebhookUrl) discordWebhookUrl.value = host.discord_webhook_url || '';

    // Card 4: Tự Động Đi Ngủ Khi Treo Máy
    const autoSleepToggle = document.getElementById('hostAutoSleepEnabledToggle');
    if (autoSleepToggle) autoSleepToggle.checked = host.auto_sleep_enabled !== 'false';

    const autoSleepMinutes = document.getElementById('hostAutoSleepIdleMinutes');
    if (autoSleepMinutes) autoSleepMinutes.value = host.auto_sleep_idle_minutes || '10';

    // Card 5: Báo Động An Toàn Khi Quên Trả Lời
    const safetyAlarmToggle = document.getElementById('hostSafetyAlarmEnabledToggle');
    if (safetyAlarmToggle) safetyAlarmToggle.checked = host.safety_alarm_enabled !== 'false';

    const safetyAlarmMinutes = document.getElementById('hostSafetyAlarmDelayMinutes');
    if (safetyAlarmMinutes) safetyAlarmMinutes.value = host.safety_alarm_delay_minutes || '10';

    loadStatus();
  }

  function updateQuickControlsUI(host) {
    const isSleeping = host.alarm_enabled === 'true';
    const sleepBtn = document.getElementById('quickSleepBtn');
    const sleepText = document.getElementById('quickSleepText');

    if (sleepBtn && sleepText) {
      if (isSleeping) {
        sleepBtn.classList.add('active');
        sleepText.textContent = 'Đi Ngủ: BẬT 🌙';
      } else {
        sleepBtn.classList.remove('active');
        sleepText.textContent = 'Đi Ngủ: TẮT';
      }
    }

    const isWebSoundOn = host.web_sound_enabled === 'true';
    const webSoundIcon = document.getElementById('webSoundIcon');
    if (webSoundIcon) {
      webSoundIcon.textContent = isWebSoundOn ? '🔊' : '🔇';
    }
  }

  function getEffectiveVolume() {
    if (!hostProfile) return 1.0;
    const vol = parseInt(hostProfile.web_sound_volume, 10);
    return isNaN(vol) ? 1.0 : Math.max(0.1, Math.min(1.5, vol / 100));
  }

  function getEffectiveSoundType() {
    return hostProfile?.web_sound_type || document.getElementById('hostWebSoundType')?.value || 'loud_chime';
  }

  // Quick Sleep Mode Button
  document.getElementById('quickSleepBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/host-profile/toggle-sleep', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        updateQuickControlsUI(hostProfile);
        loadStatus();
        showToast(data.message, data.alarm_enabled ? 'success' : 'info');
      }
    } catch (err) {
      showToast('Lỗi khi đổi chế độ đi ngủ: ' + err.message, 'error');
    }
  });

  // Quick Web Sound Toggle
  document.getElementById('quickWebSoundBtn')?.addEventListener('click', async () => {
    if (!hostProfile) return;
    const newState = hostProfile.web_sound_enabled === 'true' ? 'false' : 'true';
    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          web_sound_enabled: newState
        })
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        updateQuickControlsUI(hostProfile);
        if (newState === 'true') {
          alarmAudioEngine.playSingleChime(getEffectiveVolume(), getEffectiveSoundType());
          showToast('Đã BẬT chuông loa Web Audio', 'success');
        } else {
          showToast('Đã TẮT chuông loa Web Audio', 'info');
        }
      }
    } catch (err) {
      showToast('Lỗi khi lưu cài đặt âm thanh: ' + err.message, 'error');
    }
  });

  // -------------------------------------------------------------
  // 5. Real-time Server-Sent Events (SSE) Engine
  // -------------------------------------------------------------
  function initSSE() {
    if (sseSource) sseSource.close();
    sseSource = new EventSource('/api/events');

    sseSource.addEventListener('CONNECTED', () => {
      console.log('[SSE] Kết nối thời gian thực thành công.');
    });

    sseSource.addEventListener('new_message', (e) => {
      const msg = JSON.parse(e.data);
      console.log('[SSE] Nhận tin nhắn mới:', msg);

      showBrowserNotification(
        `Tin nhắn mới từ ${msg.sender_name} (${msg.page_name})`,
        msg.text || '[Tệp đính kèm]'
      );

      // Web Audio sound trigger
      if (hostProfile && hostProfile.web_sound_enabled === 'true') {
        if (hostProfile.alarm_enabled === 'true') {
          alarmAudioEngine.startContinuousAlarm(getEffectiveVolume(), getEffectiveSoundType());
        } else {
          alarmAudioEngine.playSingleChime(getEffectiveVolume(), getEffectiveSoundType());
        }
      }

      loadConversations();
      loadStatus();

      if (activeConversation &&
          activeConversation.page_id === msg.page_id &&
          activeConversation.sender_id === msg.sender_id) {
        // User is currently viewing this chat: mark as seen immediately!
        fetch(`/api/conversations/${msg.page_id}/${msg.sender_id}/mark-seen`, { method: 'POST' })
          .then(() => loadStatus())
          .catch(() => {});

        const c = (window.conversationsCache || []).find(conv => conv.page_id === msg.page_id && conv.sender_id === msg.sender_id);
        if (c) {
          c.is_seen = 1;
          c.seen_at = Date.now();
          c.unread_count = 0;
        }

        const activeItem = document.querySelector(`.conversation-item[data-page-id="${msg.page_id}"][data-sender-id="${msg.sender_id}"]`);
        if (activeItem && c && c.is_replied !== 1) {
          const tag = activeItem.querySelector('.seen-indicator');
          if (tag) {
            tag.className = 'seen-indicator seen';
            tag.innerHTML = '👁️ Đã xem';
          }
        }

        loadMessages(activeConversation.page_id, activeConversation.sender_id);
      }
    });

    sseSource.addEventListener('alarm_triggered', (e) => {
      const data = JSON.parse(e.data);
      console.log('[SSE] Lệnh đổ chuông báo thức:', data);

      alarmAudioEngine.startContinuousAlarm(getEffectiveVolume(), getEffectiveSoundType());
      showBrowserNotification(
        `🚨 BÁO THỨC ĐẾN GIỜ TRỰC: ${data.pageName}`,
        `Khách hàng ${data.senderName} vừa nhắn tin! Đang gọi điện qua ${data.method}.`
      );
    });

    let agentTypingTimeout = null;
    sseSource.addEventListener('agent_typing', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          const currentHostName = (hostProfile && hostProfile.name) ? hostProfile.name.trim() : '';
          if (data.agent_name && data.agent_name !== currentHostName) {
            const typingInd = document.getElementById('agentTypingIndicator');
            const typingText = document.getElementById('agentTypingText');
            if (typingInd && typingText) {
              typingText.textContent = `✍️ ${data.agent_name} đang soạn tin nhắn...`;
              typingInd.style.display = 'flex';
              if (agentTypingTimeout) clearTimeout(agentTypingTimeout);
              agentTypingTimeout = setTimeout(() => {
                typingInd.style.display = 'none';
              }, 3500);
            }
          }
        }
      } catch (err) {}
    });

    sseSource.addEventListener('message_sent', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Tin nhắn phản hồi outbound:', data);

        // 1. Cập nhật local conversations cache
        const conv = (window.conversationsCache || []).find(c => c.page_id === data.page_id && c.sender_id === data.sender_id);
        if (conv) {
          conv.is_replied = 1;
          conv.is_seen = 1;
          conv.last_message_text = data.text || (data.attachments?.length ? '[Hình ảnh / Đính kèm]' : '');
          conv.last_message_time = data.timestamp || Date.now();
        }

        // 2. Cập nhật giao diện danh sách hội thoại bên trái
        const item = document.querySelector(`.conversation-item[data-page-id="${data.page_id}"][data-sender-id="${data.sender_id}"]`);
        if (item) {
          const statusEl = item.querySelector('.status-indicator');
          if (statusEl) statusEl.remove();
          const seenEl = item.querySelector('.seen-indicator');
          if (seenEl) {
            seenEl.outerHTML = '<span class="seen-indicator replied">✅ Đã trả lời</span>';
          }
          const snippetEl = item.querySelector('.conversation-snippet');
          if (snippetEl && data.text) {
            snippetEl.textContent = data.text;
          }
        }

        // 3. Tắt chuông báo an toàn nếu đang kêu
        const banner = document.getElementById('safetyAlarmBanner');
        if (banner && activeConversation && activeConversation.page_id === data.page_id && activeConversation.sender_id === data.sender_id) {
          alarmAudioEngine.stopContinuousAlarm();
          banner.style.display = 'none';
        }

        // 4. Cập nhật chi tiết hội thoại nếu đang mở
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          const statusBadge = document.getElementById('activeChatStatusBadge');
          if (statusBadge) {
            statusBadge.innerHTML = '✅ Đã trả lời';
            statusBadge.style.color = '#10b981';
          }
          const seenBadge = document.getElementById('activeChatSeenBadge');
          if (seenBadge) {
            seenBadge.innerHTML = '✅ Đã trả lời';
            seenBadge.className = 'seen-indicator replied';
          }

          const typingInd = document.getElementById('agentTypingIndicator');
          if (typingInd) typingInd.style.display = 'none';

          loadMessages(activeConversation.page_id, activeConversation.sender_id);

          // Cảnh báo va chạm nếu người dùng đang nhập dở nội dung
          const replyInput = document.getElementById('chatReplyInput');
          const hasDraft = replyInput && replyInput.value.trim().length > 0;
          const senderInfo = data.agent_name || (data.source === 'meta_business_suite' ? 'Meta Business Suite' : 'Người khác');

          if (hasDraft) {
            const collisionEl = document.getElementById('agentCollisionBanner');
            const collisionText = document.getElementById('agentCollisionText');
            if (collisionEl && collisionText) {
              collisionText.innerHTML = `⚠️ <strong>${escapeHtml(senderInfo)}</strong> vừa trả lời khách hàng! Hãy kiểm tra lại trước khi gửi.`;
              collisionEl.style.display = 'flex';
            }
          }
        }
      } catch (err) {
        console.warn('[SSE] message_sent handling error:', err);
      }
    });

    sseSource.addEventListener('customer_seen', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Khách hàng đã xem tin nhắn:', data);
        const conv = (window.conversationsCache || []).find(c => c.page_id === data.page_id && c.sender_id === data.sender_id);
        if (conv) {
          conv.customer_seen_watermark = data.watermark;
        }
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          loadMessages(activeConversation.page_id, activeConversation.sender_id);
        }
      } catch (err) {
        console.warn('[SSE] customer_seen error:', err);
      }
    });

    sseSource.addEventListener('conversation_seen', (e) => {
      try {
        const data = JSON.parse(e.data);
        const conv = (window.conversationsCache || []).find(c => c.page_id === data.page_id && c.sender_id === data.sender_id);
        if (conv) {
          conv.is_seen = 1;
          conv.seen_at = data.seen_at;
        }
        const item = document.querySelector(`.conversation-item[data-page-id="${data.page_id}"][data-sender-id="${data.sender_id}"]`);
        if (item && conv && conv.is_replied !== 1) {
          const seenIndicator = item.querySelector('.seen-indicator');
          if (seenIndicator) {
            seenIndicator.outerHTML = '<span class="seen-indicator seen">👁️ Đã xem (Chưa rep)</span>';
          }
        }
        loadStatus();
      } catch (err) {
        console.warn('[SSE] conversation_seen error:', err);
      }
    });

    sseSource.addEventListener('conversation_unseen', (e) => {
      try {
        const data = JSON.parse(e.data);
        const conv = (window.conversationsCache || []).find(c => c.page_id === data.page_id && c.sender_id === data.sender_id);
        if (conv) {
          conv.is_seen = 0;
          conv.seen_at = 0;
        }
        const item = document.querySelector(`.conversation-item[data-page-id="${data.page_id}"][data-sender-id="${data.sender_id}"]`);
        if (item && conv && conv.is_replied !== 1) {
          const seenIndicator = item.querySelector('.seen-indicator');
          if (seenIndicator) {
            seenIndicator.outerHTML = '<span class="seen-indicator unseen">🔵 Chưa xem</span>';
          }
        }
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          const seenBadge = document.getElementById('activeChatSeenBadge');
          if (seenBadge && conv && conv.is_replied !== 1) {
            seenBadge.innerHTML = '🔵 Chưa xem';
            seenBadge.className = 'seen-indicator unseen';
          }
        }
        loadStatus();
      } catch (err) {
        console.warn('[SSE] conversation_unseen error:', err);
      }
    });

    sseSource.addEventListener('safety_alarm', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Báo động an toàn tin nhắn bỏ quên:', data);

        const banner = document.getElementById('safetyAlarmBanner');
        const titleEl = document.getElementById('safetyAlarmTitle');
        const descEl = document.getElementById('safetyAlarmDesc');

        if (banner) banner.style.display = 'block';
        if (titleEl) {
          titleEl.textContent = `🚨 BÁO ĐỘNG AN TOÀN: Tin nhắn chưa trả lời (${data.minutes_unreplied} phút)!`;
        }
        if (descEl) {
          descEl.textContent = `Khách hàng ${data.sender_name || 'Khách'} trên Page ${data.page_name || data.page_id} chưa được phản hồi sau ${data.minutes_unreplied} phút quy định. Vui lòng kiểm tra ngay!`;
        }

        // Web Audio sound trigger continuous
        alarmAudioEngine.startContinuousAlarm(getEffectiveVolume(), getEffectiveSoundType());

        showBrowserNotification(
          `🚨 BÁO ĐỘNG AN TOÀN (${data.minutes_unreplied}p chưa rep)`,
          `Khách hàng ${data.sender_name || 'Khách'} trên Page ${data.page_name} đang chờ phản hồi!`
        );
      } catch (err) {
        console.warn('[SSE] safety_alarm error:', err);
      }
    });

    sseSource.addEventListener('user_sleep_state_changed', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Trạng thái ngủ thay đổi:', data);
        if (hostProfile) {
          hostProfile.alarm_enabled = data.is_sleeping ? 'true' : 'false';
          updateQuickControlsUI(hostProfile);
        }
        if (data.is_sleeping) {
          showToast('🌙 Đã tự động kích hoạt Chế Độ Đi Ngủ (Không có thao tác)', 'info');
        } else {
          showToast('☀️ Đã đánh thức về Chế Độ Ban Ngày', 'success');
        }
      } catch (err) {
        console.warn('[SSE] user_sleep_state_changed error:', err);
      }
    });

    sseSource.addEventListener('tunnel_started', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Cloudflare Tunnel đã khởi động:', data);
        updateHeaderTunnelBadge(data.publicUrl);
        showToast(`🌐 Cloudflare Tunnel đã kết nối thành công!`, 'success');
      } catch (err) {
        console.warn('[SSE] tunnel_started parse error:', err);
      }
    });

    sseSource.addEventListener('tunnel_stopped', () => {
      console.log('[SSE] Cloudflare Tunnel đã ngắt kết nối');
      updateHeaderTunnelBadge('');
    });

    sseSource.addEventListener('crm_updated', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Cập nhật CRM:', data);
        const conv = (window.conversationsCache || []).find(c => c.page_id === data.page_id && c.sender_id === data.sender_id);
        if (conv && data.crm) {
          conv.phone = data.crm.phone || '';
          conv.address = data.crm.address || '';
          conv.tags = data.crm.tags || [];
        }
        loadConversations();
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          renderCrmSidebar(data.crm);
        }
      } catch (err) {
        console.warn('[SSE] crm_updated error:', err);
      }
    });

    sseSource.addEventListener('crm_note_added', (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log('[SSE] Ghi chú nội bộ mới:', data);
        if (activeConversation &&
            activeConversation.page_id === data.page_id &&
            activeConversation.sender_id === data.sender_id) {
          loadCustomerCrm(data.page_id, data.sender_id);
        }
      } catch (err) {
        console.warn('[SSE] crm_note_added error:', err);
      }
    });

    sseSource.onerror = () => {
      console.warn('[SSE] Mất kết nối, tự động kết nối lại sau 3s...');
      sseSource.close();
      setTimeout(initSSE, 3000);
    };
  }

  // -------------------------------------------------------------
  // 6. Conversations & 2-Column Chat Split View
  // -------------------------------------------------------------
  async function loadConversations() {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;

    const searchInput = document.getElementById('conversationSearchInput');
    const search = searchInput ? searchInput.value.trim() : '';
    const pageFilter = document.getElementById('sidebarPageFilter')?.value || '';
    const unrepliedOnly = currentFilter === 'unreplied';
    const unseenOnly = currentFilter === 'unseen';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (pageFilter) params.append('page_id', pageFilter);
    if (unrepliedOnly) params.append('unreplied', 'true');
    if (unseenOnly) params.append('unseen', 'true');

    try {
      const res = await fetch(`/api/conversations?${params.toString()}`);
      const data = await res.json();

      if (!data.ok || !data.conversations || data.conversations.length === 0) {
        let emptyMsg = 'Chưa có tin nhắn nào từ khách hàng.';
        if (search) {
          emptyMsg = 'Không tìm thấy cuộc trò chuyện nào khớp với từ khóa.';
        } else if (currentFilter === 'unseen') {
          emptyMsg = 'Tuyệt vời! Không có tin nhắn chưa xem nào 🎉';
        } else if (currentFilter === 'unreplied') {
          emptyMsg = 'Tuyệt vời! Bạn đã trả lời hết mọi tin nhắn 🎉';
        }
        listEl.innerHTML = `
          <div class="empty-state-sidebar">
            <div class="empty-icon">${search ? '🔍' : (currentFilter === 'all' ? '💬' : '✨')}</div>
            <p>${emptyMsg}</p>
          </div>
        `;
        return;
      }

      window.conversationsCache = data.conversations || [];

      listEl.innerHTML = data.conversations.map(c => {
        const isActive = activeConversation &&
          activeConversation.page_id === c.page_id &&
          activeConversation.sender_id === c.sender_id;
        const timeStr = formatRelativeTime(c.last_message_time || new Date(c.updated_at).getTime());
        const isReplied = c.is_replied === 1;
        const isSeen = c.is_seen === 1 || isActive;
        const pageColor = c.page_color || '#3b82f6';

        let seenBadgeHtml = '';
        if (isReplied) {
          seenBadgeHtml = '<span class="seen-indicator replied">✅ Đã trả lời</span>';
        } else if (isSeen) {
          seenBadgeHtml = '<span class="seen-indicator seen">👁️ Đã xem</span>';
        } else {
          seenBadgeHtml = '<span class="seen-indicator unseen">🔵 Chưa xem</span>';
        }

        let tagsPillsHtml = '';
        if (Array.isArray(c.tags) && c.tags.length > 0) {
          tagsPillsHtml = c.tags.map(t => {
            const name = typeof t === 'string' ? t : (t.name || '');
            const color = (typeof t === 'object' && t.color) ? t.color : '#ffffff';
            const bg = (typeof t === 'object' && t.bg_color) ? t.bg_color : '#3b82f6';
            return `<span class="conv-tag-pill" style="color:${escapeHtml(color)}; background-color:${escapeHtml(bg)};" title="Thẻ: ${escapeHtml(name)}">🏷️ ${escapeHtml(name)}</span>`;
          }).join('');
        }

        return `
          <div class="conversation-item ${isActive ? 'active' : ''}" data-page-id="${c.page_id}" data-sender-id="${c.sender_id}">
            <div class="conv-avatar" style="background: linear-gradient(135deg, ${pageColor}, #8b5cf6);">${escapeHtml(c.sender_name || 'Khách').charAt(0).toUpperCase()}</div>
            <div class="conv-content">
              <div class="conv-top-row">
                <span class="conv-name">${escapeHtml(c.sender_name || 'Khách hàng')}</span>
                <span class="conv-time">${timeStr}</span>
              </div>
              <div class="conv-last-msg">${escapeHtml(c.last_message_text || '[Tin nhắn]')}</div>
              <div class="conv-tags">
                <span class="page-badge-prominent" style="background: ${pageColor}22; color: ${pageColor}; border: 1px solid ${pageColor}55;" title="Fanpage: ${escapeHtml(c.page_name || c.page_id)}">
                  📄 Trang: <strong class="page-name-text">${escapeHtml(c.page_name || c.page_id)}</strong>${c.account_label ? ` <span class="acc-tag-inline">[${escapeHtml(c.account_label)}]</span>` : ''}
                </span>
                ${seenBadgeHtml}
                ${!isReplied ? '<span class="status-indicator" style="color: #ef4444;">🔴 Chưa trả lời</span>' : ''}
                ${tagsPillsHtml}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Attach click listeners to conversation items
      listEl.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', () => {
          const pageId = item.dataset.pageId;
          const senderId = item.dataset.senderId;
          selectConversation(pageId, senderId);
        });
      });

      // Auto-select conversation if page_id and sender_id are present in URL query params (e.g. from Discord link)
      const urlParams = new URLSearchParams(window.location.search);
      const targetPageId = urlParams.get('page_id');
      const targetSenderId = urlParams.get('sender_id');
      if (targetPageId && targetSenderId && !activeConversation) {
        selectConversation(targetPageId, targetSenderId);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    }
  }

  async function selectConversation(pageId, senderId) {
    activeConversation = { page_id: pageId, sender_id: senderId };

    document.querySelectorAll('.conversation-item').forEach(item => {
      if (item.dataset.pageId === pageId && item.dataset.senderId === senderId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    document.getElementById('noChatSelectedState')?.remove();
    const chatHeader = document.getElementById('chatDetailHeader');
    if (chatHeader) chatHeader.style.display = 'flex';

    // Reset multi-agent collision and typing indicators
    const collisionBanner = document.getElementById('agentCollisionBanner');
    if (collisionBanner) collisionBanner.style.display = 'none';
    const typingIndicator = document.getElementById('agentTypingIndicator');
    if (typingIndicator) typingIndicator.style.display = 'none';

    // Automatically mark conversation as seen by agent
    fetch(`/api/conversations/${pageId}/${senderId}/mark-seen`, { method: 'POST' })
      .then(() => loadStatus())
      .catch(() => {});

    // Update local cache
    const conv = (window.conversationsCache || []).find(c => c.page_id === pageId && c.sender_id === senderId);
    if (conv) {
      conv.is_seen = 1;
      conv.seen_at = Date.now();
      conv.unread_count = 0;
    }

    // Immediately update sidebar unseen badge
    const unrepliedBadge = document.getElementById('unrepliedCountBadge');
    if (unrepliedBadge && window.conversationsCache) {
      const remainingUnseen = window.conversationsCache.filter(c => !c.is_seen && !c.is_replied).length;
      unrepliedBadge.textContent = remainingUnseen;
      unrepliedBadge.style.display = remainingUnseen > 0 ? 'inline-flex' : 'none';
    }

    // Update item tag in sidebar
    const activeItem = document.querySelector(`.conversation-item[data-page-id="${pageId}"][data-sender-id="${senderId}"]`);
    if (activeItem && conv && conv.is_replied !== 1) {
      const tag = activeItem.querySelector('.seen-indicator');
      if (tag) {
        tag.className = 'seen-indicator seen';
        tag.innerHTML = '👁️ Đã xem';
      }
    }

    // Show input bar
    const inputBar = document.getElementById('chatInputBar');
    if (inputBar) inputBar.style.display = 'block';

    // Update responding fanpage indicator
    const pageName = conv?.page_name || pageId;
    const pageNameEl = document.getElementById('replyingPageNameText');
    if (pageNameEl) pageNameEl.textContent = pageName;

    const input = document.getElementById('chatReplyInput');
    if (input) {
      input.focus();
      autoResizeTextarea(input);
      updateCharCounter();
    }

    loadMessages(pageId, senderId);
    loadCustomerCrm(pageId, senderId);
    if (isCrmSidebarOpen) {
      document.querySelector('.chat-split-container')?.classList.add('has-crm');
      document.getElementById('toggleCrmBtn')?.classList.add('active');
    }
  }

  async function loadMessages(pageId, senderId) {
    const timeline = document.getElementById('chatMessagesTimeline');
    if (!timeline) return;

    try {
      const res = await fetch(`/api/conversations/${pageId}/${senderId}/messages`);
      const data = await res.json();

      if (!data.ok || !data.messages) return;

      // Lookup conversation from cached list
      const conv = (window.conversationsCache || []).find(c => c.page_id === pageId && c.sender_id === senderId);
      const pageName = conv?.page_name || pageId;
      const pageColor = conv?.page_color || '#3b82f6';
      const accountLabel = conv?.account_label ? ` [${conv.account_label}]` : '';
      const customerName = conv?.sender_name || data.messages.find(m => m.is_echo !== 1 && m.sender_id !== pageId)?.sender_name || 'Khách hàng';

      const nameEl = document.getElementById('activeChatName');
      if (nameEl) nameEl.textContent = customerName;

      const avatarEl = document.getElementById('activeChatAvatar');
      if (avatarEl) {
        avatarEl.textContent = customerName.charAt(0).toUpperCase();
        avatarEl.style.background = `linear-gradient(135deg, ${pageColor}, #8b5cf6)`;
      }

      const badgeEl = document.getElementById('activeChatPageBadge');
      if (badgeEl) {
        badgeEl.innerHTML = `📄 Fanpage: <strong>${escapeHtml(pageName)}</strong>${accountLabel ? ` <span style="opacity:0.85">${escapeHtml(accountLabel)}</span>` : ''}`;
        badgeEl.style.background = `${pageColor}22`;
        badgeEl.style.color = pageColor;
        badgeEl.style.border = `1px solid ${pageColor}55`;
      }

      const openMetaBtn = document.getElementById('openMetaInboxBtn');
      if (openMetaBtn) {
        openMetaBtn.href = `https://business.facebook.com/latest/inbox/all?asset_id=${pageId}`;
      }

      const statusBadge = document.getElementById('activeChatStatusBadge');
      if (statusBadge) {
        const isReplied = conv?.is_replied === 1;
        statusBadge.innerHTML = !isReplied ? '🔴 Chưa trả lời' : '✅ Đã trả lời';
        statusBadge.style.color = !isReplied ? '#ef4444' : '#10b981';
      }

      const seenBadge = document.getElementById('activeChatSeenBadge');
      if (seenBadge) {
        const isReplied = conv?.is_replied === 1;
        const isSeen = conv?.is_seen === 1 || (activeConversation && activeConversation.page_id === pageId && activeConversation.sender_id === senderId);
        if (isReplied) {
          seenBadge.innerHTML = '✅ Đã trả lời';
          seenBadge.className = 'seen-indicator replied';
        } else if (isSeen) {
          seenBadge.innerHTML = '👁️ Đã xem';
          seenBadge.className = 'seen-indicator seen';
        } else {
          seenBadge.innerHTML = '🔵 Chưa xem';
          seenBadge.className = 'seen-indicator unseen';
        }
      }

      const customerWatermark = Number(conv?.customer_seen_watermark) || 0;

      // Ensure strictly deterministic chronological sorting by timestamp then ID
      data.messages.sort((a, b) => {
        const timeA = Number(a.timestamp) || (a.created_at ? new Date(a.created_at).getTime() : 0);
        const timeB = Number(b.timestamp) || (b.created_at ? new Date(b.created_at).getTime() : 0);
        if (timeA !== timeB) return timeA - timeB;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      timeline.innerHTML = data.messages.map(m => {
        const isPageEcho = m.is_echo === 1 || m.sender_id === pageId;
        const timeStr = new Date(m.timestamp || m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const msgTimestamp = Number(m.timestamp) || (m.created_at ? new Date(m.created_at).getTime() : 0);
        const isCustomerSeen = isPageEcho && customerWatermark > 0 && customerWatermark >= msgTimestamp;
        const customerSeenHtml = isCustomerSeen ? `
          <div class="customer-seen-badge" title="Khách hàng đã xem tin nhắn này trên Messenger">
            <span class="seen-check">✓✓</span> Khách đã xem ${new Date(customerWatermark).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        ` : '';

        let attachments = [];
        try {
          attachments = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : (m.attachments || []);
        } catch (e) {
          attachments = [];
        }

        const attachmentsHtml = Array.isArray(attachments) ? attachments.map(att => {
          const url = att.url || att.payload?.url || att.image_data?.url || att.video_data?.url || att.file_url;
          if (!url) return '';

          // Determine attachment type
          let type = (att.type || '').toLowerCase();
          const mime = (att.mime_type || '').toLowerCase();
          const fileName = att.name || att.payload?.title || att.title || 'Tệp đính kèm';
          const ext = (fileName.split('.').pop() || '').toLowerCase();

          if (!type || type === 'file') {
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || mime.startsWith('image')) {
              type = 'image';
            } else if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'].includes(ext) || mime.startsWith('video')) {
              type = 'video';
            } else if (['mp3', 'm4a', 'wav', 'ogg', 'aac', 'weba'].includes(ext) || mime.startsWith('audio')) {
              type = 'audio';
            }
          }

          // Format file size
          const sizeBytes = att.size || att.payload?.size;
          let sizeStr = '';
          if (sizeBytes && typeof sizeBytes === 'number') {
            if (sizeBytes > 1024 * 1024) sizeStr = (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
            else if (sizeBytes > 1024) sizeStr = (sizeBytes / 1024).toFixed(0) + ' KB';
            else sizeStr = sizeBytes + ' B';
          }

          if (type === 'image' || type === 'sticker') {
            return `
              <div class="chat-attachment-wrap ${type === 'sticker' ? 'chat-sticker-wrap' : ''}">
                <div class="chat-img-thumb-container" onclick="window.openMediaLightbox('${escapeHtml(url)}', 'image', '${escapeHtml(fileName)}')" title="Bấm để xem ảnh phóng to dạng Dialog">
                  <img src="${escapeHtml(url)}" class="${type === 'sticker' ? 'chat-sticker-img' : 'chat-msg-img'}" alt="${escapeHtml(fileName)}" loading="lazy" />
                  <div class="img-hover-overlay">
                    <span class="img-zoom-icon">🔍 Bấm phóng to</span>
                  </div>
                </div>
              </div>
            `;
          }

          if (type === 'video') {
            return `
              <div class="chat-attachment-wrap chat-video-wrap">
                <div class="video-container">
                  <video controls playsinline preload="metadata" class="chat-msg-video" src="${escapeHtml(url)}">
                    Trình duyệt của bạn không hỗ trợ phát video trực tiếp.
                  </video>
                  <div class="video-overlay-actions">
                    <button type="button" class="video-expand-btn" onclick="window.openMediaLightbox('${escapeHtml(url)}', 'video', '${escapeHtml(fileName)}')" title="Phóng to video dạng Dialog">
                      <span>⛶</span> Xem To Dialog
                    </button>
                  </div>
                </div>
                <div class="media-meta-row">
                  <span class="media-name">🎥 ${escapeHtml(fileName)}</span>
                  ${sizeStr ? `<span class="media-size">(${sizeStr})</span>` : ''}
                  <a href="${escapeHtml(url)}" target="_blank" download class="media-dl-link" title="Tải video">⬇ Tải về</a>
                </div>
              </div>
            `;
          }

          if (type === 'audio') {
            const uid = 'va_' + Math.random().toString(36).substring(2, 9);
            const waveHeights = [6, 12, 8, 14, 16, 10, 14, 8, 12, 16, 10, 6, 14, 10, 8, 12, 9, 15, 11, 7];
            const waveBars = waveHeights.map(h => `<div class="wave-bar" style="height: ${h}px;"></div>`).join('');

            return `
              <div class="chat-attachment-wrap chat-voice-player-wrap">
                <div class="voice-player-card" id="card-${uid}">
                  <button type="button" class="voice-play-btn" id="btn-${uid}" onclick="window.toggleVoicePlay(this, '${uid}')" title="Phát tin nhắn thoại">
                    <span class="play-icon">▶</span>
                  </button>
                  <div class="voice-meta-track">
                    <div class="voice-wave-visualizer">
                      ${waveBars}
                    </div>
                    <div class="voice-progress-container" onclick="window.seekVoiceAudio(event, '${uid}')" title="Tua âm thanh">
                      <div class="voice-progress-fill" id="prog-${uid}"></div>
                    </div>
                    <div class="voice-time-row">
                      <span class="voice-time-text" id="time-${uid}">00:00</span>
                      <div class="voice-tools">
                        <button type="button" class="voice-speed-btn" id="spd-${uid}" onclick="window.changeVoiceSpeed(this, '${uid}')" title="Đổi tốc độ phát">1x</button>
                        <a href="${escapeHtml(url)}" target="_blank" download class="voice-dl-btn" title="Tải file âm thanh về máy">⬇ Tải</a>
                      </div>
                    </div>
                  </div>
                  <audio id="audio-${uid}" src="${escapeHtml(url)}" preload="metadata" class="voice-hidden-audio"></audio>
                </div>
              </div>
            `;
          }

          if (type === 'location' || url.includes('google.com/maps')) {
            return `
              <div class="chat-attachment-wrap chat-location-wrap">
                <div class="chat-location-card">
                  <span class="location-icon">📍</span>
                  <div class="location-info">
                    <strong>Vị trí khách hàng chia sẻ</strong>
                    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary mt-1">
                      Mở Google Maps ↗
                    </a>
                  </div>
                </div>
              </div>
            `;
          }

          // Document / File / Other
          let fileIcon = '📄';
          if (['pdf'].includes(ext)) fileIcon = '📕';
          else if (['doc', 'docx'].includes(ext)) fileIcon = '📝';
          else if (['xls', 'xlsx', 'csv'].includes(ext)) fileIcon = '📊';
          else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) fileIcon = '📦';
          else if (['ppt', 'pptx'].includes(ext)) fileIcon = '📽️';
          else if (['txt', 'log', 'json'].includes(ext)) fileIcon = '📋';

          return `
            <div class="chat-attachment-wrap chat-file-wrap">
              <div class="chat-file-card">
                <div class="file-icon-badge">${fileIcon}</div>
                <div class="file-card-info">
                  <div class="file-card-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</div>
                  <div class="file-card-meta">
                    ${sizeStr ? `<span class="file-size-tag">${sizeStr}</span>` : ''}
                    <span class="file-ext-tag">${ext ? ext.toUpperCase() : 'FILE'}</span>
                  </div>
                </div>
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" download class="file-card-dl-btn" title="Tải tệp về máy">
                  <span>⬇ Tải về</span>
                </a>
              </div>
            </div>
          `;
        }).join('') : '';

        return `
          <div class="chat-bubble ${isPageEcho ? 'chat-bubble-outgoing' : 'chat-bubble-incoming'}">
            <div class="bubble-sender-meta">
              ${isPageEcho 
                ? `🏢 <strong>${escapeHtml(pageName)}</strong> (Bạn)` 
                : `👤 <strong>${escapeHtml(m.sender_name || customerName)}</strong>`
              }
            </div>
            ${attachmentsHtml}
            ${m.text ? `<div class="chat-bubble-text">${formatMessageContent(m.text)}</div>` : ''}
            <span class="bubble-time">${timeStr}</span>
            ${customerSeenHtml}
          </div>
        `;
      }).join('');

      timeline.scrollTop = timeline.scrollHeight;
      setTimeout(() => {
        timeline.scrollTop = timeline.scrollHeight;
      }, 100);

      if (typeof checkAndSuggestDetectedPhone === 'function') {
        checkAndSuggestDetectedPhone(activeCustomerCrm?.phone);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  // Auto-detect URLs, Emails, Phone Numbers & Format Message Text
  function formatMessageContent(rawText) {
    if (!rawText) return '';

    // 1. Escape HTML first for 100% XSS security
    let safe = escapeHtml(rawText);

    // 2. Auto-detect URLs (http://, https://, or www.)
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    safe = safe.replace(urlRegex, (matchedUrl) => {
      let cleanUrl = matchedUrl;
      let trailingPunct = '';
      const match = cleanUrl.match(/[.,!?;:)]+$/);
      if (match) {
        trailingPunct = match[0];
        cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
      }
      const href = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-hyperlink" title="Mở liên kết: ${href}">${cleanUrl} ↗</a>${trailingPunct}`;
    });

    // 3. Auto-detect emails
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    safe = safe.replace(emailRegex, '<a href="mailto:$1" class="chat-hyperlink chat-email-link">✉️ $1</a>');

    // 4. Auto-detect Vietnamese phone numbers (09xx, 08xx, 03xx, 07xx, 05xx, +84...)
    const phoneRegex = /(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)\d{7}\b/g;
    safe = safe.replace(phoneRegex, '<a href="tel:$&" class="chat-phone-link" title="Bấm để gọi điện thoại $&">📞 $&</a>');

    // 5. Convert newlines to <br>
    safe = safe.replace(/\n/g, '<br>');

    return safe;
  }

  // Filter Pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      loadConversations();
    });
  });

  // Search input debounce
  let searchDebounceTimer = null;
  document.getElementById('conversationSearchInput')?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadConversations, 300);
  });

  // Manual Sync Button
  document.getElementById('manualSyncInboxBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('manualSyncInboxBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Đang quét...';
    }
    try {
      showToast('Đang quét tin nhắn mới từ Facebook...', 'info');
      const res = await fetch('/api/conversations/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Đồng bộ hoàn tất!', 'success');
        loadConversations();
        if (activeConversation) {
          loadMessages(activeConversation.page_id, activeConversation.sender_id);
        }
      } else {
        showToast('Lỗi đồng bộ: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔄 Đồng bộ';
      }
    }
  });

  // Mark Replied Button
  document.getElementById('markRepliedBtn')?.addEventListener('click', async () => {
    if (!activeConversation) return;
    try {
      const res = await fetch(`/api/conversations/${activeConversation.page_id}/${activeConversation.sender_id}/mark-replied`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã đánh dấu đã trả lời!', 'success');
        alarmAudioEngine.stopContinuousAlarm();
        const banner = document.getElementById('safetyAlarmBanner');
        if (banner) banner.style.display = 'none';

        const conv = (window.conversationsCache || []).find(c => c.page_id === activeConversation.page_id && c.sender_id === activeConversation.sender_id);
        if (conv) conv.is_replied = 1;

        const statusBadge = document.getElementById('activeChatStatusBadge');
        if (statusBadge) {
          statusBadge.innerHTML = '✅ Đã trả lời';
          statusBadge.style.color = '#10b981';
        }
        const seenBadge = document.getElementById('activeChatSeenBadge');
        if (seenBadge) {
          seenBadge.innerHTML = '✅ Đã trả lời';
          seenBadge.className = 'seen-indicator replied';
        }

        loadConversations();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });

  // Mark Unseen Button
  document.getElementById('markUnseenBtn')?.addEventListener('click', async () => {
    if (!activeConversation) return;
    try {
      const res = await fetch(`/api/conversations/${activeConversation.page_id}/${activeConversation.sender_id}/mark-unseen`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã đánh dấu là chưa xem!', 'info');
        const conv = (window.conversationsCache || []).find(c => c.page_id === activeConversation.page_id && c.sender_id === activeConversation.sender_id);
        if (conv) {
          conv.is_seen = 0;
          conv.seen_at = 0;
        }

        const seenBadge = document.getElementById('activeChatSeenBadge');
        if (seenBadge) {
          seenBadge.innerHTML = '🔵 Chưa xem';
          seenBadge.className = 'seen-indicator unseen';
        }

        const item = document.querySelector(`.conversation-item[data-page-id="${activeConversation.page_id}"][data-sender-id="${activeConversation.sender_id}"]`);
        if (item) {
          const seenIndicator = item.querySelector('.seen-indicator');
          if (seenIndicator) {
            seenIndicator.outerHTML = '<span class="seen-indicator unseen">🔵 Chưa xem</span>';
          }
        }
      }
    } catch (err) {
      console.error('Error marking unseen:', err);
      showToast('Lỗi khi đánh dấu chưa xem: ' + err.message, 'error');
    }
  });

  // =============================================================
  // SCIENTIFIC META BUSINESS SUITE TEXTING APPARATUS CONTROLLER
  // =============================================================
  let currentStagedAttachment = null;

  function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextH = Math.min(textarea.scrollHeight, 130);
    textarea.style.height = (nextH > 38 ? nextH : 38) + 'px';
  }

  function updateCharCounter() {
    const textarea = document.getElementById('chatReplyInput');
    const counter = document.getElementById('charCounter');
    if (textarea && counter) {
      counter.textContent = `${textarea.value.length} ký tự`;
    }
  }

  function setStagedAttachment(attachment) {
    currentStagedAttachment = attachment;
    const tray = document.getElementById('attachmentStagingTray');
    const previewWrap = document.getElementById('stagedPreviewWrap');
    if (!tray || !previewWrap) return;

    if (!attachment) {
      tray.style.display = 'none';
      previewWrap.innerHTML = '';
      return;
    }

    tray.style.display = 'flex';
    const sizeStr = attachment.size ? (attachment.size > 1024 * 1024 ? (attachment.size / (1024 * 1024)).toFixed(1) + ' MB' : (attachment.size / 1024).toFixed(0) + ' KB') : '';

    if (attachment.type === 'image') {
      previewWrap.innerHTML = `
        <img src="${attachment.data || attachment.url}" class="staged-img-thumb" alt="Ảnh đính kèm" />
        <div class="staged-file-meta" style="margin-left: 8px;">
          <span class="staged-file-name">🖼️ ${escapeHtml(attachment.name || 'Ảnh')}</span>
          ${sizeStr ? `<span class="staged-file-size">${sizeStr}</span>` : ''}
        </div>
      `;
    } else if (attachment.type === 'video') {
      previewWrap.innerHTML = `
        <div class="staged-file-badge">
          <span style="font-size: 20px;">🎥</span>
          <div class="staged-file-meta">
            <span class="staged-file-name">${escapeHtml(attachment.name || 'Video')}</span>
            ${sizeStr ? `<span class="staged-file-size">${sizeStr}</span>` : ''}
          </div>
        </div>
      `;
    } else if (attachment.type === 'audio') {
      previewWrap.innerHTML = `
        <div class="staged-file-badge">
          <span style="font-size: 20px;">🎙️</span>
          <div class="staged-file-meta">
            <span class="staged-file-name">${escapeHtml(attachment.name || 'Ghi âm / Voice')}</span>
            ${sizeStr ? `<span class="staged-file-size">${sizeStr}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      previewWrap.innerHTML = `
        <div class="staged-file-badge">
          <span style="font-size: 20px;">📄</span>
          <div class="staged-file-meta">
            <span class="staged-file-name">${escapeHtml(attachment.name || 'Tệp')}</span>
            ${sizeStr ? `<span class="staged-file-size">${sizeStr}</span>` : ''}
          </div>
        </div>
      `;
    }
  }

  function clearStagedAttachment() {
    currentStagedAttachment = null;
    const tray = document.getElementById('attachmentStagingTray');
    const previewWrap = document.getElementById('stagedPreviewWrap');
    if (tray) tray.style.display = 'none';
    if (previewWrap) previewWrap.innerHTML = '';
    const imgInput = document.getElementById('chatImageFileInput');
    if (imgInput) imgInput.value = '';
    const docInput = document.getElementById('chatDocFileInput');
    if (docInput) docInput.value = '';
  }

  document.getElementById('removeStagedAttachmentBtn')?.addEventListener('click', () => {
    clearStagedAttachment();
  });

  // Central File Ingestion Processor for Upload, Drag-and-Drop & Clipboard
  function handleDroppedOrPastedFile(file, customName) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showToast('Kích thước tệp vượt quá 25MB (Giới hạn Facebook Send API)!', 'error');
      return;
    }

    const name = customName || file.name || 'attachment';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const mime = (file.type || '').toLowerCase();

    let type = 'file';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || mime.startsWith('image/')) {
      type = 'image';
    } else if (['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'].includes(ext) || mime.startsWith('video/')) {
      type = 'video';
    } else if (['mp3', 'm4a', 'wav', 'ogg', 'aac', 'weba'].includes(ext) || mime.startsWith('audio/')) {
      type = 'audio';
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      setStagedAttachment({
        type,
        name,
        size: file.size,
        data: evt.target.result
      });
      const typeLabel = type === 'image' ? 'ảnh' : (type === 'video' ? 'video' : (type === 'audio' ? 'tin nhắn thoại' : 'tệp tài liệu'));
      showToast(`Đã đính kèm ${typeLabel}: ${name}`, 'success');
      const replyInput = document.getElementById('chatReplyInput');
      if (replyInput) replyInput.focus();
    };
    reader.readAsDataURL(file);
  }

  // Trigger Image File Picker
  document.getElementById('triggerImageUploadBtn')?.addEventListener('click', () => {
    document.getElementById('chatImageFileInput')?.click();
  });

  document.getElementById('chatImageFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleDroppedOrPastedFile(file);
  });

  // Trigger Document File Picker
  document.getElementById('triggerFileUploadBtn')?.addEventListener('click', () => {
    document.getElementById('chatDocFileInput')?.click();
  });

  document.getElementById('chatDocFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleDroppedOrPastedFile(file);
  });

  // Setup Drag-and-Drop on Chat Detail Pane
  let dragCounter = 0;
  const chatPane = document.getElementById('chatDetailPane');
  const dropOverlay = document.getElementById('chatDropZoneOverlay');

  if (chatPane && dropOverlay) {
    chatPane.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (activeConversation) {
        dropOverlay.style.display = 'flex';
      }
    });

    chatPane.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    chatPane.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropOverlay.style.display = 'none';
      }
    });

    chatPane.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.style.display = 'none';

      if (!activeConversation) {
        showToast('Vui lòng chọn một cuộc trò chuyện trước khi thả tệp!', 'info');
        return;
      }

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleDroppedOrPastedFile(files[0]);
      }
    });
  }

  // Setup Clipboard Paste (Ctrl + V) for Images & Screenshots
  document.addEventListener('paste', (e) => {
    if (!activeConversation) return;

    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.id !== 'chatReplyInput') {
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const fileName = `screenshot_${timestampStr}.png`;
          handleDroppedOrPastedFile(file, fileName);
          break;
        }
      }
    }
  });

  // Toggle Quick Replies Bar
  document.getElementById('toggleQrBarBtn')?.addEventListener('click', () => {
    const qrBar = document.getElementById('quickRepliesBar');
    if (!qrBar) return;
    const isHidden = qrBar.style.display === 'none';
    qrBar.style.display = isHidden ? 'block' : 'none';
    document.getElementById('toggleQrBarBtn')?.classList.toggle('active', isHidden);
  });

  // Emoji Popover Controller
  const POPULAR_EMOJIS = [
    '👍', '😊', '❤️', '🙏', '👋', '✅', 
    '❌', '📦', '💵', '📞', '📍', '💯', 
    '⭐', '🎁', '🤝', '💬', '🚀', '✨', 
    '😃', '😍', '👏', '🎉', '🔥', '🛵'
  ];

  function initEmojiGrid() {
    const grid = document.getElementById('emojiGrid');
    if (!grid || grid.children.length > 0) return;

    grid.innerHTML = POPULAR_EMOJIS.map(emoji => `
      <button type="button" class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
    `).join('');

    grid.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        insertEmojiAtCursor(btn.dataset.emoji);
      });
    });
  }

  function insertEmojiAtCursor(emoji) {
    const textarea = document.getElementById('chatReplyInput');
    if (!textarea) return;

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const val = textarea.value;

    textarea.value = val.substring(0, start) + emoji + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    textarea.focus();
    autoResizeTextarea(textarea);
    updateCharCounter();
  }

  document.getElementById('toggleEmojiPickerBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const popover = document.getElementById('emojiPickerPopover');
    if (!popover) return;
    const isHidden = popover.style.display === 'none' || !popover.style.display;
    initEmojiGrid();
    popover.style.display = isHidden ? 'block' : 'none';
    document.getElementById('toggleEmojiPickerBtn')?.classList.toggle('active', isHidden);
  });

  document.getElementById('closeEmojiPopoverBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const popover = document.getElementById('emojiPickerPopover');
    if (popover) popover.style.display = 'none';
    document.getElementById('toggleEmojiPickerBtn')?.classList.remove('active');
  });

  // Close emoji popover when clicking outside
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('emojiPickerPopover');
    const toggleBtn = document.getElementById('toggleEmojiPickerBtn');
    if (popover && popover.style.display === 'block') {
      if (!popover.contains(e.target) && !toggleBtn?.contains(e.target)) {
        popover.style.display = 'none';
        toggleBtn?.classList.remove('active');
      }
    }
  });

  // Quick Like Button
  document.getElementById('quickLikeBtn')?.addEventListener('click', async () => {
    if (!activeConversation) return;
    await executeSendReply('👍', null);
  });

  // Multi-Agent Typing Ping Throttle
  let lastAgentTypingPing = 0;
  function emitMyTypingPing() {
    if (!activeConversation) return;
    const now = Date.now();
    if (now - lastAgentTypingPing > 2500) {
      lastAgentTypingPing = now;
      const myName = (hostProfile && hostProfile.name) ? hostProfile.name.trim() : 'Nhân viên';
      fetch(`/api/conversations/${activeConversation.page_id}/${activeConversation.sender_id}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: myName })
      }).catch(() => {});
    }
  }

  // Ensure currently active chat is marked as seen on user interaction
  const ensureActiveChatMarkedSeen = () => {
    if (!activeConversation) return;
    const conv = (window.conversationsCache || []).find(c => c.page_id === activeConversation.page_id && c.sender_id === activeConversation.sender_id);
    if (conv && conv.is_seen !== 1 && conv.is_replied !== 1) {
      conv.is_seen = 1;
      conv.seen_at = Date.now();
      conv.unread_count = 0;
      fetch(`/api/conversations/${activeConversation.page_id}/${activeConversation.sender_id}/mark-seen`, { method: 'POST' })
        .then(() => loadStatus())
        .catch(() => {});

      const seenBadge = document.getElementById('activeChatSeenBadge');
      if (seenBadge) {
        seenBadge.innerHTML = '👁️ Đã xem';
        seenBadge.className = 'seen-indicator seen';
      }
      const activeItem = document.querySelector(`.conversation-item[data-page-id="${activeConversation.page_id}"][data-sender-id="${activeConversation.sender_id}"]`);
      if (activeItem) {
        const tag = activeItem.querySelector('.seen-indicator');
        if (tag) {
          tag.className = 'seen-indicator seen';
          tag.innerHTML = '👁️ Đã xem';
        }
      }
      const unrepliedBadge = document.getElementById('unrepliedCountBadge');
      if (unrepliedBadge && window.conversationsCache) {
        const remainingUnseen = window.conversationsCache.filter(c => !c.is_seen && !c.is_replied).length;
        unrepliedBadge.textContent = remainingUnseen;
        unrepliedBadge.style.display = remainingUnseen > 0 ? 'inline-flex' : 'none';
      }
    }
  };

  // Textarea input & keyboard shortcuts
  const chatTextarea = document.getElementById('chatReplyInput');
  chatTextarea?.addEventListener('input', () => {
    autoResizeTextarea(chatTextarea);
    updateCharCounter();
    emitMyTypingPing();
  });
  chatTextarea?.addEventListener('focus', ensureActiveChatMarkedSeen);
  chatTextarea?.addEventListener('click', ensureActiveChatMarkedSeen);
  document.getElementById('chatMessagesTimeline')?.addEventListener('click', ensureActiveChatMarkedSeen);

  document.getElementById('dismissCollisionBannerBtn')?.addEventListener('click', () => {
    const banner = document.getElementById('agentCollisionBanner');
    if (banner) banner.style.display = 'none';
  });

  chatTextarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  });

  // Submit button click
  document.getElementById('chatReplySubmitBtn')?.addEventListener('click', () => {
    handleSendReply();
  });

  async function handleSendReply() {
    if (!activeConversation) return;
    const textarea = document.getElementById('chatReplyInput');
    const text = textarea ? textarea.value.trim() : '';

    if (!text && !currentStagedAttachment) {
      showToast('Vui lòng nhập nội dung tin nhắn hoặc chọn tệp đính kèm!', 'info');
      textarea?.focus();
      return;
    }

    await executeSendReply(text, currentStagedAttachment);
  }

  async function executeSendReply(textToSend, attachmentToSend) {
    if (!activeConversation) return;

    const textarea = document.getElementById('chatReplyInput');
    const submitBtn = document.getElementById('chatReplySubmitBtn');
    const sendBtnText = document.getElementById('chatSendBtnText');

    if (submitBtn) submitBtn.disabled = true;
    if (sendBtnText) sendBtnText.textContent = 'Đang gửi...';

    try {
      const myAgentName = (hostProfile && hostProfile.name) ? hostProfile.name.trim() : 'Nhân viên';
      const payload = { 
        text: textToSend,
        agent_name: myAgentName
      };
      if (attachmentToSend) {
        payload.attachment = attachmentToSend;
      }

      const res = await fetch(`/api/conversations/${activeConversation.page_id}/${activeConversation.sender_id}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.ok) {
        if (textarea) {
          textarea.value = '';
          autoResizeTextarea(textarea);
          updateCharCounter();
        }
        clearStagedAttachment();
        showToast('Đã gửi tin nhắn thành công!', 'success');

        const collisionEl = document.getElementById('agentCollisionBanner');
        if (collisionEl) collisionEl.style.display = 'none';

        alarmAudioEngine.stopContinuousAlarm();
        const alarmBanner = document.getElementById('safetyAlarmBanner');
        if (alarmBanner) alarmBanner.style.display = 'none';

        // Close emoji picker if open
        const popover = document.getElementById('emojiPickerPopover');
        if (popover) popover.style.display = 'none';

        // Reload messages and scroll to bottom
        await loadMessages(activeConversation.page_id, activeConversation.sender_id);
        loadConversations();

        // Always refocus textarea after sending so user can type next message immediately
        setTimeout(() => {
          textarea?.focus();
        }, 50);
      } else {
        showToast('Lỗi khi gửi tin: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng khi gửi tin: ' + err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (sendBtnText) sendBtnText.textContent = 'Gửi';
    }
  }

  // -------------------------------------------------------------
  // 7. Pages & Token Vault Management
  // -------------------------------------------------------------
  let activeScanTokenSourceId = 0;
  let savedTokenSourcesCache = [];

  // -------------------------------------------------------------
  // 7. Pages & Token Vault Management
  // -------------------------------------------------------------
  async function loadTokenSources() {
    const container = document.getElementById('tokenSourcesList');
    const select = document.getElementById('modalSavedTokenSourceSelect');
    if (!container && !select) return;

    try {
      const res = await fetch('/api/token-sources');
      const data = await res.json();
      if (!data.ok || !data.tokenSources) return;

      savedTokenSourcesCache = data.tokenSources;

      // 1. Populate Dropdown in Add Page Modal
      if (select) {
        select.innerHTML = '<option value="">-- Chọn nguồn tài khoản đã lưu --</option>' +
          data.tokenSources.map(ts => `
            <option value="${ts.id}">${escapeHtml(ts.name)} ${ts.app_id ? `[App: ${escapeHtml(ts.app_id)}]` : ''} (${ts.current_pages_count || ts.pages_count || 0} Page)</option>
          `).join('');
      }

      // 2. Populate Grid in view-pages
      if (container) {
        if (data.tokenSources.length === 0) {
          container.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 18px; text-align: center; color: var(--text-muted); background: rgba(15, 23, 42, 0.4); border: 1px dashed var(--border-color); border-radius: 6px; font-size: 13px;">
              Chưa có nguồn Token nào được lưu. Bấm <strong>"➕ Quét & Thêm Fanpage Mới"</strong> và điền App ID + App Secret để tự động lưu mã Token Vĩnh Viễn!
            </div>
          `;
          return;
        }

        container.innerHTML = data.tokenSources.map(ts => {
          const isPerm = ts.is_permanent === 1;
          const avatarHtml = ts.avatar_url ? `
            <img src="${escapeHtml(ts.avatar_url)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #3b82f6; flex-shrink: 0;" alt="${escapeHtml(ts.name)}">
          ` : `
            <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #1877f2, #3b82f6); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0;">
              ${escapeHtml((ts.name || 'FB').charAt(0).toUpperCase())}
            </div>
          `;

          return `
            <div class="token-source-card" data-id="${ts.id}">
              <div class="token-source-header">
                <div style="display: flex; gap: 10px; align-items: center;">
                  ${avatarHtml}
                  <div>
                    <h5 class="token-source-name" style="display: flex; align-items: center; gap: 6px;">
                      <span>${escapeHtml(ts.name)}</span>
                      ${ts.fb_user_id ? `<span class="badge-tag" style="background: rgba(24, 119, 242, 0.2); color: #60a5fa; font-size: 10px; padding: 1px 6px;">Facebook</span>` : ''}
                    </h5>
                    <div class="token-source-meta" style="margin-top: 2px;">
                      ${ts.fb_user_id ? `<span>FB ID: <code>${escapeHtml(ts.fb_user_id)}</code></span>` : (ts.app_id ? `<span>App ID: <code>${escapeHtml(ts.app_id)}</code></span>` : '')}
                      <span>Lưu lúc: ${new Date(ts.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                </div>
                <span class="${isPerm ? 'token-source-badge-permanent' : 'token-source-badge-standard'}">
                  ${isPerm ? '🛡️ Vĩnh Viễn' : '🕒 Dài Hạn'}
                </span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
                <span style="color: var(--text-muted);">
                  Đang quản lý: <strong style="color: #60a5fa;">${ts.current_pages_count || ts.pages_count || 0} Fanpage</strong>
                </span>
                <div class="token-source-actions">
                  <button class="btn btn-xs btn-warning btn-renew-token-source" data-id="${ts.id}" title="Đổi / Cập nhật mã Token ngắn hạn mới">
                    ⚡ Đổi Token
                  </button>
                  <button class="btn btn-xs btn-primary btn-scan-token-source" data-id="${ts.id}" title="Quét lại các Fanpage thuộc nguồn này">
                    🔄 Quét Lại
                  </button>
                  <button class="btn btn-xs btn-secondary btn-copy-token-source" data-token="${escapeHtml(ts.long_lived_token || ts.user_token)}" title="Sao chép mã Token">
                    📋 Copy
                  </button>
                  <button class="btn btn-xs btn-danger btn-delete-token-source" data-id="${ts.id}" title="Xóa nguồn token này">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');

        // Wire Token Source Card Buttons
        container.querySelectorAll('.btn-renew-token-source').forEach(btn => {
          btn.addEventListener('click', () => {
            const sourceId = Number(btn.dataset.id);
            const source = savedTokenSourcesCache.find(s => s.id === sourceId);
            if (!source) return;

            document.getElementById('renewSourceId').value = source.id;
            document.getElementById('renewSourceNameInput').value = source.name;
            document.getElementById('renewSourceAppIdInput').value = source.app_id || '';
            document.getElementById('renewSourceAppSecretInput').value = source.app_secret || '';
            document.getElementById('renewSourceTokenInput').value = '';

            openModal('renewTokenSourceModal');
          });
        });

        container.querySelectorAll('.btn-scan-token-source').forEach(btn => {
          btn.addEventListener('click', async () => {
            const sourceId = btn.dataset.id;
            openModal('addPageModal');
            // Switch to tab 2
            document.querySelectorAll('.modal-tab-btn').forEach(b => {
              b.classList.remove('active', 'btn-primary');
              b.classList.add('btn-secondary');
            });
            const tabBtn = document.querySelector('.modal-tab-btn[data-tab="tab-saved-tokens"]');
            if (tabBtn) {
              tabBtn.classList.add('active', 'btn-primary');
              tabBtn.classList.remove('btn-secondary');
            }
            document.querySelectorAll('.token-tab-pane').forEach(p => p.style.display = 'none');
            const paneSaved = document.getElementById('paneSavedTokens');
            if (paneSaved) paneSaved.style.display = 'block';

            if (select) {
              select.value = sourceId;
              select.dispatchEvent(new Event('change'));
            }

            document.getElementById('btnScanSavedTokenSource')?.click();
          });
        });

        container.querySelectorAll('.btn-copy-token-source').forEach(btn => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.token);
            showToast('Đã sao chép mã Token vào clipboard!', 'success');
          });
        });

        container.querySelectorAll('.btn-delete-token-source').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Xóa nguồn Token này khỏi kho lưu trữ? (Các Fanpage đã thêm trước đó vẫn tiếp tục hoạt động bình thường)')) return;
            try {
              const res = await fetch(`/api/token-sources/${btn.dataset.id}`, { method: 'DELETE' });
              const data = await res.json();
              showToast(data.message || 'Đã xóa nguồn Token!', data.ok ? 'success' : 'error');
              loadTokenSources();
              loadPages();
            } catch (e) {
              showToast('Lỗi: ' + e.message, 'error');
            }
          });
        });
      }
    } catch (err) {
      console.error('Error loading token sources:', err);
    }
  }

  async function loadPages() {
    const grid = document.getElementById('pagesGrid');
    const shiftSelect = document.getElementById('shiftPageSelect');
    const pageFilter = document.getElementById('sidebarPageFilter');

    // Sync saved token vault
    loadTokenSources();

    try {
      const res = await fetch('/api/pages');
      const data = await res.json();

      if (!data.ok || !data.pages || data.pages.length === 0) {
        if (grid) {
          grid.innerHTML = `
            <div class="empty-state-sidebar" style="grid-column: 1 / -1; padding: 48px;">
              <div class="empty-icon">📄</div>
              <h3>Chưa kết nối Fanpage nào</h3>
              <p>Bấm nút "Quét & Thêm Fanpage Mới" ở trên để kết nối Fanpage qua Facebook Token dài hạn.</p>
            </div>
          `;
        }
        if (shiftSelect) shiftSelect.innerHTML = '<option value="">Chưa có Fanpage</option>';
        return;
      }

      // Populate selects
      if (shiftSelect) {
        shiftSelect.innerHTML = data.pages.map(p => 
          `<option value="${p.page_id}">${escapeHtml(p.name)} (${p.page_id})`
        ).join('');
      }

      if (pageFilter) {
        pageFilter.innerHTML = '<option value="">Tất cả Page</option>' + data.pages.map(p => 
          `<option value="${p.page_id}">${escapeHtml(p.name)}`
        ).join('');
      }

      if (grid) {
        grid.innerHTML = data.pages.map(p => {
          const isValid = p.token_status === 'VALID';
          const isPerm = p.is_permanent === 1;
          const accountLabel = p.account_label || p.token_source_name || '';

          return `
            <div class="page-card" data-id="${p.id}" data-page-id="${p.page_id}">
              <div class="page-card-header">
                ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="page-card-avatar" alt="Avatar">` : `<div class="page-card-avatar">${escapeHtml(p.name).charAt(0)}</div>`}
                <div class="page-card-title">
                  <h4>${escapeHtml(p.name)}</h4>
                  <span>ID: ${p.page_id} ${accountLabel ? `• <span class="token-tag-account">${escapeHtml(accountLabel)}</span>` : ''}</span>
                </div>
              </div>

              <div class="page-card-meta">
                <span>Sức khỏe Token:</span>
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                  <span class="${isValid ? 'token-badge-valid' : 'token-badge-invalid'}">
                    ${isValid ? '✅ Hoạt Động' : '❌ Hết Hạn'}
                  </span>
                  ${isPerm ? '<span class="token-source-badge-permanent">🛡️ Vĩnh Viễn</span>' : '<span class="token-source-badge-standard">🕒 Dài Hạn</span>'}
                </div>
              </div>

              <div class="page-card-actions">
                <button class="btn btn-sm btn-secondary btn-inspect-token" data-page-id="${p.page_id}">
                  🔍 Soi Token
                </button>
                <button class="btn btn-sm btn-secondary btn-goto-shifts" data-page-id="${p.page_id}">
                  ⏰ Cài Ca Trực
                </button>
                <button class="btn btn-sm btn-secondary btn-subscribe-page" data-id="${p.id}">
                  🌐 Webhook
                </button>
                <button class="btn btn-sm btn-danger btn-delete-page" data-id="${p.id}">
                  Xóa
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Wire page card buttons
        grid.querySelectorAll('.btn-inspect-token').forEach(btn => {
          btn.addEventListener('click', () => {
            openTokenInspectModal(btn.dataset.pageId);
          });
        });

        grid.querySelectorAll('.btn-goto-shifts').forEach(btn => {
          btn.addEventListener('click', () => {
            switchView('view-shifts');
            const select = document.getElementById('shiftPageSelect');
            if (select) select.value = btn.dataset.pageId;
          });
        });

        grid.querySelectorAll('.btn-subscribe-page').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              const r = await fetch(`/api/pages/${btn.dataset.id}/subscribe`, { method: 'POST' });
              const d = await r.json();
              showToast(d.message || 'Đã kích hoạt Webhook!', d.ok ? 'success' : 'error');
            } catch (e) {
              showToast('Lỗi: ' + e.message, 'error');
            }
          });
        });

        grid.querySelectorAll('.btn-delete-page').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Bạn có chắc chắn muốn xóa Fanpage này khỏi hệ thống?')) return;
            try {
              const r = await fetch(`/api/pages/${btn.dataset.id}`, { method: 'DELETE' });
              const d = await r.json();
              showToast(d.message || 'Đã xóa trang!', d.ok ? 'success' : 'error');
              loadPages();
              loadStatus();
            } catch (e) {
              showToast('Lỗi: ' + e.message, 'error');
            }
          });
        });
      }

    } catch (err) {
      console.error('Error loading pages:', err);
    }
  }

  // Helper: render discovered pages checklist in modal
  function renderDiscoveredPagesChecklist(pages) {
    discoveredPagesCache = pages;
    const card = document.getElementById('discoveredPagesCard');
    const list = document.getElementById('discoveredPagesList');
    const importBtn = document.getElementById('btnImportSelectedPages');

    if (!card || !list || !importBtn) return;

    card.style.display = 'block';
    importBtn.style.display = 'inline-flex';

    list.innerHTML = pages.map((p, idx) => {
      const isPerm = Boolean(p.is_permanent);
      return `
        <label class="page-check-item selected" data-index="${idx}">
          <input type="checkbox" class="discovered-page-check" data-index="${idx}" checked>
          ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" style="width: 28px; height: 28px; border-radius: 6px; object-fit: cover;" alt="">` : '<span style="font-size: 18px;">📄</span>'}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 13px; color: var(--text-primary);">${escapeHtml(p.name)}</strong>
              ${isPerm ? '<span class="token-source-badge-permanent" style="font-size: 10px; padding: 1px 6px;">🛡️ Vĩnh Viễn</span>' : ''}
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">ID: ${p.page_id} ${p.category ? `• ${escapeHtml(p.category)}` : ''}</div>
          </div>
        </label>
      `;
    }).join('');

    list.querySelectorAll('.discovered-page-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const parent = chk.closest('.page-check-item');
        if (chk.checked) parent.classList.add('selected');
        else parent.classList.remove('selected');
      });
    });
  }

  // -------------------------------------------------------------
  // Facebook 1-Click OAuth Login & Multi-Account
  // -------------------------------------------------------------
  document.getElementById('btnFacebookOAuthLogin')?.addEventListener('click', () => {
    const width = 650;
    const height = 750;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));

    const popup = window.open(
      '/auth/facebook?popup=1&reauth=1',
      'fb_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      showToast('Trình duyệt đã chặn cửa sổ pop-up. Đang mở trang đăng nhập trực tiếp...', 'info');
      window.location.href = '/auth/facebook?reauth=1';
    }
  });

  // Listen for OAuth Success or Error from Popup Window
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'FB_AUTH_SUCCESS') {
      showToast(`🎉 Đăng nhập thành công tài khoản Facebook "${event.data.accountName}"! Đã kết nối ${event.data.pagesCount} Fanpage.`, 'success');
      loadPages();
      loadTokenSources();
      loadConversations();
    } else if (event.data.type === 'FB_AUTH_ERROR') {
      showToast(`⚠️ Đăng nhập Facebook không thành công: ${event.data.error}`, 'error');
    }
  });

  // Check URL query on initial load for direct redirect callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('fb_auth_success') === '1') {
    const accName = urlParams.get('account') || 'Facebook';
    const pagesCount = urlParams.get('pages') || '';
    showToast(`🎉 Đăng nhập thành công tài khoản Facebook "${accName}"${pagesCount ? ` (${pagesCount} Fanpage)` : ''}!`, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
    loadPages();
    loadTokenSources();
  } else if (urlParams.get('fb_error')) {
    showToast(`⚠️ Lỗi Facebook: ${urlParams.get('fb_error')}`, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Wire Facebook App Config Modal
  document.getElementById('openFbAppConfigBtn')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/facebook-app-config');
      const data = await res.json();
      if (data.ok) {
        document.getElementById('fbConfigAppIdInput').value = data.appId || '';
        document.getElementById('fbConfigAppSecretInput').value = '';
        document.getElementById('fbConfigAppSecretInput').placeholder = data.hasAppSecret ? '•••••••••••••••• (Đã lưu bí mật)' : 'Chuỗi mã bí mật (e8fe1eea...)';

        const urisContainer = document.getElementById('oauthRedirectUrisContainer');
        if (urisContainer) {
          urisContainer.innerHTML = (data.redirectUris || []).map(uri => `
            <div style="display: flex; gap: 8px; align-items: center; background: var(--bg-input); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <code style="font-size: 12px; color: #60a5fa; flex: 1; word-break: break-all;">${escapeHtml(uri)}</code>
              <button type="button" class="btn btn-xs btn-secondary btn-copy-redirect-uri" data-uri="${escapeHtml(uri)}" style="white-space: nowrap;">
                📋 Sao Chép
              </button>
            </div>
          `).join('');

          urisContainer.querySelectorAll('.btn-copy-redirect-uri').forEach(btn => {
            btn.addEventListener('click', () => {
              navigator.clipboard.writeText(btn.dataset.uri);
              showToast('Đã sao chép Redirect URI vào clipboard!', 'success');
            });
          });
        }

        openModal('facebookAppConfigModal');
      }
    } catch (e) {
      showToast('Lỗi tải cấu hình App: ' + e.message, 'error');
    }
  });

  document.getElementById('closeFbAppConfigBtn')?.addEventListener('click', () => closeModal('facebookAppConfigModal'));
  document.getElementById('cancelFbAppConfigBtn')?.addEventListener('click', () => closeModal('facebookAppConfigModal'));

  document.getElementById('saveFbAppConfigBtn')?.addEventListener('click', async () => {
    const appId = document.getElementById('fbConfigAppIdInput').value.trim();
    const appSecret = document.getElementById('fbConfigAppSecretInput').value.trim();

    if (!appId) {
      showToast('Vui lòng nhập App ID của Facebook App!', 'error');
      return;
    }

    try {
      const res = await fetch('/api/facebook-app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Đã lưu cấu hình Facebook App thành công!', 'success');
        closeModal('facebookAppConfigModal');
      } else {
        showToast(data.error || 'Lỗi lưu cấu hình', 'error');
      }
    } catch (e) {
      showToast('Lỗi kết nối: ' + e.message, 'error');
    }
  });

  // Open Add Page Modal
  document.getElementById('openAddPageModalBtn')?.addEventListener('click', () => {
    openModal('addPageModal');
    document.getElementById('discoveredPagesCard').style.display = 'none';
    document.getElementById('btnImportSelectedPages').style.display = 'none';
    loadTokenSources();
  });

  // Modal Tabs Switcher
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab-btn').forEach(b => {
        b.classList.remove('active', 'btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-secondary');

      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.token-tab-pane').forEach(p => p.style.display = 'none');
      if (targetTab === 'tab-auto-longlived') {
        document.getElementById('paneAutoLongLived').style.display = 'block';
      } else if (targetTab === 'tab-saved-tokens') {
        document.getElementById('paneSavedTokens').style.display = 'block';
      } else if (targetTab === 'tab-direct-token') {
        document.getElementById('paneDirectToken').style.display = 'block';
      }
    });
  });

  // Wire Token Guide Modal Buttons
  document.getElementById('btnOpenTokenGuideFromModal')?.addEventListener('click', () => {
    openModal('tokenGuideModal');
  });
  document.getElementById('btnOpenTokenGuideFromPages')?.addEventListener('click', () => {
    openModal('tokenGuideModal');
  });
  document.getElementById('closeTokenGuideModalBtn')?.addEventListener('click', () => {
    closeModal('tokenGuideModal');
  });
  document.getElementById('closeTokenGuideModalFooterBtn')?.addEventListener('click', () => {
    closeModal('tokenGuideModal');
  });

  // Renew Token Source Modal Listeners
  document.getElementById('closeRenewTokenModalBtn')?.addEventListener('click', () => {
    closeModal('renewTokenSourceModal');
  });
  document.getElementById('cancelRenewTokenBtn')?.addEventListener('click', () => {
    closeModal('renewTokenSourceModal');
  });

  document.getElementById('btnSubmitRenewToken')?.addEventListener('click', async () => {
    const sourceId = document.getElementById('renewSourceId')?.value;
    const name = document.getElementById('renewSourceNameInput')?.value.trim();
    const appId = document.getElementById('renewSourceAppIdInput')?.value.trim();
    const appSecret = document.getElementById('renewSourceAppSecretInput')?.value.trim();
    const token = document.getElementById('renewSourceTokenInput')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitRenewToken');

    if (!token) {
      showToast('Vui lòng dán mã User Token mới!', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Đang đổi token...';
    }

    try {
      const res = await fetch(`/api/token-sources/${sourceId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          app_id: appId,
          app_secret: appSecret,
          name
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Cập nhật Token Vĩnh Viễn thành công!', 'success');
        closeModal('renewTokenSourceModal');
        loadTokenSources();
        loadPages();
      } else {
        showToast('Lỗi: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Đổi Token Vĩnh Viễn & Cập Nhật';
      }
    }
  });

  // Token Inspect Modal Listeners & Function
  document.getElementById('closeTokenInspectBtn')?.addEventListener('click', () => {
    closeModal('tokenInspectModal');
  });
  document.getElementById('closeTokenInspectFooterBtn')?.addEventListener('click', () => {
    closeModal('tokenInspectModal');
  });

  async function openTokenInspectModal(pageId) {
    const modal = document.getElementById('tokenInspectModal');
    const body = document.getElementById('tokenInspectBody');
    if (!modal || !body) return;

    openModal('tokenInspectModal');
    body.innerHTML = `
      <div style="text-align: center; padding: 28px 16px; color: var(--text-muted);">
        <div style="font-size: 28px; margin-bottom: 10px; animation: spin 1s infinite linear;">⚙️</div>
        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Đang kết nối Meta Graph API...</div>
        <div style="font-size: 12px;">Đang soi mã Token và thời hạn từ máy chủ Facebook...</div>
      </div>
    `;

    try {
      const res = await fetch(`/api/pages/${pageId}/debug-token`);
      const data = await res.json();
      if (!data.ok) {
        body.innerHTML = `<div class="alert alert-danger" style="margin: 12px 0;">Lỗi Meta: ${escapeHtml(data.error || 'Không thể kiểm tra token')}</div>`;
        return;
      }

      const d = data.debug;
      const isPerm = Boolean(d.isPermanent);
      const isValid = Boolean(d.isValid);

      body.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <div>
              <strong style="font-size: 15px; color: var(--text-primary); display: block;">${escapeHtml(data.name)}</strong>
              <span style="font-family: monospace; font-size: 11px; color: var(--text-muted);">ID Trang: ${escapeHtml(data.pageId)}</span>
            </div>
            <div>
              ${isPerm ? '<span class="token-source-badge-permanent" style="font-size: 12px; padding: 3px 10px;">🛡️ Vĩnh Viễn</span>' : '<span class="token-source-badge-standard" style="font-size: 12px; padding: 3px 10px;">🕒 Có Hạn</span>'}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <div style="background: rgba(30, 41, 59, 0.8); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.04);">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 3px;">Trạng Thái Token:</div>
              <div style="font-weight: 700; color: ${isValid ? '#34d399' : '#f87171'}; font-size: 13px;">
                ${isValid ? '✅ Hợp Lệ (VALID)' : '❌ Hết Hạn / Lỗi'}
              </div>
            </div>

            <div style="background: rgba(30, 41, 59, 0.8); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.04);">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 3px;">Thời Hạn Sử Dụng:</div>
              <div style="font-weight: 700; font-size: 13px; color: ${isPerm ? '#34d399' : '#fbbf24'};">
                ${escapeHtml(d.expiresAtText || (isPerm ? 'Vĩnh Viễn (Never Expires)' : 'Có hạn'))}
              </div>
            </div>
          </div>

          <div style="font-size: 12px; line-height: 1.8; color: var(--text-secondary);">
            <div>📱 <strong>Ứng Dụng Meta (App):</strong> <span style="color: var(--text-primary);">${escapeHtml(d.application || 'N/A')}</span> ${d.appId ? `(App ID: <code>${escapeHtml(d.appId)}</code>)` : ''}</div>
            <div>🔑 <strong>Loại Token:</strong> <code>${escapeHtml(d.type || 'PAGE')}</code></div>
            ${d.issuedAt ? `<div>📅 <strong>Thời Điểm Cấp:</strong> ${escapeHtml(d.issuedAt)}</div>` : ''}
            ${d.error ? `<div style="color: #f87171; margin-top: 6px; background: rgba(239, 68, 68, 0.1); padding: 6px 10px; border-radius: 4px;">⚠️ <strong>Chi tiết lỗi:</strong> ${escapeHtml(d.error)}</div>` : ''}
          </div>

          ${d.scopes && d.scopes.length > 0 ? `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Quyền Meta (Scopes) Đã Cấp:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${d.scopes.map(s => `<span class="badge-tag" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 11px; font-family: monospace;">✓ ${escapeHtml(s)}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5; padding: 2px 4px;">
          💡 <em>Giải thích: Khi Token hiển thị <strong>🛡️ Vĩnh Viễn</strong> (mã <code>expires_at: 0</code> từ Meta), Token này không bao giờ tự hết hạn sau 60 ngày.</em>
        </div>
      `;

      if (isPerm) loadPages();

    } catch (err) {
      body.innerHTML = `<div class="alert alert-danger" style="margin: 12px 0;">Lỗi kết nối: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Saved Token Source Select Change Handler
  document.getElementById('modalSavedTokenSourceSelect')?.addEventListener('change', (e) => {
    const sourceId = Number(e.target.value);
    const preview = document.getElementById('savedSourceDetailPreview');
    if (!sourceId || !preview) {
      if (preview) preview.style.display = 'none';
      return;
    }

    const source = savedTokenSourcesCache.find(s => s.id === sourceId);
    if (source) {
      preview.style.display = 'block';
      document.getElementById('previewSourceName').textContent = source.name;
      document.getElementById('previewSourceAppId').textContent = source.app_id || 'Không có';
      document.getElementById('previewSourcePagesCount').textContent = `${source.current_pages_count || source.pages_count || 0} Page`;
      document.getElementById('previewSourceType').textContent = source.is_permanent === 1 ? '🛡️ Vĩnh Viễn (Never Expire)' : '🕒 Dài Hạn';
      activeScanTokenSourceId = source.id;
    }
  });

  // Scan Button 1: Auto Exchange Long-Lived Token (App ID + Secret)
  document.getElementById('btnFetchTokenPages')?.addEventListener('click', async () => {
    const appId = document.getElementById('modalAppId')?.value.trim();
    const appSecret = document.getElementById('modalAppSecret')?.value.trim();
    const token = document.getElementById('modalUserToken')?.value.trim();
    const accountLabel = document.getElementById('modalAccountLabel')?.value.trim();

    if (!token) {
      showToast('Vui lòng nhập Token Facebook ban đầu!', 'error');
      return;
    }
    if (!appId || !appSecret) {
      showToast('Vui lòng điền đủ cả App ID và App Secret để Tool tự đổi Token Vĩnh Viễn!', 'error');
      return;
    }

    const scanBtn = document.getElementById('btnFetchTokenPages');
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span>⏳ Đang đổi Token dài hạn & quét Graph API...</span>';

    try {
      showToast('Đang kết nối Meta Graph API để đổi Token Vĩnh Viễn...', 'info');
      const res = await fetch('/api/pages/fetch-from-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret,
          token,
          account_label: accountLabel
        })
      });
      const data = await res.json();

      if (!data.ok || !data.pages || data.pages.length === 0) {
        showToast('Không tìm thấy Fanpage nào: ' + (data.error || 'Token không có quyền quản lý Page'), 'error');
        return;
      }

      activeScanTokenSourceId = data.token_source_id || 0;
      renderDiscoveredPagesChecklist(data.pages);
      loadTokenSources();
      showToast(`🎉 Đã đổi thành công Token Vĩnh Viễn! Tìm thấy ${data.pages.length} Fanpage.`, 'success');

    } catch (err) {
      showToast('Lỗi khi đổi token & quét page: ' + err.message, 'error');
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span>⚡ Đổi Token Dài Hạn & Quét Page Vĩnh Viễn</span>';
    }
  });

  // Scan Button 2: Scan from Saved Token Source
  document.getElementById('btnScanSavedTokenSource')?.addEventListener('click', async () => {
    const select = document.getElementById('modalSavedTokenSourceSelect');
    const sourceId = select ? select.value : '';

    if (!sourceId) {
      showToast('Vui lòng chọn 1 nguồn Token đã lưu trước đó!', 'error');
      return;
    }

    const btn = document.getElementById('btnScanSavedTokenSource');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang quét Graph API từ nguồn đã lưu...</span>';

    try {
      const res = await fetch(`/api/token-sources/${sourceId}/scan`, { method: 'POST' });
      const data = await res.json();

      if (!data.ok || !data.pages || data.pages.length === 0) {
        showToast('Không tìm thấy Fanpage nào: ' + (data.error || 'Token không hợp lệ hoặc đã hết quyền'), 'error');
        return;
      }

      activeScanTokenSourceId = Number(sourceId);
      renderDiscoveredPagesChecklist(data.pages);
      showToast(`Đã tìm thấy ${data.pages.length} Fanpage từ nguồn đã lưu!`, 'success');
    } catch (err) {
      showToast('Lỗi khi quét nguồn đã lưu: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🔄 Quét Lại Danh Sách Page Từ Nguồn Này</span>';
    }
  });

  // Scan Button 3: Direct Token Input
  document.getElementById('btnScanDirectToken')?.addEventListener('click', async () => {
    const token = document.getElementById('modalPageAccessToken')?.value.trim();
    const accountLabel = document.getElementById('modalDirectAccountLabel')?.value.trim();

    if (!token) {
      showToast('Vui lòng dán Access Token vào trước khi quét!', 'error');
      return;
    }

    const scanBtn = document.getElementById('btnScanDirectToken');
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span>⏳ Đang quét Graph API...</span>';

    try {
      const res = await fetch('/api/pages/fetch-from-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, account_label: accountLabel })
      });
      const data = await res.json();

      if (!data.ok || !data.pages || data.pages.length === 0) {
        showToast('Không tìm thấy Fanpage nào: ' + (data.error || 'Token không có quyền quản lý Page'), 'error');
        return;
      }

      activeScanTokenSourceId = data.token_source_id || 0;
      renderDiscoveredPagesChecklist(data.pages);
      loadTokenSources();
      showToast(`Đã quét thấy ${data.pages.length} Fanpage trong tài khoản!`, 'success');

    } catch (err) {
      showToast('Lỗi khi quét token: ' + err.message, 'error');
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span>🔍 Quét & Lấy Danh Sách Page Từ Token Này</span>';
    }
  });

  // Select All Discovered Pages Checkbox
  document.getElementById('selectAllDiscoveredPages')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.discovered-page-check').forEach(chk => {
      chk.checked = isChecked;
      const parent = chk.closest('.page-check-item');
      if (isChecked) parent.classList.add('selected');
      else parent.classList.remove('selected');
    });
  });

  // Import Selected Pages Button
  document.getElementById('btnImportSelectedPages')?.addEventListener('click', async () => {
    const selectedIndexes = [];
    document.querySelectorAll('.discovered-page-check:checked').forEach(chk => {
      selectedIndexes.push(parseInt(chk.dataset.index, 10));
    });

    if (selectedIndexes.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 Fanpage để thêm!', 'error');
      return;
    }

    const pagesToImport = selectedIndexes.map(idx => discoveredPagesCache[idx]);
    const accountLabel = document.getElementById('modalAccountLabel')?.value.trim() ||
                         document.getElementById('modalDirectAccountLabel')?.value.trim() || '';

    try {
      const res = await fetch('/api/pages/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_label: accountLabel,
          token_source_id: activeScanTokenSourceId,
          pages: pagesToImport
        })
      });
      const data = await res.json();

      if (data.ok) {
        showToast(data.message || `Đã thêm thành công ${pagesToImport.length} Fanpage!`, 'success');
        closeModal('addPageModal');
        loadPages();
        loadStatus();
      } else {
        showToast('Lỗi khi thêm: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // Token Health Check Button
  document.getElementById('runHealthCheckBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('runHealthCheckBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang kiểm tra...</span>';

    try {
      const res = await fetch('/api/pages/health-check', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã kiểm tra xong sức khỏe tất cả Token Fanpage!', 'success');
        loadPages();
      }
    } catch (err) {
      showToast('Lỗi kiểm tra token: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🔍</span> Kiểm Tra Sức Khỏe Token';
    }
  });

  // -------------------------------------------------------------
  // 8. My Shifts (Lịch Trực Ca Của Tôi)
  // -------------------------------------------------------------
  async function loadMyShifts() {
    const tbody = document.getElementById('myShiftsTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/my-shifts');
      const data = await res.json();

      if (!data.ok || !data.shifts || data.shifts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Bạn chưa cài đặt khung giờ trực ca nào (Mặc định: Bạn trực 24/7 cho tất cả Page).</td></tr>';
        return;
      }

      tbody.innerHTML = data.shifts.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.page_name || s.page_id)}</strong></td>
          <td>${escapeHtml(s.shift_name)}</td>
          <td><code>${s.shift_start} - ${s.shift_end}</code></td>
          <td><span style="color: #34d399; font-weight: 700;">🟢 Đang Bật</span></td>
          <td>
            <button class="btn btn-sm btn-danger btn-delete-myshift" data-id="${s.id}">Xóa</button>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-delete-myshift').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Xóa ca trực này?')) return;
          try {
            const r = await fetch(`/api/my-shifts/${btn.dataset.id}`, { method: 'DELETE' });
            const d = await r.json();
            showToast(d.message || 'Đã xóa ca', d.ok ? 'success' : 'error');
            loadMyShifts();
          } catch (e) {
            showToast('Lỗi: ' + e.message, 'error');
          }
        });
      });

    } catch (err) {
      console.error('Error loading my shifts:', err);
    }
  }

  // Quick Shift Presets in View 3
  document.querySelectorAll('.shift-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('shiftStartTimeInput').value = btn.dataset.start;
      document.getElementById('shiftEndTimeInput').value = btn.dataset.end;
      document.getElementById('shiftNameInput').value = btn.dataset.name;
    });
  });

  // Save My Shift Button
  document.getElementById('btnAddShiftBtn')?.addEventListener('click', async () => {
    const pageId = document.getElementById('shiftPageSelect')?.value;
    const shiftName = document.getElementById('shiftNameInput')?.value.trim() || 'Ca trực';
    const shiftStart = document.getElementById('shiftStartTimeInput')?.value;
    const shiftEnd = document.getElementById('shiftEndTimeInput')?.value;

    if (!pageId) {
      showToast('Vui lòng kết nối Fanpage trước khi cài ca trực!', 'error');
      return;
    }

    try {
      const res = await fetch('/api/my-shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: pageId,
          shift_name: shiftName,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          is_active: true
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã lưu ca trực của bạn thành công!', 'success');
        loadMyShifts();
      } else {
        showToast('Lỗi: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // -------------------------------------------------------------
  // 9. Alarm Settings (Web Audio, CallMeBot, Telegram, Logs)
  // -------------------------------------------------------------
  function toggleAlarmMethodPanes(method) {
    const ntfyPane = document.getElementById('hostNtfyPane');
    const callmebotPane = document.getElementById('hostCallmebotPane');
    const twilioPane = document.getElementById('hostTwilioPane');

    if (ntfyPane) ntfyPane.style.display = method === 'ntfy' ? 'block' : 'none';
    if (callmebotPane) callmebotPane.style.display = method === 'callmebot' ? 'block' : 'none';
    if (twilioPane) twilioPane.style.display = method === 'twilio' ? 'block' : 'none';
  }

  document.querySelectorAll('input[name="hostAlarmMethod"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      toggleAlarmMethodPanes(e.target.value);
    });
  });

  document.getElementById('hostWebSoundVolume')?.addEventListener('input', (e) => {
    document.getElementById('webSoundVolumeVal').textContent = e.target.value + '%';
  });

  document.getElementById('hostWebSoundType')?.addEventListener('change', (e) => {
    const vol = parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10) / 100;
    alarmAudioEngine.playSingleChime(vol, e.target.value);
  });

  document.getElementById('testWebAudioChimeBtn')?.addEventListener('click', () => {
    const vol = parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10) / 100;
    const soundType = document.getElementById('hostWebSoundType')?.value || 'loud_chime';
    alarmAudioEngine.playSingleChime(vol, soundType);
    const soundNames = {
      loud_chime: '🔔 Chuông Đôi Ngân Vang Đanh To',
      phone_ring: '📱 Chuông Điện Thoại Réo Rắt',
      digital_alarm: '⏰ Đồng Hồ Điện Tử Bíp Dồn Dập',
      siren: '🚨 Còi Hú Khẩn Cấp Cứu Hỏa'
    };
    showToast('🔊 Đang phát: ' + (soundNames[soundType] || soundType), 'info');
  });

  // Save Host Config Button
  document.getElementById('saveHostConfigBtn')?.addEventListener('click', async () => {
    const payload = {
      name: document.getElementById('hostProfileName')?.value.trim() || 'Chủ Host',
      pin_code: document.getElementById('hostProfilePin')?.value.trim() || '1234',
      web_sound_enabled: document.getElementById('hostWebSoundToggle')?.checked ? 'true' : 'false',
      web_sound_volume: parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10),
      web_sound_type: document.getElementById('hostWebSoundType')?.value || 'loud_chime',
      alarm_enabled: document.getElementById('hostAlarmEnabledToggle')?.checked ? 'true' : 'false',
      alarm_schedule_enabled: document.getElementById('hostAlarmScheduleToggle')?.checked ? 'true' : 'false',
      alarm_start_time: document.getElementById('hostAlarmStartTime')?.value,
      alarm_end_time: document.getElementById('hostAlarmEndTime')?.value,
      telegram_enabled: document.getElementById('hostTelegramEnabledToggle')?.checked ? 'true' : 'false',
      telegram_chat_id: document.getElementById('hostTelegramChatId')?.value.trim(),
      telegram_bot_token: document.getElementById('hostTelegramBotToken')?.value.trim(),
      alarm_method: document.querySelector('input[name="hostAlarmMethod"]:checked')?.value || 'ntfy',
      ntfy_topic: document.getElementById('hostNtfyTopic')?.value?.trim() || 'fb-alarm-0976014480',
      callmebot_username: document.getElementById('hostCallmebotUsername')?.value?.trim() || '',
      twilio_to_number: document.getElementById('hostTwilioToNumber')?.value.trim() || '0976014480',
      twilio_account_sid: document.getElementById('hostTwilioAccountSid')?.value?.trim() || '',
      twilio_auth_token: document.getElementById('hostTwilioAuthToken')?.value?.trim() || '',
      twilio_from_number: document.getElementById('hostTwilioFromNumber')?.value?.trim() || '',
      pushover_user_key: document.getElementById('hostPushoverKey')?.value?.trim() || '',
      discord_enabled: document.getElementById('hostDiscordEnabledToggle')?.checked ? 'true' : 'false',
      discord_webhook_url: (() => {
        const inputVal = document.getElementById('hostDiscordWebhookUrl')?.value?.trim();
        return (inputVal !== undefined && inputVal !== '') ? inputVal : (hostProfile?.discord_webhook_url || '');
      })()
    };

    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        renderHostUI(hostProfile);

        const teleApiRoot = document.getElementById('hostTelegramApiRoot')?.value.trim();
        if (teleApiRoot !== undefined) {
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_api_root: teleApiRoot })
          }).catch(() => {});
        }

        showToast('Đã lưu toàn bộ cấu hình báo thức của bạn!', 'success');
      } else {
        showToast('Lỗi khi lưu: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // Test Host Telegram
  document.getElementById('testHostTelegramBtn')?.addEventListener('click', async () => {
    const botToken = document.getElementById('hostTelegramBotToken')?.value.trim();
    const chatId = document.getElementById('hostTelegramChatId')?.value.trim();
    const apiRoot = document.getElementById('hostTelegramApiRoot')?.value.trim();

    if (!chatId) {
      showToast('Vui lòng điền Chat ID Telegram trước khi test!', 'error');
      return;
    }

    try {
      showToast('Đang gửi tin nhắn thử nghiệm tới Telegram...', 'info');
      const res = await fetch('/api/test/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: botToken, chat_id: chatId, api_root: apiRoot })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Đã gửi thử tin Telegram thành công!', 'success');
      } else {
        showToast(data.error || 'Gửi tin nhắn Telegram thất bại!', 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });

  // Save Host Discord Webhook Button
  document.getElementById('saveHostDiscordBtn')?.addEventListener('click', async () => {
    const webhookUrl = document.getElementById('hostDiscordWebhookUrl')?.value.trim() || '';
    const enabled = document.getElementById('hostDiscordEnabledToggle')?.checked ? 'true' : 'false';

    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_webhook_url: webhookUrl,
          discord_enabled: enabled
        })
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        showToast('Đã lưu cấu hình Discord Webhook thành công!', 'success');
      } else {
        showToast('Lỗi khi lưu Discord: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // Toggle Discord Enabled Auto-Save
  document.getElementById('hostDiscordEnabledToggle')?.addEventListener('change', async (e) => {
    const enabled = e.target.checked ? 'true' : 'false';
    const webhookUrl = document.getElementById('hostDiscordWebhookUrl')?.value.trim() || '';
    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discord_enabled: enabled,
          discord_webhook_url: webhookUrl
        })
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        showToast(enabled === 'true' ? 'Đã BẬT thông báo Discord' : 'Đã TẮT thông báo Discord', 'info');
      }
    } catch (err) {}
  });

  // Test Host Discord Webhook (Unblocked globally + Image Support)
  document.getElementById('testHostDiscordBtn')?.addEventListener('click', async () => {
    const webhookUrl = document.getElementById('hostDiscordWebhookUrl')?.value.trim();
    if (!webhookUrl) {
      showToast('Vui lòng điền Discord Webhook URL trước khi thử!', 'error');
      return;
    }

    const btn = document.getElementById('testHostDiscordBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang gửi tới Discord...';

    try {
      showToast('Đang gửi tin nhắn thử nghiệm & ảnh mẫu tới Discord...', 'info');
      const res = await fetch('/api/test/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl })
      });
      const data = await res.json();
      if (data.ok) {
        // Auto-save to host profile
        try {
          const saveRes = await fetch('/api/host-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              discord_webhook_url: webhookUrl,
              discord_enabled: 'true'
            })
          });
          const saveData = await saveRes.json();
          if (saveData.ok && saveData.host) {
            hostProfile = saveData.host;
          }
        } catch (e) {}

        showToast('Đã gửi thử tin nhắn thành công và TỰ ĐỘNG LƯU Discord Webhook!', 'success');
      } else {
        showToast(data.error || 'Gửi tới Discord thất bại!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>📨</span> Gửi Thử Tin Discord & Ảnh Mẫu';
    }
  });

  // Auto-save Discord Webhook URL on blur/change
  const hostDiscordUrlInput = document.getElementById('hostDiscordWebhookUrl');
  if (hostDiscordUrlInput) {
    const autoSaveDiscordUrl = async () => {
      const url = hostDiscordUrlInput.value.trim();
      if (url && (!hostProfile || hostProfile.discord_webhook_url !== url)) {
        try {
          const res = await fetch('/api/host-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discord_webhook_url: url })
          });
          const data = await res.json();
          if (data.ok && data.host) {
            hostProfile = data.host;
          }
        } catch (err) {}
      }
    };
    hostDiscordUrlInput.addEventListener('change', autoSaveDiscordUrl);
    hostDiscordUrlInput.addEventListener('blur', autoSaveDiscordUrl);
  }

  // Test Alarm Phone Call / Ringtone
  document.getElementById('testHostAlarmCallBtn')?.addEventListener('click', async () => {
    const method = document.querySelector('input[name="hostAlarmMethod"]:checked')?.value || 'ntfy';
    const ntfyTopic = document.getElementById('hostNtfyTopic')?.value?.trim() || 'fb-alarm-0976014480';
    const callmebotUser = document.getElementById('hostCallmebotUsername')?.value?.trim() || '';
    const toNumber = document.getElementById('hostTwilioToNumber')?.value.trim() || '0976014480';
    const accountSid = document.getElementById('hostTwilioAccountSid')?.value?.trim() || '';
    const authToken = document.getElementById('hostTwilioAuthToken')?.value?.trim() || '';
    const fromNumber = document.getElementById('hostTwilioFromNumber')?.value?.trim() || '';

    const config = {
      alarm_method: method,
      ntfy_topic: ntfyTopic,
      callmebot_username: callmebotUser,
      twilio_to_number: toNumber,
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
      twilio_from_number: fromNumber
    };

    try {
      let promptMsg = 'Đang kích hoạt báo thức thử nghiệm...';
      if (method === 'ntfy') {
        promptMsg = `Đang kích hoạt Ringtone Báo thức tới topic "${ntfyTopic}"...`;
      } else if (method === 'callmebot') {
        promptMsg = `Đang gọi điện thoại qua Telegram tới "${callmebotUser}"...`;
      } else if (method === 'twilio') {
        promptMsg = `Đang kết nối tổng đài Twilio để gọi tới ${toNumber}...`;
      }
      showToast(promptMsg, 'info');

      const res = await fetch('/api/test/alarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      showToast(data.message || (data.ok ? 'Đã kích hoạt thành công!' : 'Lỗi kết nối'), data.ok ? 'success' : 'error');
      setTimeout(loadAlarmLogs, 1500);
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });

  // Silence Safety Alarm Button
  document.getElementById('silenceSafetyAlarmBtn')?.addEventListener('click', () => {
    alarmAudioEngine.stopContinuousAlarm();
    const banner = document.getElementById('safetyAlarmBanner');
    if (banner) banner.style.display = 'none';
    showToast('Đã tắt chuông báo động an toàn', 'info');
  });

  // Save Auto-Sleep Config Button (Card 4)
  document.getElementById('saveAutoSleepBtn')?.addEventListener('click', async () => {
    const enabled = document.getElementById('hostAutoSleepEnabledToggle')?.checked ? 'true' : 'false';
    const idleMinutes = document.getElementById('hostAutoSleepIdleMinutes')?.value || '10';

    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_sleep_enabled: enabled,
          auto_sleep_idle_minutes: idleMinutes
        })
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        showToast('Đã lưu cấu hình Tự Động Đi Ngủ thành công!', 'success');
      } else {
        showToast('Lỗi khi lưu Tự Động Đi Ngủ: ' + (data.error || 'Thất bại'), 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // Save Safety Alarm Config Button (Card 5)
  document.getElementById('saveSafetyAlarmBtn')?.addEventListener('click', async () => {
    const enabled = document.getElementById('hostSafetyAlarmEnabledToggle')?.checked ? 'true' : 'false';
    const delayMinutes = document.getElementById('hostSafetyAlarmDelayMinutes')?.value || '10';

    try {
      const res = await fetch('/api/host-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safety_alarm_enabled: enabled,
          safety_alarm_delay_minutes: delayMinutes
        })
      });
      const data = await res.json();
      if (data.ok && data.host) {
        hostProfile = data.host;
        showToast('Đã lưu cấu hình Báo Động An Toàn thành công!', 'success');
      } else {
        showToast('Lỗi khi lưu Báo Động An Toàn: ' + (data.error || 'Thất bại'), 'error');
      }
    } catch (err) {
      showToast('Lỗi mạng: ' + err.message, 'error');
    }
  });

  // -------------------------------------------------------------
  // User Activity & Idle Detection Engine (Auto-Sleep / Wake-up)
  // -------------------------------------------------------------
  let lastUserActivityTime = Date.now();
  let isClientSleeping = false;
  let heartbeatThrottleTimer = null;

  function onUserActive() {
    lastUserActivityTime = Date.now();

    // If client was sleeping due to auto-sleep, trigger wake-up
    if (isClientSleeping) {
      isClientSleeping = false;
      fetch('/api/host-profile/wake-up', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.host) {
            hostProfile = d.host;
            updateQuickControlsUI(hostProfile);
            showToast('☀️ Chào mừng quay trở lại! Đã tắt chế độ đi ngủ', 'success');
          }
        })
        .catch(() => {});
    }

    // Throttled heartbeat to server every 30 seconds
    if (!heartbeatThrottleTimer) {
      heartbeatThrottleTimer = setTimeout(() => {
        heartbeatThrottleTimer = null;
        fetch('/api/host-profile/heartbeat', { method: 'POST' }).catch(() => {});
      }, 30000);
    }
  }

  // Monitor user events across window & document
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, onUserActive, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      onUserActive();
    }
  });

  // Client-side inactivity checker every 10 seconds
  setInterval(() => {
    if (!hostProfile) return;
    if (hostProfile.auto_sleep_enabled !== 'true') return;
    if (hostProfile.alarm_enabled === 'true') {
      // Already in sleep mode
      return;
    }

    const idleMinutes = Number(hostProfile.auto_sleep_idle_minutes) || 10;
    const idleMs = idleMinutes * 60 * 1000;
    const idleElapsed = Date.now() - lastUserActivityTime;

    if (idleElapsed >= idleMs && !isClientSleeping) {
      isClientSleeping = true;
      console.log(`[Auto-Sleep] Phát hiện không thao tác trong ${Math.round(idleElapsed / 60000)}m. Kích hoạt Chế Động Đi Ngủ.`);
      fetch('/api/host-profile/auto-sleep', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.host) {
            hostProfile = d.host;
            updateQuickControlsUI(hostProfile);
            showToast(`🌙 Đã tự động kích hoạt Chế Độ Đi Ngủ sau ${idleMinutes} phút không thao tác`, 'info');
          }
        })
        .catch(e => console.warn('[Auto-Sleep] Fetch error:', e));
    }
  }, 10000);

  // Alarm Logs Table
  async function loadAlarmLogs() {
    const tbody = document.getElementById('alarmLogsTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/alarm-logs');
      const data = await res.json();

      if (!data.ok || !data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có nhật ký báo thức nào.</td></tr>';
        return;
      }

      tbody.innerHTML = data.logs.map(log => `
        <tr>
          <td>${new Date(log.created_at).toLocaleString('vi-VN')}</td>
          <td><strong>${escapeHtml(log.page_id || 'Mọi Page')}</strong></td>
          <td><code>${escapeHtml(log.method || 'N/A')}</code></td>
          <td>
            <span style="font-weight: 700; color: ${log.status === 'SUCCESS' ? '#34d399' : '#f87171'};">
              ${log.status === 'SUCCESS' ? '✅ Thành công' : '❌ Thất bại'}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(log.details || '')}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading alarm logs:', err);
    }
  }

  // -------------------------------------------------------------
  // 10. Quick Replies (Mẫu trả lời nhanh)
  // -------------------------------------------------------------
  async function loadQuickRepliesTable() {
    const tbody = document.getElementById('quickRepliesTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/quick-replies');
      const data = await res.json();

      if (!data.ok || !data.replies || data.replies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có mẫu câu trả lời nhanh nào.</td></tr>';
        return;
      }

      quickRepliesList = data.replies;
      renderQuickRepliesPills(data.replies);

      tbody.innerHTML = data.replies.map(qr => `
        <tr>
          <td><strong>${escapeHtml(qr.title)}</strong></td>
          <td>${escapeHtml(qr.content)}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary btn-copy-qr" data-content="${escapeHtml(qr.content)}">Sao chép</button>
              <button class="btn btn-sm btn-danger btn-delete-qr" data-id="${qr.id}">Xóa</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('.btn-copy-qr').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.content);
          showToast('Đã sao chép nội dung mẫu câu!', 'success');
        });
      });

      tbody.querySelectorAll('.btn-delete-qr').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Xóa mẫu câu này?')) return;
          try {
            await fetch(`/api/quick-replies/${btn.dataset.id}`, { method: 'DELETE' });
            loadQuickRepliesTable();
          } catch (e) {}
        });
      });

    } catch (err) {
      console.error('Error loading quick replies:', err);
    }
  }

  function renderQuickRepliesPills(replies) {
    const container = document.getElementById('quickRepliesPills');
    if (!container) return;

    container.innerHTML = replies.map(qr => `
      <button class="qr-pill" data-content="${escapeHtml(qr.content)}" title="${escapeHtml(qr.content)}">
        ${escapeHtml(qr.title)}
      </button>
    `).join('');

    container.querySelectorAll('.qr-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const input = document.getElementById('chatReplyInput');
        if (input) {
          input.value = pill.dataset.content;
          input.focus();
          autoResizeTextarea(input);
          updateCharCounter();
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  }

  // Open Add QR Modal
  document.getElementById('openAddQrModalBtn')?.addEventListener('click', () => {
    openModal('quickReplyModal');
    document.getElementById('qrModalId').value = '';
    document.getElementById('qrModalTitleInput').value = '';
    document.getElementById('qrModalContentInput').value = '';
  });

  // Submit QR
  document.getElementById('submitQrBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('qrModalTitleInput')?.value.trim();
    const content = document.getElementById('qrModalContentInput')?.value.trim();

    if (!title || !content) {
      showToast('Vui lòng điền đủ tiêu đề và nội dung!', 'error');
      return;
    }

    try {
      const res = await fetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã lưu mẫu câu thành công!', 'success');
        closeModal('quickReplyModal');
        loadQuickRepliesTable();
      } else {
        showToast('Lỗi: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  });

  // -------------------------------------------------------------
  // 11. Meta Webhook & Cloud Database
  // -------------------------------------------------------------
  async function loadSystemSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.ok && data.settings) {
        const verifyToken = data.settings.verify_token || 'fb_tool_verify_secret_2026';
        document.getElementById('verifyTokenInput').value = verifyToken;

        const publicUrl = data.settings.public_url || '';
        updateHeaderTunnelBadge(publicUrl);
      }
    } catch (err) {
      console.error('Error loading system settings:', err);
    }
  }

  document.getElementById('copyVerifyTokenBtn')?.addEventListener('click', () => {
    const input = document.getElementById('verifyTokenInput');
    if (input) {
      navigator.clipboard.writeText(input.value);
      showToast('Đã sao chép Verify Token vào clipboard!', 'success');
    }
  });

  document.getElementById('copyWebhookUrlBtn')?.addEventListener('click', () => {
    const input = document.getElementById('publicWebhookUrlInput');
    if (input && input.value.startsWith('http')) {
      navigator.clipboard.writeText(input.value);
      showToast('Đã sao chép Public Webhook URL!', 'success');
    } else {
      showToast('Chưa có Public URL! Vui lòng kích hoạt Tunnel trước.', 'error');
    }
  });

  // Start Tunnel
  document.getElementById('startTunnelBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('startTunnelBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Đang khởi tạo...';

    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Đã tạo Public Tunnel thành công: ' + data.url, 'success');
        loadSystemSettings();
      } else {
        showToast('Lỗi tạo tunnel: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🚀 Kích Hoạt Public Tunnel (1 Click)';
    }
  });

  // Stop Tunnel
  document.getElementById('stopTunnelBtn')?.addEventListener('click', async () => {
    try {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      showToast('Đã tắt Tunnel.', 'info');
      loadSystemSettings();
    } catch (err) {}
  });

  // Reconnect Tunnel (VPN / Network Location Change)
  async function handleReconnectTunnel() {
    const mainBtn = document.getElementById('reconnectTunnelBtn');
    const headerBtn = document.getElementById('reconnectHeaderTunnelBtn');

    if (mainBtn) {
      mainBtn.disabled = true;
      mainBtn.textContent = '⏳ Đang tái kết nối...';
    }
    if (headerBtn) {
      headerBtn.disabled = true;
      headerBtn.textContent = '⏳...';
    }

    showToast('Đang làm mới kết nối Cloudflare Tunnel theo mạng máy tính...', 'info');

    try {
      const res = await fetch('/api/tunnel/reconnect', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.url) {
        showToast('Đã làm mới kết nối thành công! Public URL: ' + data.url, 'success');
        updateHeaderTunnelBadge(data.url);
        loadSystemSettings();
      } else {
        showToast('Lỗi làm mới tunnel: ' + (data.error || 'Không xác định'), 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      if (mainBtn) {
        mainBtn.disabled = false;
        mainBtn.textContent = '🔄 Làm Mới Kết Nối Tunnel';
      }
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.textContent = '🔄 Làm Mới';
      }
    }
  }

  document.getElementById('reconnectTunnelBtn')?.addEventListener('click', handleReconnectTunnel);
  document.getElementById('reconnectHeaderTunnelBtn')?.addEventListener('click', handleReconnectTunnel);

  // View Supabase DDL SQL Modal
  document.getElementById('viewSupabaseSchemaBtn')?.addEventListener('click', async () => {
    openModal('supabaseSchemaModal');
    const textarea = document.getElementById('supabaseSqlTextarea');
    textarea.value = 'Đang tải file DDL từ server...';

    try {
      const res = await fetch('/api/supabase-schema');
      const data = await res.json();
      if (data.ok && data.sql) {
        textarea.value = data.sql;
      } else {
        textarea.value = '-- Không tìm thấy file schema tại data/supabase_schema.sql';
      }
    } catch (err) {
      textarea.value = '-- Lỗi tải: ' + err.message;
    }
  });

  document.getElementById('copySupabaseSqlBtn')?.addEventListener('click', () => {
    const textarea = document.getElementById('supabaseSqlTextarea');
    if (textarea) {
      navigator.clipboard.writeText(textarea.value);
      showToast('Đã sao chép toàn bộ Supabase Schema SQL!', 'success');
    }
  });

  // -------------------------------------------------------------
  // 12. Simulate Test Message Button
  // -------------------------------------------------------------
  document.getElementById('triggerTestMessageBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('triggerTestMessageBtn');
    btn.disabled = true;

    try {
      const res = await fetch('/api/test/simulate-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_name: 'Khách Hàng Thử Nghiệm',
          text: 'Shop ơi, sản phẩm này còn hàng không ạ? Tư vấn cho mình với nhé! SĐT: 0988123456'
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Đã bắn tin nhắn test thành công!', 'success');
      } else {
        showToast('Lỗi khi bắn tin test: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      setTimeout(() => { btn.disabled = false; }, 1000);
    }
  });

  // -------------------------------------------------------------
  // 13. System Status Bar Polling & Cloudflare Tunnel UI Sync
  // -------------------------------------------------------------
  function updateHeaderTunnelBadge(publicUrl) {
    const badge = document.getElementById('headerTunnelBadge');
    const urlText = document.getElementById('headerTunnelUrlText');
    const webhookInput = document.getElementById('publicWebhookUrlInput');
    const startBtn = document.getElementById('startTunnelBtn');
    const stopBtn = document.getElementById('stopTunnelBtn');

    if (publicUrl && publicUrl.startsWith('http')) {
      if (badge) badge.style.display = 'flex';
      if (urlText) {
        urlText.textContent = publicUrl.replace(/^https?:\/\//, '');
        urlText.title = publicUrl;
      }
      if (webhookInput) webhookInput.value = `${publicUrl}/webhook`;
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
    } else {
      if (badge) badge.style.display = 'none';
      if (urlText) {
        urlText.textContent = 'Đang kết nối...';
        urlText.title = '';
      }
      if (webhookInput) webhookInput.value = 'Chưa kích hoạt tunnel...';
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'none';
    }
  }

  // Copy Webhook from Top Header Badge
  document.getElementById('copyHeaderWebhookBtn')?.addEventListener('click', () => {
    const urlText = document.getElementById('headerTunnelUrlText');
    const fullUrl = urlText?.title;
    if (fullUrl && fullUrl.startsWith('http')) {
      const webhookUrl = `${fullUrl}/webhook`;
      navigator.clipboard.writeText(webhookUrl);
      showToast(`📋 Đã sao chép Webhook Callback URL:\n${webhookUrl}`, 'success');
    } else {
      showToast('Chưa có Public Tunnel URL!', 'error');
    }
  });

  async function loadStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.ok) {
        const badge = document.getElementById('alarmStatusBadge');
        const text = document.getElementById('alarmStatusText');
        const unrepliedBadge = document.getElementById('unrepliedCountBadge');
        const pageCountBadge = document.getElementById('pageCountBadge');

        // Sync Cloudflare Tunnel URL to Header and Settings
        if (data.publicUrl !== undefined) {
          updateHeaderTunnelBadge(data.publicUrl);
        }

        if (unrepliedBadge) {
          const unseen = data.stats.unseenConversations !== undefined
            ? data.stats.unseenConversations
            : (data.stats.unrepliedConversations || 0);
          unrepliedBadge.textContent = unseen;
          unrepliedBadge.style.display = unseen > 0 ? 'inline-flex' : 'none';
        }
        if (pageCountBadge) pageCountBadge.textContent = data.stats.totalPages || 0;

        if (badge && text) {
          if (data.alarmStatus && data.alarmStatus.active) {
            badge.className = 'server-status-pill';
            badge.style.borderColor = '#f43f5e';
            text.innerHTML = '<span style="color:#f43f5e; font-weight:700;">🌙 Đang Báo Thức</span>';
          } else {
            badge.className = 'server-status-pill';
            badge.style.borderColor = 'var(--border-color)';
            text.innerHTML = '<span style="color:#34d399; font-weight:700;">🟢 Sẵn Sàng</span>';
          }
        }
      }
    } catch (err) {
      console.error('Error loading status:', err);
    }
  }

  // -------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    return new Date(timestamp).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' });
  }

  // -------------------------------------------------------------
  // CRM & Customer Tags Management (Pancake.vn / Fchat.vn style)
  // -------------------------------------------------------------
  let allSystemTags = [];
  let activeCustomerCrm = null;
  let isCrmSidebarOpen = true;

  async function loadAllSystemTags() {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.ok && Array.isArray(data.tags)) {
        allSystemTags = data.tags;
        renderManageTagsList();
        if (activeCustomerCrm) {
          renderCrmTagsQuickPick();
        }
      }
    } catch (err) {
      console.warn('Error loading system tags:', err);
    }
  }

  async function loadCustomerCrm(pageId, senderId) {
    const emptyState = document.getElementById('crmEmptyState');
    const contentWrap = document.getElementById('crmContentWrap');
    if (!emptyState || !contentWrap) return;

    try {
      const res = await fetch(`/api/conversations/${pageId}/${senderId}/crm`);
      const data = await res.json();
      if (!data.ok || !data.crm) {
        emptyState.style.display = 'flex';
        contentWrap.style.display = 'none';
        return;
      }

      activeCustomerCrm = data.crm;
      emptyState.style.display = 'none';
      contentWrap.style.display = 'flex';
      renderCrmSidebar(data.crm);
    } catch (err) {
      console.error('Error loading customer CRM:', err);
    }
  }

  function renderCrmSidebar(crm) {
    if (!crm) return;

    // 1. Customer Identity
    const conv = (window.conversationsCache || []).find(c => c.page_id === crm.page_id && c.sender_id === crm.sender_id);
    const customerName = crm.sender_name || conv?.sender_name || 'Khách hàng';
    const pageName = conv?.page_name || crm.page_id;
    const pageColor = conv?.page_color || '#3b82f6';

    const nameEl = document.getElementById('crmCustomerName');
    if (nameEl) nameEl.textContent = customerName;

    const pageBadgeEl = document.getElementById('crmCustomerPageBadge');
    if (pageBadgeEl) pageBadgeEl.textContent = `Fanpage: ${pageName}`;

    const avatarEl = document.getElementById('crmAvatar');
    if (avatarEl) {
      avatarEl.textContent = customerName.charAt(0).toUpperCase();
      avatarEl.style.background = `linear-gradient(135deg, ${pageColor}, #8b5cf6)`;
    }

    // 2. Contact Fields
    const phoneInput = document.getElementById('crmPhoneInput');
    if (phoneInput) phoneInput.value = crm.phone || '';

    const addressInput = document.getElementById('crmAddressInput');
    if (addressInput) addressInput.value = crm.address || '';

    const callLink = document.getElementById('crmCallPhoneLink');
    if (callLink) {
      if (crm.phone && crm.phone.trim()) {
        callLink.href = `tel:${crm.phone.trim()}`;
        callLink.style.display = 'inline-flex';
      } else {
        callLink.style.display = 'none';
      }
    }

    // 3. Render Tags
    renderCrmCustomerTags(crm.tags || []);
    renderCrmTagsQuickPick();

    // 4. Render Notes
    renderCrmNotesTimeline(crm.notes || []);

    // 5. Auto detect phone from conversation cache or timeline
    checkAndSuggestDetectedPhone(crm.phone);
  }

  function checkAndSuggestDetectedPhone(currentPhone) {
    const alertEl = document.getElementById('crmDetectedPhoneAlert');
    const valEl = document.getElementById('crmDetectedPhoneVal');
    if (!alertEl || !valEl) return;

    // Scan messages in timeline or cache
    const timeline = document.getElementById('chatMessagesTimeline');
    if (!timeline) return;

    const textContent = timeline.innerText || '';
    const phoneMatch = textContent.match(/(?:(?:\+84|84|0)[3|5|7|8|9][0-9]{8})\b/);
    if (phoneMatch && phoneMatch[0]) {
      const detected = phoneMatch[0];
      const cleanCurrent = (currentPhone || '').replace(/\D/g, '');
      const cleanDetected = detected.replace(/\D/g, '');
      if (cleanDetected && cleanDetected !== cleanCurrent) {
        valEl.textContent = detected;
        alertEl.style.display = 'flex';
        return;
      }
    }
    alertEl.style.display = 'none';
  }

  function renderCrmCustomerTags(tags) {
    const listEl = document.getElementById('crmCustomerTagsList');
    if (!listEl) return;

    if (!tags || tags.length === 0) {
      listEl.innerHTML = '<span class="crm-tag-empty">Chưa gắn thẻ nào</span>';
      return;
    }

    listEl.innerHTML = tags.map(t => {
      const name = typeof t === 'string' ? t : (t.name || '');
      const color = (typeof t === 'object' && t.color) ? t.color : '#ffffff';
      const bg = (typeof t === 'object' && t.bg_color) ? t.bg_color : '#3b82f6';

      return `
        <span class="crm-tag-chip" style="color: ${escapeHtml(color)}; background-color: ${escapeHtml(bg)};">
          <span>${escapeHtml(name)}</span>
          <span class="crm-tag-remove" data-tag-name="${escapeHtml(name)}" title="Gỡ thẻ">✕</span>
        </span>
      `;
    }).join('');

    listEl.querySelectorAll('.crm-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagName = btn.dataset.tagName;
        toggleTagForActiveCustomer(tagName, false);
      });
    });
  }

  function renderCrmTagsQuickPick() {
    const container = document.getElementById('crmTagsQuickPick');
    if (!container) return;

    const assignedNames = new Set((activeCustomerCrm?.tags || []).map(t => typeof t === 'string' ? t : t.name));

    container.innerHTML = allSystemTags.map(tag => {
      const isAssigned = assignedNames.has(tag.name);
      const style = isAssigned
        ? `background-color: ${tag.bg_color}; color: ${tag.color}; border-color: ${tag.bg_color};`
        : '';

      return `
        <button type="button" class="crm-tag-pick-btn ${isAssigned ? 'active' : ''}" style="${style}" data-tag-name="${escapeHtml(tag.name)}">
          ${isAssigned ? '✓ ' : '+ '}${escapeHtml(tag.name)}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.crm-tag-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tagName = btn.dataset.tagName;
        const willAssign = !btn.classList.contains('active');
        toggleTagForActiveCustomer(tagName, willAssign);
      });
    });
  }

  async function toggleTagForActiveCustomer(tagName, shouldAdd) {
    if (!activeCustomerCrm) return;

    let currentTags = Array.isArray(activeCustomerCrm.tags) ? [...activeCustomerCrm.tags] : [];
    if (shouldAdd) {
      if (!currentTags.some(t => (typeof t === 'string' ? t : t.name) === tagName)) {
        const foundSys = allSystemTags.find(s => s.name === tagName);
        const tagObj = foundSys
          ? { name: foundSys.name, color: foundSys.color, bg_color: foundSys.bg_color }
          : { name: tagName, color: '#ffffff', bg_color: '#3b82f6' };
        currentTags.push(tagObj);
      }
    } else {
      currentTags = currentTags.filter(t => (typeof t === 'string' ? t : t.name) !== tagName);
    }

    try {
      const res = await fetch(`/api/conversations/${activeCustomerCrm.page_id}/${activeCustomerCrm.sender_id}/crm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: currentTags })
      });
      const data = await res.json();
      if (data.ok && data.crm) {
        activeCustomerCrm = data.crm;
        renderCrmCustomerTags(data.crm.tags);
        renderCrmTagsQuickPick();
        loadConversations();
        showToast(`Đã ${shouldAdd ? 'gắn' : 'gỡ'} nhãn "${tagName}"`, 'success');
      }
    } catch (err) {
      console.error('Error toggling tag:', err);
      showToast('Lỗi cập nhật nhãn!', 'error');
    }
  }

  function renderCrmNotesTimeline(notes) {
    const timelineEl = document.getElementById('crmNotesTimeline');
    const countBadge = document.getElementById('crmNotesCountBadge');
    if (!timelineEl) return;

    const safeNotes = notes || [];
    if (countBadge) countBadge.textContent = safeNotes.length;

    if (safeNotes.length === 0) {
      timelineEl.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:11px;">Chưa có ghi chú nội bộ nào cho khách hàng này.</div>';
      return;
    }

    timelineEl.innerHTML = safeNotes.map(n => {
      const timeStr = formatRelativeTime(n.created_at);
      return `
        <div class="crm-note-item" data-note-id="${n.id}">
          <div class="crm-note-header">
            <span class="crm-note-author">👤 ${escapeHtml(n.author_name || 'Nhân viên')}</span>
            <div class="crm-note-meta-right">
              <span class="crm-note-time">${timeStr}</span>
              <button type="button" class="crm-note-delete-btn" data-id="${n.id}" title="Xóa ghi chú">✕</button>
            </div>
          </div>
          <div class="crm-note-text">${escapeHtml(n.content)}</div>
        </div>
      `;
    }).join('');

    timelineEl.querySelectorAll('.crm-note-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const noteId = btn.dataset.id;
        if (!noteId) return;
        try {
          const res = await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast('Đã xóa ghi chú!', 'info');
            if (activeCustomerCrm) {
              loadCustomerCrm(activeCustomerCrm.page_id, activeCustomerCrm.sender_id);
            }
          }
        } catch (err) {
          console.error('Error deleting note:', err);
        }
      });
    });
  }

  function renderManageTagsList() {
    const listEl = document.getElementById('manageTagsList');
    if (!listEl) return;

    if (allSystemTags.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:10px; color:var(--text-muted); font-size:12px;">Chưa có nhãn nào.</div>';
      return;
    }

    listEl.innerHTML = allSystemTags.map(tag => {
      return `
        <div class="manage-tag-item">
          <div class="manage-tag-meta">
            <span class="crm-tag-chip" style="color: ${escapeHtml(tag.color)}; background-color: ${escapeHtml(tag.bg_color)};">
              ${escapeHtml(tag.name)}
            </span>
            ${tag.is_system === 1 ? '<span class="manage-tag-system-badge">Hệ thống</span>' : ''}
          </div>
          ${tag.is_system === 0 ? `<button type="button" class="btn btn-xxs btn-danger delete-sys-tag-btn" data-id="${tag.id}">Xóa</button>` : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.delete-sys-tag-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tagId = btn.dataset.id;
        if (!tagId) return;
        try {
          const res = await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast('Đã xóa thẻ tag!', 'info');
            loadAllSystemTags();
          }
        } catch (err) {
          console.error('Error deleting tag:', err);
        }
      });
    });
  }

  function initCrmSidebarEvents() {
    const container = document.querySelector('.chat-split-container');
    const toggleBtn = document.getElementById('toggleCrmBtn');
    const closeBtn = document.getElementById('closeCrmSidebarBtn');

    if (toggleBtn && container) {
      toggleBtn.addEventListener('click', () => {
        isCrmSidebarOpen = !isCrmSidebarOpen;
        if (isCrmSidebarOpen) {
          container.classList.add('has-crm');
          toggleBtn.classList.add('active');
        } else {
          container.classList.remove('has-crm');
          toggleBtn.classList.remove('active');
        }
      });
    }

    if (closeBtn && container && toggleBtn) {
      closeBtn.addEventListener('click', () => {
        isCrmSidebarOpen = false;
        container.classList.remove('has-crm');
        toggleBtn.classList.remove('active');
      });
    }

    // Save Contact
    document.getElementById('saveCrmContactBtn')?.addEventListener('click', async () => {
      if (!activeCustomerCrm) return;
      const phone = document.getElementById('crmPhoneInput')?.value.trim();
      const address = document.getElementById('crmAddressInput')?.value.trim();

      try {
        const res = await fetch(`/api/conversations/${activeCustomerCrm.page_id}/${activeCustomerCrm.sender_id}/crm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, address })
        });
        const data = await res.json();
        if (data.ok && data.crm) {
          activeCustomerCrm = data.crm;
          renderCrmSidebar(data.crm);
          showToast('Đã lưu thông tin liên hệ khách hàng!', 'success');
        }
      } catch (err) {
        showToast('Lỗi lưu thông tin liên hệ!', 'error');
      }
    });

    // Apply Detected Phone
    document.getElementById('crmApplyDetectedPhoneBtn')?.addEventListener('click', async () => {
      if (!activeCustomerCrm) return;
      const detectedVal = document.getElementById('crmDetectedPhoneVal')?.textContent.trim();
      if (!detectedVal) return;

      const phoneInput = document.getElementById('crmPhoneInput');
      if (phoneInput) phoneInput.value = detectedVal;
      const alertEl = document.getElementById('crmDetectedPhoneAlert');
      if (alertEl) alertEl.style.display = 'none';

      // Auto-save
      document.getElementById('saveCrmContactBtn')?.click();
    });

    // Add Internal Note
    document.getElementById('addCrmNoteBtn')?.addEventListener('click', async () => {
      if (!activeCustomerCrm) return;
      const noteInput = document.getElementById('crmNoteInput');
      const authorInput = document.getElementById('crmNoteAuthorInput');
      const content = noteInput?.value.trim();
      const author_name = authorInput?.value.trim();

      if (!content) {
        showToast('Vui lòng nhập nội dung ghi chú!', 'warning');
        return;
      }

      try {
        const res = await fetch(`/api/conversations/${activeCustomerCrm.page_id}/${activeCustomerCrm.sender_id}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, author_name })
        });
        const data = await res.json();
        if (data.ok) {
          if (noteInput) noteInput.value = '';
          loadCustomerCrm(activeCustomerCrm.page_id, activeCustomerCrm.sender_id);
          showToast('Đã lưu ghi chú nội bộ!', 'success');
        } else {
          showToast(data.error || 'Lỗi lưu ghi chú', 'error');
        }
      } catch (err) {
        showToast('Lỗi kết nối khi lưu ghi chú', 'error');
      }
    });

    // Open/Close Manage Tags Modal
    document.getElementById('openManageTagsModalBtn')?.addEventListener('click', () => {
      openModal('manageTagsModal');
      renderManageTagsList();
    });
    document.getElementById('closeManageTagsModalBtn')?.addEventListener('click', () => {
      closeModal('manageTagsModal');
    });
    document.getElementById('closeManageTagsFooterBtn')?.addEventListener('click', () => {
      closeModal('manageTagsModal');
    });

    // Tag color picker live preview
    const nameInput = document.getElementById('newTagNameInput');
    const colorInput = document.getElementById('newTagColorInput');
    const bgColorInput = document.getElementById('newTagBgColorInput');
    const previewBadge = document.getElementById('newTagPreviewBadge');

    function updateNewTagPreview() {
      if (!previewBadge) return;
      previewBadge.textContent = nameInput?.value.trim() || 'Xem trước';
      if (colorInput) previewBadge.style.color = colorInput.value;
      if (bgColorInput) previewBadge.style.backgroundColor = bgColorInput.value;
    }
    nameInput?.addEventListener('input', updateNewTagPreview);
    colorInput?.addEventListener('input', updateNewTagPreview);
    bgColorInput?.addEventListener('input', updateNewTagPreview);

    // Create New Tag Submit
    document.getElementById('submitCreateTagBtn')?.addEventListener('click', async () => {
      const name = nameInput?.value.trim();
      const color = colorInput?.value || '#ffffff';
      const bg_color = bgColorInput?.value || '#3b82f6';

      if (!name) {
        showToast('Vui lòng nhập tên nhãn!', 'warning');
        return;
      }

      try {
        const res = await fetch('/api/tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color, bg_color })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`Đã tạo nhãn "${name}"!`, 'success');
          if (nameInput) nameInput.value = '';
          updateNewTagPreview();
          await loadAllSystemTags();
        } else {
          showToast(data.error || 'Lỗi tạo nhãn', 'error');
        }
      } catch (err) {
        showToast('Lỗi kết nối khi tạo nhãn', 'error');
      }
    });
  }

  // Initialize App
  requestNotificationPermission();
  loadHostProfile();
  loadPages();
  loadConversations();
  loadQuickRepliesTable();
  initSSE();
  loadAllSystemTags();
  initCrmSidebarEvents();
  loadStatus();
  setInterval(loadStatus, 15000);
});
