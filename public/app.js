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
  // YouTube Video ID Extractor Helper
  function extractYouTubeVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    const match = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
    return match ? match[1] : null;
  }

  // YouTube Iframe API Ready Handler
  window.onYouTubeIframeAPIReady = function() {
    try {
      window.ytAlarmPlayer = new YT.Player('youtubeAlarmPlayerSlot', {
        width: '200',
        height: '200',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0
        },
        events: {
          onReady: () => {
            console.log('[YouTube API] YouTube Alarm Player đã sẵn sàng.');
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) {
              if (alarmAudioEngine.isPlaying) {
                try {
                  window.ytAlarmPlayer.seekTo(0);
                  window.ytAlarmPlayer.playVideo();
                } catch (e) {}
              } else {
                const btn = document.getElementById('testWebAudioChimeBtn');
                if (btn && btn.classList.contains('btn-danger')) {
                  btn.innerHTML = '<span>🔊</span> Thử Nghe Chuông Loa Ngay';
                  btn.classList.remove('btn-danger');
                  btn.classList.add('btn-secondary');
                }
              }
            }
          },
          onError: (err) => {
            console.warn('[YouTube API] Lỗi phát YouTube:', err);
            if (alarmAudioEngine.isPlaying) {
              alarmAudioEngine._synthEmergencySiren(alarmAudioEngine.audioCtx?.currentTime || 0);
            }
          }
        }
      });
    } catch (e) {
      console.warn('[YouTube API] Khởi tạo iframe player lỗi:', e);
    }
  };

  // 1. Web Audio Alarm Engine (Synthesized, Custom Audio & YouTube Alarm Engine)
  // -------------------------------------------------------------
  class WebAudioAlarmEngine {
    constructor() {
      this.audioCtx = null;
      this.compressor = null;
      this.masterGain = null;
      this.isPlaying = false;
      this.intervalId = null;
      this.customAudio = null;
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
      if (!this.customAudio) {
        this.customAudio = new Audio();
        this.customAudio.addEventListener('ended', () => {
          const btn = document.getElementById('testWebAudioChimeBtn');
          if (btn && btn.classList.contains('btn-danger')) {
            btn.innerHTML = '<span>🔊</span> Thử Nghe Chuông Loa Ngay';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-secondary');
          }
        });
      }
    }

    playSingleChime(volume = 1.0, soundType = 'loud_chime') {
      try {
        this.init();
        const effectiveVol = Math.max(0.1, volume);

        // Case 1: Custom Audio File
        if (soundType === 'custom_file') {
          const soundUrl = hostProfile?.custom_sound_url || document.getElementById('hostCustomSoundUrlInput')?.value;
          if (soundUrl) {
            this.customAudio.src = soundUrl;
            this.customAudio.volume = Math.min(1.0, effectiveVol);
            this.customAudio.loop = false;
            this.customAudio.currentTime = 0;
            this.customAudio.play().catch(e => {
              console.warn('[CustomAudio] Play error:', e);
              if (this.audioCtx) this._synthLoudChime(this.audioCtx.currentTime);
            });
            return;
          }
        }

        // Case 2: YouTube Video Link
        if (soundType === 'youtube') {
          const ytUrl = hostProfile?.youtube_url || document.getElementById('hostYoutubeUrlInput')?.value;
          const videoId = extractYouTubeVideoId(ytUrl);
          if (videoId && window.ytAlarmPlayer && typeof window.ytAlarmPlayer.loadVideoById === 'function') {
            try {
              window.ytAlarmPlayer.loadVideoById({ videoId, startSeconds: 0 });
              window.ytAlarmPlayer.setVolume(Math.min(100, Math.round(effectiveVol * 100)));
              window.ytAlarmPlayer.playVideo();
              return;
            } catch (e) {
              console.warn('[YouTube Alarm] Play error:', e);
            }
          }
        }

        if (!this.audioCtx) return;

        // Apply master gain with boost capability (up to 150%)
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

      const effectiveVol = Math.max(0.1, volume);

      // Show Emergency Alarm Bar
      const alarmBar = document.getElementById('emergencyAlarmBar');
      if (alarmBar) alarmBar.style.display = 'flex';

      // If Custom Audio File
      if (soundType === 'custom_file') {
        const soundUrl = hostProfile?.custom_sound_url || document.getElementById('hostCustomSoundUrlInput')?.value;
        if (soundUrl) {
          this.customAudio.src = soundUrl;
          this.customAudio.volume = Math.min(1.0, effectiveVol);
          this.customAudio.loop = true;
          this.customAudio.currentTime = 0;
          this.customAudio.play().catch(e => {
            console.warn('[CustomAudio] Play error, fallback to synth:', e);
            this.intervalId = setInterval(() => {
              if (!this.isPlaying) return;
              this._synthEmergencySiren(this.audioCtx?.currentTime || 0);
            }, 1800);
          });
          return;
        }
      }

      // If YouTube Video Link
      if (soundType === 'youtube') {
        const ytUrl = hostProfile?.youtube_url || document.getElementById('hostYoutubeUrlInput')?.value;
        const videoId = extractYouTubeVideoId(ytUrl);
        if (videoId && window.ytAlarmPlayer && typeof window.ytAlarmPlayer.loadVideoById === 'function') {
          try {
            window.ytAlarmPlayer.loadVideoById({ videoId, startSeconds: 0 });
            window.ytAlarmPlayer.setVolume(Math.min(100, Math.round(effectiveVol * 100)));
            window.ytAlarmPlayer.playVideo();
            return;
          } catch (e) {
            console.warn('[YouTube Alarm] Play error, fallback to synth:', e);
          }
        }
      }

      // Synthesized Chimes (repeating loop every 1.8s)
      this.playSingleChime(volume, soundType);
      this.intervalId = setInterval(() => {
        if (!this.isPlaying) {
          clearInterval(this.intervalId);
          return;
        }
        this.playSingleChime(volume, soundType);
      }, 1800);
    }

    showUnifiedAlarmBar(title, subtitle) {
      const alarmBar = document.getElementById('emergencyAlarmBar');
      const titleEl = document.getElementById('emergencyAlarmTitle');
      const subEl = document.getElementById('emergencyAlarmSubtitle');
      if (titleEl && title) titleEl.textContent = title;
      if (subEl && subtitle) subEl.textContent = subtitle;
      if (alarmBar) alarmBar.style.display = 'flex';
    }

    hardStopAllAudio() {
      this.isPlaying = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      // 1. Triệt để tắt Web Audio API & reset gain về 0
      if (this.masterGain && this.audioCtx) {
        try {
          this.masterGain.gain.cancelScheduledValues(0);
          this.masterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        } catch (e) {}
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        try { this.audioCtx.suspend(); } catch (e) {}
      }

      // 2. Triệt để tắt Custom Audio HTML5
      if (this.customAudio) {
        try {
          this.customAudio.pause();
          this.customAudio.currentTime = 0;
          this.customAudio.loop = false;
          this.customAudio.removeAttribute('src');
          this.customAudio.load();
        } catch (e) {}
      }

      // 3. Triệt để tắt YouTube Alarm Player
      if (window.ytAlarmPlayer) {
        try { if (typeof window.ytAlarmPlayer.pauseVideo === 'function') window.ytAlarmPlayer.pauseVideo(); } catch (e) {}
        try { if (typeof window.ytAlarmPlayer.stopVideo === 'function') window.ytAlarmPlayer.stopVideo(); } catch (e) {}
        try { if (typeof window.ytAlarmPlayer.mute === 'function') window.ytAlarmPlayer.mute(); } catch (e) {}
      }

      // 4. Quét sạch tất cả các thẻ <audio> trên trang
      document.querySelectorAll('audio').forEach(a => {
        try {
          a.pause();
          a.currentTime = 0;
          a.loop = false;
        } catch (e) {}
      });

      // 5. Đặt lại trạng thái thử nghe chuông
      if (typeof isTestingAlarmSound !== 'undefined') {
        isTestingAlarmSound = false;
      }
      const testWebAudioBtn = document.getElementById('testWebAudioChimeBtn');
      if (testWebAudioBtn) {
        testWebAudioBtn.innerHTML = '<span>🔊</span> Thử Nghe Chuông Loa Ngay';
        testWebAudioBtn.classList.remove('btn-danger');
        testWebAudioBtn.classList.add('btn-secondary');
      }

      // 6. Ẩn thanh báo thức chung
      const alarmBar = document.getElementById('emergencyAlarmBar');
      if (alarmBar) alarmBar.style.display = 'none';
      const safetyBanner = document.getElementById('safetyAlarmBanner');
      if (safetyBanner) safetyBanner.style.display = 'none';
    }

    stopContinuousAlarm() {
      this.hardStopAllAudio();
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

  // Generic close buttons for any modal with data-modal attribute
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModal = btn.dataset.modal;
      if (targetModal) closeModal(targetModal);
    });
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

  // -------------------------------------------------------------
  // Single Unified Alarm Dismiss & Full Multi-Tab / Server Sync
  // -------------------------------------------------------------
  const alarmSyncChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('fb_multi_hub_alarm_sync') : null;

  if (alarmSyncChannel) {
    alarmSyncChannel.onmessage = (event) => {
      if (event.data?.action === 'stop_alarm') {
        console.log('[AlarmSync] Nhận lệnh tắt chuông từ tab khác.');
        alarmAudioEngine.hardStopAllAudio();
        showToast('🔕 Đã tắt chuông (đồng bộ từ tab khác)', 'info');
      } else if (event.data?.action === 'start_alarm') {
        console.log('[AlarmSync] Nhận lệnh đổ chuông từ tab khác.');
        alarmAudioEngine.showUnifiedAlarmBar(event.data.title, event.data.subtitle);
      }
    };
  }

  // Cross-Tab Fallback via LocalStorage Event
  window.addEventListener('storage', (e) => {
    if (e.key === 'fb_hub_alarm_killswitch' && e.newValue) {
      console.log('[AlarmSync] Nhận killswitch tắt chuông qua localStorage.');
      alarmAudioEngine.hardStopAllAudio();
      showToast('🔕 Đã tắt chuông (đồng bộ từ cửa sổ khác)', 'info');
    }
  });

  // Hàm Dập Tắt Chuông Chung Toàn Diện (Unified Killswitch)
  window.triggerUnifiedAlarmDismiss = function() {
    // 1. Dập tắt triệt để toàn bộ âm thanh trên tab hiện tại
    alarmAudioEngine.hardStopAllAudio();

    // 2. Đồng bộ tức thì tới tất cả các tab khác qua BroadcastChannel & LocalStorage
    if (alarmSyncChannel) {
      try {
        alarmSyncChannel.postMessage({ action: 'stop_alarm', timestamp: Date.now() });
      } catch (e) {}
    }
    try {
      localStorage.setItem('fb_hub_alarm_killswitch', Date.now().toString());
    } catch (e) {}

    // 3. Gửi lệnh lên Server để ngắt kiểm tra báo động an toàn & broadcast SSE
    fetch('/api/alarm/silence', { method: 'POST' }).catch(() => {});

    showToast('🔕 Đã tắt chuông và đồng bộ toàn bộ hệ thống!', 'success');
  };

  // Nút Tắt Chuông Chung Duy Nhất (Unified Dismiss Button)
  document.getElementById('dismissAlarmBtn')?.addEventListener('click', () => {
    window.triggerUnifiedAlarmDismiss();
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
    'view-pages': { title: 'Quản Lý Tài Khoản & Fanpage', breadcrumb: 'Quản lý tài khoản Facebook, Token & chọn Fanpage vận hành' },
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

  function updateAlarmSoundPanes(soundType) {
    const customPane = document.getElementById('hostCustomAudioPane');
    const ytPane = document.getElementById('hostYoutubeAudioPane');
    if (customPane) customPane.style.display = soundType === 'custom_file' ? 'block' : 'none';
    if (ytPane) ytPane.style.display = soundType === 'youtube' ? 'block' : 'none';
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

    const customUrlInput = document.getElementById('hostCustomSoundUrlInput');
    if (customUrlInput) customUrlInput.value = host.custom_sound_url || '';

    const ytUrlInput = document.getElementById('hostYoutubeUrlInput');
    if (ytUrlInput) {
      ytUrlInput.value = host.youtube_url || '';
      const badge = document.getElementById('youtubeVideoDetectedBadge');
      if (badge) {
        const vid = extractYouTubeVideoId(host.youtube_url || '');
        badge.style.display = vid ? 'inline-block' : 'none';
      }
    }

    const fileNameDisplay = document.getElementById('customAudioFileNameDisplay');
    const previewPlayer = document.getElementById('customAudioPreviewPlayer');
    if (host.custom_sound_url) {
      const filename = host.custom_sound_url.split('/').pop();
      if (fileNameDisplay) fileNameDisplay.textContent = '✓ ' + decodeURIComponent(filename);
      if (previewPlayer) {
        previewPlayer.src = host.custom_sound_url;
        previewPlayer.style.display = 'block';
      }
    } else {
      if (fileNameDisplay) fileNameDisplay.textContent = 'Chưa chọn file';
      if (previewPlayer) {
        previewPlayer.src = '';
        previewPlayer.style.display = 'none';
      }
    }

    updateAlarmSoundPanes(host.web_sound_type || 'loud_chime');

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
          alarmAudioEngine.showUnifiedAlarmBar(
            `🚨 BÁO THỨC: CÓ TIN NHẮN MỚI TỪ KHÁCH HÀNG!`,
            `Tin nhắn từ ${msg.sender_name} (${msg.page_name}). Loa máy tính đang đổ chuông để đánh thức bạn trực ca.`
          );
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

      alarmAudioEngine.showUnifiedAlarmBar(
        `🚨 BÁO THỨC ĐẾN GIỜ TRỰC: ${data.pageName}`,
        `Khách hàng ${data.senderName} vừa nhắn tin! Đang gọi điện qua ${data.method}.`
      );
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

        const title = `🚨 BÁO ĐỘNG AN TOÀN: Tin nhắn chưa trả lời (${data.minutes_unreplied || data.delay_minutes || 10} phút)!`;
        const subtitle = `Khách hàng ${data.sender_name || 'Khách'} trên Page ${data.page_name || data.page_id || ''} chưa được phản hồi sau ${data.minutes_unreplied || data.delay_minutes || 10} phút quy định. Vui lòng kiểm tra ngay!`;

        // Chỉ hiển thị 1 thanh báo thức chung duy nhất ở đầu màn hình kèm nút tắt chuông duy nhất
        alarmAudioEngine.showUnifiedAlarmBar(title, subtitle);
        alarmAudioEngine.startContinuousAlarm(getEffectiveVolume(), getEffectiveSoundType());

        showBrowserNotification(title, subtitle);
      } catch (err) {
        console.warn('[SSE] safety_alarm error:', err);
      }
    });

    sseSource.addEventListener('alarm_silenced', () => {
      console.log('[SSE] Nhận thông báo đã tắt chuông từ máy chủ.');
      alarmAudioEngine.hardStopAllAudio();
      showToast('🔕 Đã tắt chuông và đồng bộ toàn bộ hệ thống!', 'info');
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
    const replyingAccount = conv?.account_label ? ` [${conv.account_label}]` : '';
    const pageNameEl = document.getElementById('replyingPageNameText');
    if (pageNameEl) pageNameEl.textContent = pageName + replyingAccount;

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

  // Slash Commands Quick Reply Popover State
  let slashSelectedIdx = 0;
  let activeSlashMatches = [];

  function closeSlashPopover() {
    const pop = document.getElementById('slashReplyPopover');
    if (pop) pop.style.display = 'none';
    activeSlashMatches = [];
    slashSelectedIdx = 0;
  }

  function renderSlashPopover(matches) {
    const pop = document.getElementById('slashReplyPopover');
    const list = document.getElementById('slashRepliesList');
    if (!pop || !list) return;

    activeSlashMatches = matches;
    slashSelectedIdx = Math.min(slashSelectedIdx, matches.length - 1);
    if (slashSelectedIdx < 0) slashSelectedIdx = 0;

    list.innerHTML = matches.map((m, idx) => `
      <div class="slash-reply-item ${idx === slashSelectedIdx ? 'active' : ''}" data-idx="${idx}">
        <div class="slash-reply-item-header">
          <span class="slash-reply-item-title">${escapeHtml(m.title)}</span>
          <span class="slash-reply-item-shortcut">/${escapeHtml(m.shortcut || m.title.toLowerCase().replace(/[^a-z0-9]/g, ''))}</span>
        </div>
        <div class="slash-reply-item-snippet">${escapeHtml(m.content)}</div>
      </div>
    `).join('');

    pop.style.display = 'block';

    list.querySelectorAll('.slash-reply-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx, 10);
        applySlashReply(matches[idx]);
      });
      item.addEventListener('mouseenter', () => {
        list.querySelectorAll('.slash-reply-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        slashSelectedIdx = parseInt(item.dataset.idx, 10);
      });
    });
  }

  function applySlashReply(item) {
    if (!item) return;
    const textarea = document.getElementById('chatReplyInput');
    if (!textarea) return;

    const val = textarea.value;
    const cursor = textarea.selectionStart || val.length;
    const textBefore = val.slice(0, cursor);
    const slashPos = textBefore.lastIndexOf('/');
    if (slashPos !== -1) {
      const textAfter = val.slice(cursor);
      textarea.value = val.slice(0, slashPos) + item.content + textAfter;
      textarea.selectionStart = textarea.selectionEnd = slashPos + item.content.length;
    } else {
      textarea.value = item.content;
    }

    closeSlashPopover();
    textarea.focus();
    autoResizeTextarea(textarea);
    updateCharCounter();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function checkSlashCommand() {
    const textarea = document.getElementById('chatReplyInput');
    if (!textarea) return;

    const val = textarea.value;
    const cursor = textarea.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const slashPos = textBefore.lastIndexOf('/');

    if (slashPos === -1 || (slashPos > 0 && !/\s/.test(textBefore[slashPos - 1]))) {
      closeSlashPopover();
      return;
    }

    const query = textBefore.slice(slashPos + 1).toLowerCase().trim();
    // Filter quickRepliesList
    const matches = (quickRepliesList || []).filter(qr => {
      if (!query) return true;
      const titleMatch = (qr.title || '').toLowerCase().includes(query);
      const contentMatch = (qr.content || '').toLowerCase().includes(query);
      const shortcut = (qr.shortcut || qr.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const shortcutMatch = shortcut.includes(query);
      return titleMatch || contentMatch || shortcutMatch;
    }).slice(0, 8);

    if (matches.length > 0) {
      renderSlashPopover(matches);
    } else {
      closeSlashPopover();
    }
  }

  // Textarea input & keyboard shortcuts
  const chatTextarea = document.getElementById('chatReplyInput');
  chatTextarea?.addEventListener('input', () => {
    autoResizeTextarea(chatTextarea);
    updateCharCounter();
    emitMyTypingPing();
    checkSlashCommand();
  });
  chatTextarea?.addEventListener('focus', ensureActiveChatMarkedSeen);
  chatTextarea?.addEventListener('click', ensureActiveChatMarkedSeen);
  document.getElementById('chatMessagesTimeline')?.addEventListener('click', ensureActiveChatMarkedSeen);

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('slashReplyPopover');
    if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && e.target !== chatTextarea) {
      closeSlashPopover();
    }
  });

  document.getElementById('dismissCollisionBannerBtn')?.addEventListener('click', () => {
    const banner = document.getElementById('agentCollisionBanner');
    if (banner) banner.style.display = 'none';
  });

  chatTextarea?.addEventListener('keydown', (e) => {
    const pop = document.getElementById('slashReplyPopover');
    const isPopOpen = pop && pop.style.display !== 'none' && activeSlashMatches.length > 0;

    if (isPopOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashSelectedIdx = (slashSelectedIdx + 1) % activeSlashMatches.length;
        renderSlashPopover(activeSlashMatches);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashSelectedIdx = (slashSelectedIdx - 1 + activeSlashMatches.length) % activeSlashMatches.length;
        renderSlashPopover(activeSlashMatches);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySlashReply(activeSlashMatches[slashSelectedIdx]);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSlashPopover();
        return;
      }
    }

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

    try {
      const res = await fetch('/api/token-sources');
      const data = await res.json();
      if (!data.ok || !data.tokenSources) return;

      savedTokenSourcesCache = data.tokenSources;

      // Update Connected Accounts List in Sequential Login Modal
      try {
        renderConnectedAccountsList(data.tokenSources);
      } catch (e) {}

      // Update Main Connected Accounts Table on View 2
      try {
        renderMainConnectedAccountsTable(data.tokenSources);
      } catch (e) {
        console.warn('Error rendering main connected accounts table:', e);
      }

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

  // -------------------------------------------------------------
  // Fanpage State & Multi-Account Selection Management
  // -------------------------------------------------------------
  let allPagesCache = [];
  let currentPageStatusFilter = 'all'; // 'all' | 'active' | 'inactive'
  let currentPageSearchQuery = '';
  let activeManagingTokenSourceId = null;

  async function loadPages() {
    const shiftSelect = document.getElementById('shiftPageSelect');
    const pageFilter = document.getElementById('sidebarPageFilter');

    // Sync saved token vault
    loadTokenSources();

    try {
      const res = await fetch('/api/pages');
      const data = await res.json();

      allPagesCache = (data.ok && Array.isArray(data.pages)) ? data.pages : [];

      // Render grid with current filters
      renderPagesGrid();

      // Populate shifts page select
      if (shiftSelect) {
        if (allPagesCache.length === 0) {
          shiftSelect.innerHTML = '<option value="">Chưa có Fanpage</option>';
        } else {
          shiftSelect.innerHTML = allPagesCache.map(p => 
            `<option value="${p.page_id}">${escapeHtml(p.name)} (${p.page_id})${p.is_active === 0 ? ' [Tạm dừng]' : ''}`
          ).join('');
        }
      }

      // Populate sidebar page filter in Inbox
      if (pageFilter) {
        const currentVal = pageFilter.value;
        const groups = {};
        allPagesCache.forEach(p => {
          const acc = (p.account_label || p.token_source_name || 'Tài khoản khác').trim();
          if (!groups[acc]) groups[acc] = [];
          groups[acc].push(p);
        });

        const numAccounts = Object.keys(groups).length;
        let filterHtml = '<option value="">🌐 Tất cả Page & Tài khoản</option>';
        for (const [accName, pages] of Object.entries(groups)) {
          filterHtml += `<optgroup label="👤 ${escapeHtml(accName)}">`;
          if (numAccounts > 1 && pages.length > 1) {
            filterHtml += `<option value="account:${escapeHtml(accName)}">📂 Toàn bộ [${escapeHtml(accName)}] (${pages.length} page)</option>`;
          }
          pages.forEach(p => {
            const statusSuffix = p.is_active === 0 ? ' (⏸️ Tạm Dừng)' : '';
            filterHtml += `<option value="${p.page_id}">📄 ${escapeHtml(p.name)}${statusSuffix}</option>`;
          });
          filterHtml += '</optgroup>';
        }
        pageFilter.innerHTML = filterHtml;
        if (currentVal) pageFilter.value = currentVal;
      }

    } catch (err) {
      console.error('Error loading pages:', err);
    }
  }

  // -------------------------------------------------------------
  // Account Pages Synchronization Engine (Quét Fanpage Mới)
  // -------------------------------------------------------------
  async function syncTokenSourcePages(sourceId, sourceName, btn) {
    const origHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spin-icon" style="display:inline-block;animation:spin 1s linear infinite;">🔄</span> Đang quét...';
      }
      showToast(`Đang quét Fanpage mới từ Facebook cho "${sourceName}"...`, 'info');

      const res = await fetch(`/api/token-sources/${sourceId}/sync-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.ok) {
        if (data.new_pages_count > 0) {
          showToast(`🎉 Đã tìm thấy và cập nhật ${data.new_pages_count} Fanpage mới từ "${sourceName}"!`, 'success');
          await loadTokenSources();
          await loadPages();
          setTimeout(() => {
            openManageAccountPagesModal(Number(sourceId));
          }, 400);
        } else {
          showToast(`✅ Toàn bộ ${data.total_pages} Fanpage của "${sourceName}" đã là mới nhất!`, 'success');
          await loadTokenSources();
          await loadPages();
        }
      } else {
        showToast('Lỗi khi cập nhật trang: ' + (data.error || 'Thao tác thất bại'), 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi cập nhật trang: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  async function syncAllTokenSourcesPages() {
    const btn = document.getElementById('btnSyncAllAccountsPages');
    const origHtml = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spin-icon" style="display:inline-block;animation:spin 1s linear infinite;">🔄</span> Đang quét tất cả...';
      }
      showToast('Đang quét cập nhật Fanpage mới cho toàn bộ các tài khoản Facebook...', 'info');

      const res = await fetch('/api/token-sources/sync-all-pages', { method: 'POST' });
      const data = await res.json();

      if (data.ok) {
        if (data.total_new_pages > 0) {
          showToast(`🎉 Quét hoàn tất! Đã tìm thấy ${data.total_new_pages} Fanpage mới trên các tài khoản.`, 'success');
        } else {
          showToast(`✅ Toàn bộ ${data.total_sources_scanned} tài khoản Facebook đã được đồng bộ mới nhất.`, 'success');
        }
        await loadTokenSources();
        await loadPages();
      } else {
        showToast('Lỗi khi quét toàn bộ trang: ' + (data.error || 'Thất bại'), 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối khi quét trang: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  function renderPagesGrid() {
    const grid = document.getElementById('pagesGrid');
    if (!grid) return;

    const allPages = allPagesCache || [];

    // Update Counts on Filter Tabs & Badges
    const countAll = allPages.length;
    const countActive = allPages.filter(p => p.is_active === 1).length;
    const countInactive = allPages.filter(p => p.is_active === 0).length;

    const elAll = document.getElementById('countFilterAll');
    const elActive = document.getElementById('countFilterActive');
    const elInactive = document.getElementById('countFilterInactive');
    const elStatsBadge = document.getElementById('pagesOverviewStatsBadge');
    const elAccountsBadge = document.getElementById('accountsOverviewCountBadge');

    if (elAll) elAll.textContent = countAll;
    if (elActive) elActive.textContent = countActive;
    if (elInactive) elInactive.textContent = countInactive;
    if (elStatsBadge) elStatsBadge.textContent = `${countActive} / ${countAll} Đang Quản Lý`;
    if (elAccountsBadge) elAccountsBadge.textContent = `${(savedTokenSourcesCache || []).length} Tài Khoản`;

    // Group pages by Facebook Account (token_source_id)
    const accountGroups = [];
    const knownSourceIds = new Set();

    (savedTokenSourcesCache || []).forEach(ts => {
      knownSourceIds.add(ts.id);
      const pagesForTs = allPages.filter(p => p.token_source_id === ts.id);
      accountGroups.push({
        id: ts.id,
        name: ts.name,
        fb_user_id: ts.fb_user_id || '',
        avatar_url: ts.avatar_url || '',
        app_id: ts.app_id || '',
        token_status: ts.token_status || 'VALID',
        is_permanent: ts.is_permanent,
        pages: pagesForTs
      });
    });

    // Standalone / unassigned pages (token_source_id === 0 or not in savedTokenSourcesCache)
    const unassignedPages = allPages.filter(p => !p.token_source_id || !knownSourceIds.has(p.token_source_id));
    if (unassignedPages.length > 0) {
      accountGroups.push({
        id: 0,
        name: 'Fanpage Độc Lập / Chưa Gắn Tài Khoản',
        fb_user_id: '',
        avatar_url: '',
        app_id: '',
        token_status: 'VALID',
        is_permanent: 0,
        pages: unassignedPages
      });
    }

    if (accountGroups.length === 0 && allPages.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-sidebar" style="grid-column: 1 / -1; padding: 56px 24px; text-align: center; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px;">
          <div class="empty-icon" style="font-size: 48px; margin-bottom: 12px;">👥</div>
          <h3 style="margin: 0 0 6px 0; color: #f1f5f9; font-size: 19px;">Chưa Có Tài Khoản Facebook Nào Được Kết Nối</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; max-width: 520px; margin: 0 auto 22px auto; line-height: 1.6;">
            Hãy bấm nút bên dưới để kết nối tài khoản Facebook (Đăng nhập 1-Click hoặc dán Token). Tool sẽ tự động nhận diện tất cả Fanpage và cho phép bạn bật / tắt quản lý cho từng trang.
          </p>
          <button type="button" class="btn btn-primary" onclick="openFacebookLoginSequentialModal()" style="padding: 11px 26px; font-weight: 700; font-size: 14.5px; gap: 8px; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.45);">
            <span>➕</span> Kết Nối Tài Khoản Facebook Mới
          </button>
        </div>
      `;
      return;
    }

    // Filter each group's pages by status and search query
    const filteredGroups = accountGroups.map(group => {
      let filteredPages = group.pages;
      if (currentPageStatusFilter === 'active') {
        filteredPages = filteredPages.filter(p => p.is_active === 1);
      } else if (currentPageStatusFilter === 'inactive') {
        filteredPages = filteredPages.filter(p => p.is_active === 0);
      }

      if (currentPageSearchQuery) {
        const q = currentPageSearchQuery.toLowerCase().trim();
        filteredPages = filteredPages.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.page_id && String(p.page_id).includes(q)) ||
          (p.account_label && p.account_label.toLowerCase().includes(q)) ||
          (group.name && group.name.toLowerCase().includes(q))
        );
      }

      return {
        ...group,
        filteredPages
      };
    }).filter(g => {
      // If filtering or searching, only show groups that match
      if (currentPageSearchQuery || currentPageStatusFilter !== 'all') {
        return g.filteredPages.length > 0;
      }
      return true;
    });

    if (filteredGroups.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-sidebar" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
          <div class="empty-icon">${currentPageStatusFilter === 'inactive' ? '⏸️' : '🔍'}</div>
          <h4 style="margin: 8px 0 4px 0; color: #f1f5f9; font-size: 16px;">Không tìm thấy Fanpage phù hợp</h4>
          <p style="color: var(--text-muted); font-size: 13px;">${
            currentPageStatusFilter === 'inactive'
              ? 'Tất cả các Fanpage đều đang ở chế độ Đang Quản Lý (Active).'
              : (currentPageSearchQuery ? `Không có Fanpage nào khớp với từ khóa "${escapeHtml(currentPageSearchQuery)}".` : 'Không có trang nào trong mục này.')
          }</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filteredGroups.map(group => {
      const activeCount = group.pages.filter(p => p.is_active === 1).length;
      const totalCount = group.pages.length;
      const isAllActive = activeCount === totalCount && totalCount > 0;
      const isNoneActive = activeCount === 0 && totalCount > 0;

      const avatarHtml = group.avatar_url
        ? `<img src="${escapeHtml(group.avatar_url)}" class="account-group-avatar" alt="${escapeHtml(group.name)}">`
        : `<div class="account-group-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#60a5fa;font-size:18px;">${escapeHtml(group.name).charAt(0).toUpperCase()}</div>`;

      return `
        <div class="account-group-card" data-account-id="${group.id}">
          <div class="account-group-header">
            <div class="account-group-info">
              ${avatarHtml}
              <div>
                <div class="account-group-name-row">
                  <h4 class="account-group-name">${escapeHtml(group.name)}</h4>
                  <span class="badge-account-type">${group.id > 0 ? 'Facebook Account' : 'Độc Lập'}</span>
                  ${group.is_permanent === 1 ? '<span class="token-source-badge-permanent" style="font-size: 10px; padding: 1px 6px;">🛡️ Token Vĩnh Viễn</span>' : ''}
                </div>
                <div class="account-group-sub">
                  ${group.fb_user_id ? `<span>User ID: <code style="color:#cbd5e1;font-size:11px;background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px;">${group.fb_user_id}</code></span>` : ''}
                  ${group.app_id ? `<span>• Cổng App: <code style="color:#cbd5e1;font-size:11px;background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:3px;">${group.app_id}</code></span>` : ''}
                  <span class="account-group-stats">
                    ${totalCount === 0 ? 'Chưa có Fanpage' : (isAllActive ? '🟢 Tất cả Đang Quản Lý' : (isNoneActive ? '⏸️ Tạm Dừng Tất Cả' : `🟢 ${activeCount} / ${totalCount} Đang Quản Lý`))}
                  </span>
                </div>
              </div>
            </div>

            ${group.id > 0 ? `
              <div class="account-group-actions">
                <button type="button" class="btn btn-xs btn-primary btn-sync-account-pages" data-id="${group.id}" data-name="${escapeHtml(group.name)}" title="Quét và cập nhật các Fanpage mới tạo hoặc mới được cấp quyền trên Facebook" style="font-weight: 700; gap: 5px; box-shadow: 0 2px 10px rgba(59, 130, 246, 0.35);">
                  <span>🔄</span> Cập Nhật Trang Mới
                </button>
                <button type="button" class="btn btn-xs btn-secondary btn-account-toggle-all" data-id="${group.id}" data-action="enable" title="Bật quản lý tất cả các trang thuộc tài khoản này">
                  <span>☑️</span> Bật Tất Cả
                </button>
                <button type="button" class="btn btn-xs btn-secondary btn-account-toggle-all" data-id="${group.id}" data-action="disable" title="Tắt quản lý (Tạm dừng) tất cả các trang thuộc tài khoản này">
                  <span>⬜</span> Tắt Tất Cả
                </button>
                <button type="button" class="btn btn-xs btn-secondary btn-select-account-pages" data-id="${group.id}" title="Tích chọn những trang cụ thể muốn quản lý">
                  <span>📋</span> Chọn Lọc Page
                </button>
                <button type="button" class="btn btn-xs btn-secondary btn-hub-reauth" data-id="${group.id}" data-appid="${escapeHtml(group.app_id || '')}" data-name="${escapeHtml(group.name)}" title="Đăng nhập lại / gia hạn Token cho tài khoản này">
                  <span>🔄</span> Đăng Nhập Lại
                </button>
                <button type="button" class="btn btn-xs btn-secondary btn-hub-edit" data-id="${group.id}" title="Cấu hình App ID &amp; Secret cho tài khoản này">
                  <span>⚙️</span> Sửa App
                </button>
                <button type="button" class="btn btn-xs btn-danger btn-hub-delete" data-id="${group.id}" data-name="${escapeHtml(group.name)}" title="Ngắt kết nối tài khoản này">
                  <span>🗑️</span>
                </button>
              </div>
            ` : ''}
          </div>

          <div class="account-group-pages-grid" style="${group.filteredPages.length === 0 ? 'display:block;' : ''}">
            ${group.filteredPages.length === 0 ? `
              <div class="empty-state-sidebar" style="padding: 26px 16px; text-align: center; background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size: 28px; margin-bottom: 6px;">📄</div>
                <strong style="color: #cbd5e1; font-size: 13.5px;">Chưa có Fanpage nào được nạp cho tài khoản "${escapeHtml(group.name)}".</strong>
                <p style="color: var(--text-muted); font-size: 12px; margin: 4px 0 12px 0;">Bấm nút "Cập Nhật Trang Mới" để hệ thống tự động quét toàn bộ các trang bạn đang quản trị trên Facebook!</p>
                <button type="button" class="btn btn-sm btn-primary btn-sync-account-pages" data-id="${group.id}" data-name="${escapeHtml(group.name)}" style="font-weight: 700; gap: 6px;">
                  <span>🔄</span> Cập Nhật Trang Mới Ngay
                </button>
              </div>
            ` : group.filteredPages.map(p => {
              const isActive = p.is_active === 1;
              const isValid = p.token_status === 'VALID';
              const isPerm = p.is_permanent === 1;

              return `
                <div class="page-card ${isActive ? '' : 'is-inactive'}" data-id="${p.id}" data-page-id="${p.page_id}">
                  <div class="page-card-header">
                    ${p.avatar_url ? `<img src="${escapeHtml(p.avatar_url)}" class="page-card-avatar" alt="Avatar">` : `<div class="page-card-avatar">${escapeHtml(p.name).charAt(0)}</div>`}
                    <div class="page-card-title">
                      <h4>${escapeHtml(p.name)}</h4>
                      <span>ID: ${p.page_id}</span>
                    </div>

                    <!-- Modern Toggle Switch Control -->
                    <label class="page-switch-wrapper" title="${isActive ? 'Gạt để Tắt Quản Lý (Tool ngừng quét tin & ngừng chuông)' : 'Gạt để Bật Quản Lý (Tool quét tin & phát chuông báo thức)'}">
                      <input type="checkbox" class="page-switch-checkbox btn-toggle-page-switch" data-id="${p.id}" ${isActive ? 'checked' : ''}>
                      <span class="page-switch-track">
                        <span class="page-switch-thumb"></span>
                      </span>
                      <span class="page-switch-label ${isActive ? 'active' : 'inactive'}">
                        ${isActive ? '🟢 Đang Bật' : '⚪ Đã Tắt'}
                      </span>
                    </label>
                  </div>

                  ${!isActive ? `
                    <div class="page-inactive-banner">
                      <span>⏸️ Đang Tắt Quản Lý — Tool không quét tin & không kêu chuông</span>
                      <button type="button" class="btn btn-xxs btn-success btn-page-quick-enable" data-id="${p.id}" style="padding: 2px 8px; font-size: 10.5px; font-weight: 700; white-space: nowrap;">
                        ▶️ Bật Lại
                      </button>
                    </div>
                  ` : ''}

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
                    <button class="btn btn-sm btn-secondary btn-inspect-token" data-page-id="${p.page_id}" title="Soi hạn dùng và quyền hạn Token">
                      🔍 Soi Token
                    </button>
                    <button class="btn btn-sm btn-secondary btn-goto-shifts" data-page-id="${p.page_id}" title="Cài đặt ca trực nhân viên cho trang này">
                      ⏰ Ca Trực
                    </button>
                    <button class="btn btn-sm btn-secondary btn-subscribe-page" data-id="${p.id}" title="Đăng ký Webhook nhận tin tức thì">
                      🌐 Webhook
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-page" data-id="${p.id}" title="Xóa Fanpage khỏi hệ thống">
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Wire Toggle Switch Events
    grid.querySelectorAll('.btn-toggle-page-switch').forEach(sw => {
      sw.addEventListener('change', async () => {
        const pageId = sw.dataset.id;
        const nextActive = sw.checked ? 1 : 0;
        try {
          sw.disabled = true;
          const res = await fetch(`/api/pages/${pageId}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: nextActive })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(data.message || (nextActive ? 'Đã bật quản lý Fanpage!' : 'Đã tạm dừng Fanpage!'), 'success');
            await loadPages();
            loadTokenSources();
          } else {
            sw.checked = !sw.checked; // rollback
            showToast('Lỗi: ' + (data.error || 'Không thể đổi trạng thái'), 'error');
          }
        } catch (err) {
          sw.checked = !sw.checked;
          showToast('Lỗi kết nối: ' + err.message, 'error');
        } finally {
          sw.disabled = false;
        }
      });
    });

    // Wire Quick Enable Buttons in inactive banner
    grid.querySelectorAll('.btn-page-quick-enable').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pageId = btn.dataset.id;
        try {
          btn.disabled = true;
          const res = await fetch(`/api/pages/${pageId}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: 1 })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('Đã bật lại quản lý Fanpage!', 'success');
            await loadPages();
            loadTokenSources();
          } else {
            showToast('Lỗi: ' + (data.error || 'Không thể bật lại trang'), 'error');
          }
        } catch (err) {
          showToast('Lỗi kết nối: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Wire Sync Account Pages (Cập Nhật Trang Mới của 1 tài khoản)
    grid.querySelectorAll('.btn-sync-account-pages').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sourceId = btn.dataset.id;
        const sourceName = btn.dataset.name || 'Tài khoản Facebook';
        await syncTokenSourcePages(sourceId, sourceName, btn);
      });
    });

    // Wire Account Toggle All (Bật Tất Cả / Tắt Tất Cả)
    grid.querySelectorAll('.btn-account-toggle-all').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tsId = Number(btn.dataset.id);
        const action = btn.dataset.action; // 'enable' or 'disable'
        const group = accountGroups.find(g => g.id === tsId);
        if (!group) return;

        const targetPageIds = action === 'enable' ? group.pages.map(p => p.page_id) : [];
        try {
          btn.disabled = true;
          const res = await fetch(`/api/token-sources/${tsId}/manage-pages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active_page_ids: targetPageIds })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(action === 'enable' 
              ? `🎉 Đã bật quản lý tất cả ${targetPageIds.length} Fanpage của "${group.name}"!` 
              : `⏸️ Đã tạm dừng tất cả Fanpage của "${group.name}"!`, 'success');
            await loadPages();
            loadTokenSources();
          } else {
            showToast('Lỗi: ' + (data.error || 'Thao tác thất bại'), 'error');
          }
        } catch (err) {
          showToast('Lỗi kết nối: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Wire Select Account Pages Modal button
    grid.querySelectorAll('.btn-select-account-pages').forEach(btn => {
      btn.addEventListener('click', () => {
        openManageAccountPagesModal(Number(btn.dataset.id));
      });
    });

    // Wire Account Hub: Reauth button
    grid.querySelectorAll('.btn-hub-reauth').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.dataset.id;
        const appId = btn.dataset.appid || '';
        const accName = btn.dataset.name || '';
        const width = 650;
        const height = 750;
        const left = Math.max(0, Math.round((window.screen.width - width) / 2));
        const top = Math.max(0, Math.round((window.screen.height - height) / 2));
        const popupUrl = `/auth/facebook?popup=1&reauth=1&account_id=${encodeURIComponent(accId)}&app_id=${encodeURIComponent(appId)}&account_name=${encodeURIComponent(accName)}`;
        const popup = window.open(popupUrl, 'fb_oauth_popup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`);
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = popupUrl.replace('popup=1&', '');
        }
      });
    });

    // Wire Account Hub: Edit App button
    grid.querySelectorAll('.btn-hub-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditAccountAppModal(Number(btn.dataset.id));
      });
    });

    // Wire Account Hub: Delete account button
    grid.querySelectorAll('.btn-hub-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accId = btn.dataset.id;
        const accName = btn.dataset.name || 'tài khoản này';
        if (!confirm(`Bạn có chắc chắn muốn ngắt kết nối tài khoản Facebook "${accName}"?\n(Các Fanpage đã kết nối vẫn được bảo toàn dữ liệu)`)) {
          return;
        }
        try {
          const res = await fetch(`/api/token-sources/${accId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast(`Đã ngắt kết nối tài khoản "${accName}" thành công!`, 'success');
            loadTokenSources();
            loadPages();
          } else {
            showToast('Lỗi khi xóa tài khoản: ' + data.error, 'error');
          }
        } catch (err) {
          showToast('Lỗi mạng: ' + err.message, 'error');
        }
      });
    });

    // Wire token inspection, shifts, webhook, delete buttons for pages
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

  // -------------------------------------------------------------
  // Modal: Manage Account Pages (Chọn Fanpage Quản Lý)
  // -------------------------------------------------------------
  function openManageAccountPagesModal(tokenSourceId) {
    activeManagingTokenSourceId = Number(tokenSourceId);
    const source = (savedTokenSourcesCache || []).find(s => s.id === activeManagingTokenSourceId);
    if (!source) {
      showToast('Không tìm thấy thông tin tài khoản Facebook!', 'error');
      return;
    }

    const titleEl = document.getElementById('manageAccountModalTitle');
    const subEl = document.getElementById('manageAccountModalSubtitle');
    const listEl = document.getElementById('accountPagesListModal');
    const countTextEl = document.getElementById('selectedPagesCountText');

    if (titleEl) titleEl.innerHTML = `<span>⚙️</span> Chọn Fanpage Quản Lý: <strong style="color: #60a5fa; margin-left: 6px;">${escapeHtml(source.name)}</strong>`;
    if (subEl) subEl.textContent = `Tài khoản: ${source.name} ${source.fb_user_id ? `(User ID: ${source.fb_user_id})` : ''} • Tổng cộng: ${source.pages ? source.pages.length : 0} Fanpage`;

    const pages = Array.isArray(source.pages) ? source.pages : [];

    function updateSelectedCount() {
      if (!listEl) return;
      const selectedCount = listEl.querySelectorAll('.account-page-checkbox:checked').length;
      if (countTextEl) {
        countTextEl.innerHTML = `Đang chọn quản lý: <strong style="color: #34d399;">${selectedCount}</strong> / ${pages.length} Fanpage`;
      }
    }

    if (!listEl) return;

    if (pages.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 28px 10px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
          <div style="font-size: 13.5px; color: #cbd5e1;">Tài khoản này chưa có Fanpage nào được liên kết.</div>
          <div style="font-size: 12px; margin-top: 4px;">Hãy bấm "🔄 Đăng Nhập Lại" để cấp quyền quản lý Fanpage cho tài khoản này.</div>
        </div>
      `;
      if (countTextEl) countTextEl.textContent = 'Đang chọn: 0 Fanpage';
      openModal('manageAccountPagesModal');
      return;
    }

    listEl.innerHTML = pages.map(p => {
      const isChecked = p.is_active === 1;
      const avatarHtml = p.avatar_url
        ? `<img src="${escapeHtml(p.avatar_url)}" class="account-page-avatar" alt="${escapeHtml(p.name)}">`
        : `<div class="account-page-avatar" style="background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${escapeHtml(p.name).charAt(0)}</div>`;

      return `
        <label class="account-page-item ${isChecked ? 'active' : ''}" data-page-id="${p.page_id}">
          <div class="account-page-left">
            <input type="checkbox" class="account-page-checkbox" data-page-id="${p.page_id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6;">
            ${avatarHtml}
            <div class="account-page-info">
              <div class="account-page-name">${escapeHtml(p.name)}</div>
              <div class="account-page-meta">
                <span>ID: ${p.page_id}</span>
                <span class="${p.token_status === 'VALID' ? 'token-badge-valid' : 'token-badge-invalid'}" style="font-size: 10.5px;">
                  ${p.token_status === 'VALID' ? '✅ Token Sống' : '❌ Hết Hạn'}
                </span>
                ${p.is_permanent === 1 ? '<span class="token-source-badge-permanent" style="font-size: 10px; padding: 1px 5px;">🛡️ Vĩnh Viễn</span>' : ''}
              </div>
            </div>
          </div>
          <div class="account-page-status-badge">
            <span class="badge-tag status-label" style="font-size: 11px; padding: 3px 8px; background: ${isChecked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)'}; color: ${isChecked ? '#34d399' : '#94a3b8'};">
              ${isChecked ? '🟢 Đang Quản Lý' : '⚪ Tạm Dừng'}
            </span>
          </div>
        </label>
      `;
    }).join('');

    // Handle check changes
    listEl.querySelectorAll('.account-page-checkbox').forEach(chk => {
      chk.addEventListener('change', () => {
        const item = chk.closest('.account-page-item');
        const badge = item ? item.querySelector('.status-label') : null;
        if (chk.checked) {
          item?.classList.add('active');
          if (badge) {
            badge.textContent = '🟢 Đang Quản Lý';
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.color = '#34d399';
          }
        } else {
          item?.classList.remove('active');
          if (badge) {
            badge.textContent = '⚪ Tạm Dừng';
            badge.style.background = 'rgba(100, 116, 139, 0.2)';
            badge.style.color = '#94a3b8';
          }
        }
        updateSelectedCount();
      });
    });

    updateSelectedCount();
    openModal('manageAccountPagesModal');
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

  // Helper to quickly switch to Direct Token tab (No App ID required)
  function switchToDirectTokenTab() {
    openModal('addPageModal');
    document.getElementById('discoveredPagesCard').style.display = 'none';
    document.getElementById('btnImportSelectedPages').style.display = 'none';
    loadTokenSources();
    const directBtn = document.querySelector('.modal-tab-btn[data-tab="tab-direct-token"]');
    if (directBtn) directBtn.click();
  }

  // Direct Token Quick Connect button in header
  document.getElementById('btnDirectTokenQuickAdd')?.addEventListener('click', () => {
    switchToDirectTokenTab();
  });

  // -------------------------------------------------------------
  // -------------------------------------------------------------
  // Unified Sequential Facebook Login & Multi-Account Management Flow
  // -------------------------------------------------------------
  let currentEditingAccountId = null;
  let generalAppConfigCache = null;

  function renderConnectedAccountsList(tokenSources) {
    const container = document.getElementById('connectedAccountsList');
    const badge = document.getElementById('connectedAccountsCountBadge');
    const reuseRow = document.getElementById('reuseAppConfigRow');
    const reuseSelect = document.getElementById('selectSavedAppReuse');
    if (!container) return;

    const list = Array.isArray(tokenSources) ? tokenSources : (savedTokenSourcesCache || []);

    // 1. Update Header Badge
    if (badge) {
      const totalPages = list.reduce((sum, s) => sum + (s.current_pages_count || (s.pages && s.pages.length) || s.pages_count || 0), 0);
      badge.textContent = `${list.length} Tài Khoản • ${totalPages} Fanpage`;
    }

    // 2. Populate Quick Reuse Dropdown
    if (reuseRow && reuseSelect) {
      const sourcesWithApp = list.filter(s => s.app_id && s.app_id.trim() !== '');
      if (sourcesWithApp.length > 0) {
        reuseRow.style.display = 'flex';
        reuseSelect.innerHTML = '<option value="">-- Tự nhập App ID &amp; Secret mới --</option>' +
          sourcesWithApp.map(s => `
            <option value="${s.id}">${escapeHtml(s.name)} (App ID: ${escapeHtml(s.app_id)})</option>
          `).join('');
      } else {
        reuseRow.style.display = 'none';
      }
    }

    // 3. Render Empty State or Account Cards
    if (list.length === 0) {
      container.innerHTML = `
        <div id="emptyConnectedAccountsMsg" style="padding: 20px; text-align: center; color: var(--text-muted); background: rgba(0, 0, 0, 0.2); border: 1px dashed var(--border-color); border-radius: 8px; font-size: 13px;">
          <div style="font-size: 26px; margin-bottom: 6px;">👥</div>
          <strong style="color: #cbd5e1;">Chưa có tài khoản Facebook nào được kết nối.</strong>
          <div style="margin-top: 4px; font-size: 12px;">Hãy nhập thông tin App và bấm <em>"Đăng Nhập Facebook"</em> ở mục bên dưới để kết nối tài khoản đầu tiên!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(ts => {
      const isPerm = ts.is_permanent === 1;
      const pageCount = ts.current_pages_count || (ts.pages && ts.pages.length) || ts.pages_count || 0;
      const pagesList = Array.isArray(ts.pages) ? ts.pages : [];

      const avatarHtml = ts.avatar_url ? `
        <img src="${escapeHtml(ts.avatar_url)}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #3b82f6; flex-shrink: 0;" alt="${escapeHtml(ts.name)}">
      ` : `
        <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #1877f2, #3b82f6); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; flex-shrink: 0;">
          ${escapeHtml((ts.name || 'FB').charAt(0).toUpperCase())}
        </div>
      `;

      return `
        <div class="connected-account-card" data-id="${ts.id}" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.09); border-radius: 8px; padding: 12px 14px; transition: border-color 0.2s, background-color 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            
            <!-- Left: Avatar & Info -->
            <div style="display: flex; align-items: center; gap: 10px; min-width: 220px; flex: 1;">
              ${avatarHtml}
              <div>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <strong style="color: #f1f5f9; font-size: 13.5px;">${escapeHtml(ts.name)}</strong>
                  ${ts.fb_user_id ? `<span class="badge-tag" style="background: rgba(24, 119, 242, 0.2); color: #60a5fa; font-size: 10px; padding: 1px 6px;">🔵 FB ID: ${escapeHtml(ts.fb_user_id)}</span>` : ''}
                  ${isPerm ? `<span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 10px; padding: 1px 6px;">🛡️ Token vĩnh viễn</span>` : '<span class="badge-tag" style="background: rgba(234, 179, 8, 0.15); color: #fbbf24; font-size: 10px; padding: 1px 6px;">🕒 Dài hạn</span>'}
                </div>
                <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                  <span>App ID: <code style="color: #93c5fd; background: rgba(59,130,246,0.12); padding: 1px 6px; border-radius: 3px; font-weight: 600;">${ts.app_id ? escapeHtml(ts.app_id) : 'Chưa gán'}</code></span>
                  <span>Đang kết nối: <strong style="color: #34d399;">${pageCount} Fanpage</strong></span>
                  ${ts.has_app_secret ? `<span style="color: #10b981; font-size: 11px;">🔒 Có App Secret</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Right: Quick Action Buttons -->
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <button type="button" class="btn btn-xs btn-primary btn-reauth-account" data-id="${ts.id}" data-appid="${escapeHtml(ts.app_id || '')}" data-name="${escapeHtml(ts.name)}" title="Đăng nhập lại / Gia hạn Token bằng App của tài khoản này" style="font-weight: 600; padding: 4px 8px; gap: 4px;">
                <span>🔄</span> Đăng Nhập Lại
              </button>
              <button type="button" class="btn btn-xs btn-secondary btn-toggle-account-pages" data-id="${ts.id}" title="Xem danh sách Fanpage thuộc tài khoản này" style="padding: 4px 8px; gap: 4px; font-size: 11px;">
                <span>📄</span> ${pageCount} Page ▾
              </button>
              <button type="button" class="btn btn-xs btn-secondary btn-edit-account-app" data-id="${ts.id}" title="Tải thông tin App của tài khoản này xuống form để chỉnh sửa" style="padding: 4px 8px; gap: 4px; font-size: 11px;">
                <span>✏️</span> Sửa App
              </button>
              <button type="button" class="btn btn-xs btn-danger btn-delete-connected-account" data-id="${ts.id}" data-name="${escapeHtml(ts.name)}" title="Ngắt kết nối tài khoản này" style="padding: 4px 7px;">
                <span>🗑️</span>
              </button>
            </div>
          </div>

          <!-- Expandable Pages Drawer -->
          <div id="accPagesDrawer_${ts.id}" style="display: none; margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.08); font-size: 11.5px;">
            <div style="color: var(--text-muted); margin-bottom: 6px; font-weight: 600;">Danh sách Fanpage thuộc nick này:</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${pagesList.length > 0 ? pagesList.map(p => `
                <span class="badge-tag" style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; font-size: 11px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 5px;">
                  <span>📄</span> <strong>${escapeHtml(p.name)}</strong> <code>(${escapeHtml(p.page_id)})</code>
                </span>
              `).join('') : '<span style="color: var(--text-muted); font-style: italic;">Chưa có Fanpage nào được kết nối với tài khoản này.</span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Event Listeners to Account Card Buttons
    container.querySelectorAll('.btn-reauth-account').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.dataset.id;
        const appId = btn.dataset.appid || '';
        const accName = btn.dataset.name || '';
        
        closeModal('facebookLoginSequentialModal');

        const width = 650;
        const height = 750;
        const left = Math.max(0, Math.round((window.screen.width - width) / 2));
        const top = Math.max(0, Math.round((window.screen.height - height) / 2));

        const popupUrl = `/auth/facebook?popup=1&reauth=1&account_id=${encodeURIComponent(accId)}&app_id=${encodeURIComponent(appId)}&account_name=${encodeURIComponent(accName)}`;
        const popup = window.open(popupUrl, 'fb_oauth_popup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`);
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = popupUrl.replace('popup=1&', '');
        }
      });
    });

    container.querySelectorAll('.btn-toggle-account-pages').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = document.getElementById(`accPagesDrawer_${btn.dataset.id}`);
        if (!drawer) return;
        if (drawer.style.display === 'none') {
          drawer.style.display = 'block';
          btn.innerHTML = `<span>📄</span> Thu gọn ▴`;
        } else {
          drawer.style.display = 'none';
          const acc = list.find(s => String(s.id) === String(btn.dataset.id));
          const pCount = acc ? (acc.current_pages_count || (acc.pages && acc.pages.length) || acc.pages_count || 0) : 0;
          btn.innerHTML = `<span>📄</span> ${pCount} Page ▾`;
        }
      });
    });

    container.querySelectorAll('.btn-edit-account-app').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = Number(btn.dataset.id);
        const acc = list.find(s => s.id === accId);
        if (!acc) return;

        currentEditingAccountId = accId;
        const labelInput = document.getElementById('seqAccountLabelInput');
        const appIdInput = document.getElementById('seqFbAppIdInput');
        const secretInput = document.getElementById('seqFbAppSecretInput');
        const titleEl = document.getElementById('seqFormSectionTitle');
        const resetBtn = document.getElementById('btnResetSeqForm');

        if (labelInput) labelInput.value = acc.name || '';
        if (appIdInput) appIdInput.value = acc.app_id || '';
        if (secretInput) {
          secretInput.value = '';
          secretInput.placeholder = acc.has_app_secret ? '•••••••••••••••• (Đã lưu bí mật, nhập nếu muốn đổi)' : 'Chuỗi mã bí mật (e8fe1eea...)';
        }
        if (titleEl) titleEl.innerHTML = `✏️ ĐANG CẬP NHẬT CẤU HÌNH CHO TÀI KHOẢN: <span style="color: #f1f5f9;">"${escapeHtml(acc.name)}"</span>`;
        if (resetBtn) resetBtn.style.display = 'inline-flex';

        const formSection = document.getElementById('connectNewAccountSection');
        if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    container.querySelectorAll('.btn-delete-connected-account').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accId = btn.dataset.id;
        const accName = btn.dataset.name || 'tài khoản này';
        if (!confirm(`Bạn có chắc chắn muốn ngắt kết nối tài khoản Facebook "${accName}"?\n(Các Fanpage đã kết nối vẫn được bảo toàn dữ liệu)`)) {
          return;
        }

        try {
          const res = await fetch(`/api/token-sources/${accId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast(`Đã ngắt kết nối tài khoản "${accName}" thành công!`, 'success');
            loadTokenSources();
            loadPages();
          } else {
            showToast('Lỗi khi xóa tài khoản: ' + data.error, 'error');
          }
        } catch (err) {
          showToast('Lỗi mạng: ' + err.message, 'error');
        }
      });
    });
  }

  // -------------------------------------------------------------
  // Render Main Connected Accounts Table on View 2
  // -------------------------------------------------------------
  function renderMainConnectedAccountsTable(tokenSources) {
    const tbody = document.getElementById('connectedAccountsTableBody');
    const badge = document.getElementById('accountsOverviewCountBadge');
    if (!tbody) return;

    const list = Array.isArray(tokenSources) ? tokenSources : (savedTokenSourcesCache || []);

    // 1. Update Header Badge
    if (badge) {
      const totalPages = list.reduce((sum, s) => sum + (s.current_pages_count || (s.pages && s.pages.length) || s.pages_count || 0), 0);
      badge.textContent = `${list.length} Tài Khoản • ${totalPages} Fanpage`;
    }

    // 2. Render Empty State or Account Rows
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px 16px; color: var(--text-muted); background: rgba(15, 23, 42, 0.35);">
            <div style="font-size: 32px; margin-bottom: 8px;">👥</div>
            <strong style="color: #cbd5e1; font-size: 14.5px;">Chưa có tài khoản Facebook nào được kết nối.</strong>
            <div style="margin-top: 6px; font-size: 12.5px; color: var(--text-secondary);">
              Bấm nút <strong>"➕ Thêm Tài Khoản Mới"</strong> ngay bên dưới để kết nối tự động cực nhanh!
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(ts => {
      const isPerm = ts.is_permanent === 1;
      const pageCount = ts.current_pages_count || (ts.pages && ts.pages.length) || ts.pages_count || 0;
      const pagesList = Array.isArray(ts.pages) ? ts.pages : [];

      const avatarHtml = ts.avatar_url ? `
        <img src="${escapeHtml(ts.avatar_url)}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid #3b82f6; flex-shrink: 0;" alt="${escapeHtml(ts.name)}">
      ` : `
        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #1877f2, #3b82f6); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">
          ${escapeHtml((ts.name || 'FB').charAt(0).toUpperCase())}
        </div>
      `;

      return `
        <tr data-account-id="${ts.id}">
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              ${avatarHtml}
              <div>
                <div style="font-weight: 700; color: #f1f5f9; font-size: 13.5px; display: flex; align-items: center; gap: 6px;">
                  <span>${escapeHtml(ts.name)}</span>
                  ${ts.fb_user_id ? `<span class="badge-tag" style="background: rgba(24, 119, 242, 0.2); color: #60a5fa; font-size: 10px; padding: 1px 6px;">Facebook</span>` : ''}
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  Kết nối: ${new Date(ts.created_at || Date.now()).toLocaleDateString('vi-VN')}
                </div>
              </div>
            </div>
          </td>
          <td>
            ${ts.fb_user_id ? `<code style="color: #cbd5e1; font-size: 11.5px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${escapeHtml(ts.fb_user_id)}</code>` : '<span style="color: var(--text-muted); font-size: 12px;">--</span>'}
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-weight: 700; color: #34d399; font-size: 12.5px;">
                🟢 ${ts.active_pages_count !== undefined ? ts.active_pages_count : pageCount} / ${pageCount} Đang Quản Lý
              </span>
              ${pagesList.length > 0 ? `
                <div style="display: flex; gap: 4px; flex-wrap: wrap; max-width: 260px;">
                  ${pagesList.slice(0, 3).map(p => `
                    <span class="badge-tag" style="background: ${p.is_active === 1 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.18)'}; color: ${p.is_active === 1 ? '#6ee7b7' : '#94a3b8'}; border: 1px solid ${p.is_active === 1 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 116, 139, 0.25)'}; font-size: 10.5px; padding: 1px 6px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(p.name)} (${p.is_active === 1 ? 'Đang quản lý' : 'Tạm dừng'})">
                      ${p.is_active === 1 ? '🟢' : '⏸️'} ${escapeHtml(p.name)}
                    </span>
                  `).join('')}
                  ${pagesList.length > 3 ? `<span class="badge-tag" style="background: rgba(30, 41, 59, 0.8); color: #64748b; font-size: 10px; padding: 1px 5px;">+${pagesList.length - 3}</span>` : ''}
                </div>
              ` : '<span style="color: var(--text-muted); font-size: 11px; font-style: italic;">Chưa có Fanpage</span>'}
              <button type="button" class="btn btn-xxs btn-select-account-pages" data-id="${ts.id}" data-name="${escapeHtml(ts.name)}" style="margin-top: 4px; padding: 3px 9px; font-size: 11px; width: fit-content; gap: 4px; display: inline-flex; align-items: center; border-radius: 4px; color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); background: rgba(59, 130, 246, 0.1); font-weight: 600; cursor: pointer;">
                <span>📋</span> Chọn Page Quản Lý
              </button>
            </div>
          </td>
          <td>
            ${isPerm ? `
              <span class="token-source-badge-permanent" style="white-space: nowrap !important; flex-shrink: 0 !important; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px;">
                🛡️ Vĩnh Viễn
              </span>
            ` : `
              <span class="token-source-badge-standard" style="white-space: nowrap !important; flex-shrink: 0 !important; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px;">
                🕒 Dài Hạn
              </span>
            `}
          </td>
          <td>
            ${ts.app_id ? `
              <code style="color: #93c5fd; background: rgba(59,130,246,0.12); padding: 2px 7px; border-radius: 4px; font-weight: 600; font-size: 11.5px;">${escapeHtml(ts.app_id)}</code>
            ` : `
              <span style="color: var(--text-muted); font-size: 11.5px; font-style: italic;">Cổng Mặc Định</span>
            `}
            ${ts.has_app_secret ? '<span title="Đã lưu App Secret" style="margin-left: 4px; color: #10b981; font-size: 12px;">🔒</span>' : ''}
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap;">
              <button type="button" class="btn btn-xs btn-primary btn-main-table-reauth" data-id="${ts.id}" data-appid="${escapeHtml(ts.app_id || '')}" data-name="${escapeHtml(ts.name)}" title="Đăng nhập lại / gia hạn Token cho tài khoản này" style="font-weight: 600; padding: 4px 8px; gap: 4px;">
                <span>🔄</span> Đăng Nhập Lại
              </button>
              <button type="button" class="btn btn-xs btn-secondary btn-main-table-edit" data-id="${ts.id}" title="Cấu hình App ID & Secret cho tài khoản này" style="padding: 4px 8px; gap: 4px; font-size: 11px;">
                <span>⚙️</span> Sửa App
              </button>
              <button type="button" class="btn btn-xs btn-danger btn-main-table-delete" data-id="${ts.id}" data-name="${escapeHtml(ts.name)}" title="Ngắt kết nối tài khoản này" style="padding: 4px 7px;">
                <span>🗑️</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    tbody.querySelectorAll('.btn-select-account-pages').forEach(btn => {
      btn.addEventListener('click', () => {
        openManageAccountPagesModal(Number(btn.dataset.id));
      });
    });

    tbody.querySelectorAll('.btn-main-table-reauth').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.dataset.id;
        const appId = btn.dataset.appid || '';
        const accName = btn.dataset.name || '';
        const width = 650;
        const height = 750;
        const left = Math.max(0, Math.round((window.screen.width - width) / 2));
        const top = Math.max(0, Math.round((window.screen.height - height) / 2));
        const popupUrl = `/auth/facebook?popup=1&reauth=1&account_id=${encodeURIComponent(accId)}&app_id=${encodeURIComponent(appId)}&account_name=${encodeURIComponent(accName)}`;
        const popup = window.open(popupUrl, 'fb_oauth_popup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`);
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = popupUrl.replace('popup=1&', '');
        }
      });
    });

    tbody.querySelectorAll('.btn-main-table-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditAccountAppModal(Number(btn.dataset.id));
      });
    });

    tbody.querySelectorAll('.btn-main-table-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const accId = btn.dataset.id;
        const accName = btn.dataset.name || 'tài khoản này';
        if (!confirm(`Bạn có chắc chắn muốn ngắt kết nối tài khoản Facebook "${accName}"?\n(Các Fanpage đã kết nối vẫn được bảo toàn dữ liệu)`)) {
          return;
        }
        try {
          const res = await fetch(`/api/token-sources/${accId}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast(`Đã ngắt kết nối tài khoản "${accName}" thành công!`, 'success');
            loadTokenSources();
            loadPages();
          } else {
            showToast('Lỗi khi xóa tài khoản: ' + data.error, 'error');
          }
        } catch (err) {
          showToast('Lỗi mạng: ' + err.message, 'error');
        }
      });
    });
  }

  // -------------------------------------------------------------
  // Open Add New Account Modal (Clean, Auto-focused Flow)
  // -------------------------------------------------------------
  async function openAddNewAccountModal() {
    currentEditingAccountId = null;
    const labelInput = document.getElementById('seqAccountLabelInput');
    const appIdInput = document.getElementById('seqFbAppIdInput');
    const secretInput = document.getElementById('seqFbAppSecretInput');
    const tokenInput = document.getElementById('seqTokenInput');
    const titleEl = document.getElementById('seqFormSectionTitle');
    const modalTitleEl = document.getElementById('seqModalTitle');
    const subTitleEl = document.getElementById('seqModalSubtitle');
    const resetBtn = document.getElementById('btnResetSeqForm');
    const connSection = document.getElementById('connectedAccountsSection');
    const drawer = document.getElementById('seqAppCredentialsDrawerContent');
    const drawerBtnText = document.getElementById('toggleAppCredentialsText');

    if (labelInput) labelInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (titleEl) titleEl.textContent = 'Kết Nối Tài Khoản Facebook Mới';
    if (modalTitleEl) modalTitleEl.textContent = 'Kết Nối Tài Khoản Facebook';
    if (subTitleEl) subTitleEl.textContent = 'Đăng nhập 1-Click hoặc dán Token để tự động nhận diện tên & kích hoạt Fanpage';
    if (resetBtn) resetBtn.style.display = 'none';
    if (connSection) connSection.style.display = 'none';
    if (drawer) drawer.style.display = 'none';
    if (drawerBtnText) drawerBtnText.textContent = 'Hiện Cấu Hình Nâng Cao ▾';

    await openFacebookLoginSequentialModal(false);
  }

  // -------------------------------------------------------------
  // Open Edit Account App Credentials Modal
  // -------------------------------------------------------------
  async function openEditAccountAppModal(accId) {
    currentEditingAccountId = accId;
    const acc = (savedTokenSourcesCache || []).find(s => s.id === accId);
    if (!acc) return;

    const labelInput = document.getElementById('seqAccountLabelInput');
    const appIdInput = document.getElementById('seqFbAppIdInput');
    const inlineAppId = document.getElementById('seqInlineAppIdInput');
    const secretInput = document.getElementById('seqFbAppSecretInput');
    const tokenInput = document.getElementById('seqTokenInput');
    const titleEl = document.getElementById('seqFormSectionTitle');
    const modalTitleEl = document.getElementById('seqModalTitle');
    const subTitleEl = document.getElementById('seqModalSubtitle');
    const resetBtn = document.getElementById('btnResetSeqForm');
    const connSection = document.getElementById('connectedAccountsSection');
    const drawer = document.getElementById('seqAppCredentialsDrawerContent');
    const drawerBtnText = document.getElementById('toggleAppCredentialsText');

    if (labelInput) labelInput.value = acc.name || '';
    if (appIdInput) appIdInput.value = acc.app_id || '';
    if (inlineAppId) inlineAppId.value = acc.app_id || '';
    if (secretInput) {
      secretInput.value = '';
      secretInput.placeholder = acc.has_app_secret ? '•••••••••••••••• (Đã lưu bí mật, nhập nếu muốn đổi)' : 'Chuỗi mã bí mật (e8fe1eea...)';
    }
    if (tokenInput) tokenInput.value = '';
    if (titleEl) titleEl.innerHTML = `✏️ Sửa Cấu Hình App Cho: <span style="color: #f1f5f9;">"${escapeHtml(acc.name)}"</span>`;
    if (modalTitleEl) modalTitleEl.textContent = 'Cấu Hình App Cho Tài Khoản';
    if (subTitleEl) subTitleEl.textContent = `Tùy chỉnh App ID & App Secret riêng cho tài khoản "${acc.name}"`;
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    if (connSection) connSection.style.display = 'none';
    if (drawer) drawer.style.display = 'block';
    if (drawerBtnText) drawerBtnText.textContent = 'Thu Gọn Cấu Hình ▴';

    await openFacebookLoginSequentialModal(true);
    if (drawer) drawer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------
  // Helper: Lock / Unlock Step 2 based on Step 1 completion status
  // -------------------------------------------------------------
  function updateStep2Visibility(isUnlocked) {
    const step2Card = document.getElementById('step2ConnectCard');
    const lockedNotice = document.getElementById('step2LockedNotice');
    if (!step2Card) return;

    if (isUnlocked) {
      step2Card.style.display = 'block';
      if (lockedNotice) lockedNotice.style.display = 'none';
    } else {
      step2Card.style.display = 'none';
      if (lockedNotice) lockedNotice.style.display = 'block';
    }
  }

  async function openFacebookLoginSequentialModal(skipFieldReset = false) {
    try {
      // 1. Load Token Sources (Connected Accounts)
      const tokenRes = await fetch('/api/token-sources');
      const tokenData = await tokenRes.json();
      if (tokenData.ok && tokenData.tokenSources) {
        savedTokenSourcesCache = tokenData.tokenSources;
        renderConnectedAccountsList(tokenData.tokenSources);
        renderMainConnectedAccountsTable(tokenData.tokenSources);
      }

      // 2. Load General App Config & Redirect URIs
      const res = await fetch('/api/facebook-app-config');
      const data = await res.json();
      if (data.ok) {
        generalAppConfigCache = data;
        const appIdInput = document.getElementById('seqFbAppIdInput');
        const appSecretInput = document.getElementById('seqFbAppSecretInput');
        const badge = document.getElementById('fbAppConfigStatusBadge');
        const uriEl = document.getElementById('seqRedirectUriText');
        const oauthBtnText = document.getElementById('btnSeqExecuteOAuthLoginText');

        if (!currentEditingAccountId && !skipFieldReset) {
          if (appIdInput) appIdInput.value = data.appId || '';
          if (appSecretInput) {
            appSecretInput.value = data.appSecret || '';
            appSecretInput.placeholder = data.hasAppSecret ? '•••••••••••••••• (Đã lưu bí mật)' : 'Chuỗi mã bí mật 32 ký tự (e8fe1eea...)';
          }
        }

        const activeAppId = ((appIdInput && appIdInput.value) || data.appId || '').trim();
        const hasSecret = Boolean((appSecretInput && appSecretInput.value && appSecretInput.value.trim()) || data.hasAppSecret || data.appSecret);

        if (activeAppId && hasSecret) {
          if (oauthBtnText) oauthBtnText.textContent = `Đăng Nhập Facebook Ngay (Cổng App: ${activeAppId})`;
          if (badge) {
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.color = '#34d399';
            badge.textContent = `✅ Đã có App ID & Secret`;
          }
        } else if (activeAppId) {
          if (oauthBtnText) oauthBtnText.textContent = `Đăng Nhập Facebook Ngay (Cổng App: ${activeAppId})`;
          if (badge) {
            badge.style.background = 'rgba(245, 158, 11, 0.2)';
            badge.style.color = '#fbbf24';
            badge.textContent = `⚠️ Thiếu App Secret (Cần điền)`;
          }
        } else {
          if (oauthBtnText) oauthBtnText.textContent = 'Bắt Đầu Đăng Nhập Facebook';
          if (badge) {
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#f87171';
            badge.textContent = '⚠️ Chưa cấu hình';
          }
        }

        // STEP 2 LOCK / UNLOCK: Chỉ hiển thị Bước 2 sau khi nhập xong Bước 1
        const isStep1Done = Boolean(activeAppId && hasSecret);
        updateStep2Visibility(isStep1Done);

        if (uriEl) {
          const callbackUri = (data.redirectUris && data.redirectUris[0]) || `${window.location.origin}/auth/facebook/callback`;
          uriEl.textContent = callbackUri;
        }
        const siteUrlEl = document.getElementById('siteUrlText');
        if (siteUrlEl) siteUrlEl.textContent = `${window.location.origin}/`;
        const appDomainEl = document.getElementById('appDomainText');
        if (appDomainEl) appDomainEl.textContent = window.location.hostname;
      }
    } catch (err) {
      console.warn('Lỗi tải cấu hình app:', err);
    }
    openModal('facebookLoginSequentialModal');
  }

  // Open Sequential Modal from Main View 2 Add Button
  document.getElementById('btnAddNewAccountMain')?.addEventListener('click', () => {
    openAddNewAccountModal();
  });

  // Open Sequential Modal from Header Buttons (backward compatibility)
  document.getElementById('btnFacebookOAuthLogin')?.addEventListener('click', () => {
    openAddNewAccountModal();
  });
  document.getElementById('openFbAppConfigBtn')?.addEventListener('click', () => {
    openAddNewAccountModal();
  });

  // Toggle Advanced App Credentials Drawer in Modal
  document.getElementById('btnToggleAppCredentialsDrawer')?.addEventListener('click', () => {
    const drawer = document.getElementById('seqAppCredentialsDrawerContent');
    const textSpan = document.getElementById('toggleAppCredentialsText');
    if (!drawer) return;
    if (drawer.style.display === 'none') {
      drawer.style.display = 'block';
      if (textSpan) textSpan.textContent = 'Thu Gọn Cấu Hình ▴';
    } else {
      drawer.style.display = 'none';
      if (textSpan) textSpan.textContent = 'Hiện Cấu Hình Nâng Cao ▾';
    }
  });

  // Modal Close Buttons
  document.getElementById('closeFbSequentialModalBtn')?.addEventListener('click', () => {
    closeModal('facebookLoginSequentialModal');
  });
  document.getElementById('closeFbSequentialFooterBtn')?.addEventListener('click', () => {
    closeModal('facebookLoginSequentialModal');
  });

  // Scroll to Add New Account Button
  document.getElementById('btnScrollToAddNewAccount')?.addEventListener('click', () => {
    openAddNewAccountModal();
  });

  // Reset Form Button
  document.getElementById('btnResetSeqForm')?.addEventListener('click', () => {
    currentEditingAccountId = null;
    const labelInput = document.getElementById('seqAccountLabelInput');
    const appIdInput = document.getElementById('seqFbAppIdInput');
    const secretInput = document.getElementById('seqFbAppSecretInput');
    const titleEl = document.getElementById('seqFormSectionTitle');
    const resetBtn = document.getElementById('btnResetSeqForm');

    if (labelInput) labelInput.value = '';
    if (appIdInput) appIdInput.value = '';
    if (secretInput) { secretInput.value = ''; secretInput.placeholder = 'Chuỗi mã bí mật (e8fe1eea...)'; }
    if (titleEl) titleEl.textContent = 'BƯỚC 1: Cấu Hình App ID & Secret Cho Tài Khoản';
    if (resetBtn) resetBtn.style.display = 'none';
    updateStep2Visibility(false);
  });

  // Bỏ qua Bước 1 để mở khóa Bước 2 dán Token trực tiếp
  document.getElementById('btnForceUnlockStep2ForToken')?.addEventListener('click', (e) => {
    e.preventDefault();
    updateStep2Visibility(true);
    const tokenInput = document.getElementById('seqTokenInput');
    if (tokenInput) {
      tokenInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tokenInput.focus();
    }
    showToast('Đã mở Bước 2 để bạn dán mã Token Facebook!', 'info');
  });

  // Toggle Show/Hide App Secret Password Field
  document.getElementById('btnToggleAppSecretSeq')?.addEventListener('click', (e) => {
    e.preventDefault();
    const secretInput = document.getElementById('seqFbAppSecretInput');
    const toggleLink = document.getElementById('btnToggleAppSecretSeq');
    if (!secretInput || !toggleLink) return;

    if (secretInput.type === 'password') {
      secretInput.type = 'text';
      toggleLink.textContent = 'Ẩn mã';
    } else {
      secretInput.type = 'password';
      toggleLink.textContent = 'Hiện mã';
    }
  });

  // Quick Reuse App Selector
  document.getElementById('selectSavedAppReuse')?.addEventListener('change', (e) => {
    const selectedId = Number(e.target.value);
    if (!selectedId) return;
    const matched = savedTokenSourcesCache.find(s => s.id === selectedId);
    if (matched && matched.app_id) {
      const appIdInput = document.getElementById('seqFbAppIdInput');
      const secretInput = document.getElementById('seqFbAppSecretInput');
      if (appIdInput) appIdInput.value = matched.app_id;
      if (secretInput && matched.has_app_secret) {
        secretInput.value = '';
        secretInput.placeholder = '•••••••••••••••• (Dùng chung bí mật từ ' + matched.name + ')';
      }
      showToast(`Đã nạp thông tin App từ tài khoản "${matched.name}"`, 'info');
    }
  });

  // Copy Callback URI
  document.getElementById('btnCopySeqRedirectUri')?.addEventListener('click', () => {
    const uri = document.getElementById('seqRedirectUriText')?.textContent.trim();
    if (uri) {
      navigator.clipboard.writeText(uri);
      showToast('Đã sao chép Callback URI vào clipboard!', 'success');
    }
  });

  // Copy Site URL
  document.getElementById('btnCopySiteUrl')?.addEventListener('click', () => {
    const url = document.getElementById('siteUrlText')?.textContent.trim() || `${window.location.origin}/`;
    navigator.clipboard.writeText(url);
    showToast('Đã sao chép URL trang web vào clipboard!', 'success');
  });

  // Copy App Domain
  document.getElementById('btnCopyAppDomain')?.addEventListener('click', () => {
    const domain = document.getElementById('appDomainText')?.textContent.trim() || window.location.hostname;
    navigator.clipboard.writeText(domain);
    showToast('Đã sao chép Miền ứng dụng vào clipboard!', 'success');
  });

  // Toggle Step 1 Detailed Guide
  document.getElementById('btnToggleSeqGuide')?.addEventListener('click', () => {
    const container = document.getElementById('seqGuideContainer');
    const textSpan = document.getElementById('toggleSeqGuideText');
    if (!container) return;
    if (container.style.display === 'none') {
      container.style.display = 'block';
      if (textSpan) textSpan.textContent = 'Ẩn Hướng Dẫn';
    } else {
      container.style.display = 'none';
      if (textSpan) textSpan.textContent = 'Hiện Hướng Dẫn Chi Tiết';
    }
  });

  // Toggle App Secret Visibility
  document.getElementById('btnToggleAppSecretSeq')?.addEventListener('click', (e) => {
    e.preventDefault();
    const input = document.getElementById('seqFbAppSecretInput');
    const toggleBtn = document.getElementById('btnToggleAppSecretSeq');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (toggleBtn) toggleBtn.textContent = '🙈 Ẩn mã';
    } else {
      input.type = 'password';
      if (toggleBtn) toggleBtn.textContent = '👁️ Hiện mã';
    }
  });

  // Edit / Change App Config in Step 1
  document.getElementById('btnEditAppConfigSeq')?.addEventListener('click', () => {
    const appIdInput = document.getElementById('seqFbAppIdInput');
    const secretInput = document.getElementById('seqFbAppSecretInput');
    if (appIdInput) {
      appIdInput.focus();
      appIdInput.select();
      appIdInput.style.borderColor = '#3b82f6';
    }
    if (secretInput) {
      secretInput.style.borderColor = '#3b82f6';
      setTimeout(() => {
        if (appIdInput) appIdInput.style.borderColor = '';
        if (secretInput) secretInput.style.borderColor = '';
      }, 2500);
    }
    showToast('Bạn có thể nhập App ID và App Secret mới ở Bước 1 rồi bấm Lưu Cấu Hình!', 'info');
  });

  // Edit Gateway App from Main View 2 Table Footer
  document.getElementById('btnEditGatewayAppConfigMain')?.addEventListener('click', () => {
    openAddNewAccountModal();
    setTimeout(() => {
      const appIdInput = document.getElementById('seqFbAppIdInput');
      if (appIdInput) {
        appIdInput.focus();
        appIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        appIdInput.style.borderColor = '#3b82f6';
        setTimeout(() => { if (appIdInput) appIdInput.style.borderColor = ''; }, 2000);
      }
    }, 150);
  });

  // Save Facebook App ID & App Secret (Step 1 Save Button)
  document.getElementById('btnSaveSeqFbAppConfig')?.addEventListener('click', async () => {
    const appId = document.getElementById('seqFbAppIdInput')?.value.trim();
    const appSecret = document.getElementById('seqFbAppSecretInput')?.value.trim();
    const accountLabel = document.getElementById('seqAccountLabelInput')?.value.trim();

    if (!appId) {
      const appIdInput = document.getElementById('seqFbAppIdInput');
      if (appIdInput) {
        appIdInput.focus();
        appIdInput.style.borderColor = '#ef4444';
        setTimeout(() => { if (appIdInput) appIdInput.style.borderColor = ''; }, 2500);
      }
      showToast('Vui lòng nhập App ID (Mã ứng dụng Meta) trước khi bấm Lưu!', 'warning');
      return;
    }

    if (!appSecret) {
      const secretInput = document.getElementById('seqFbAppSecretInput');
      if (secretInput) {
        secretInput.focus();
        secretInput.style.borderColor = '#ef4444';
        setTimeout(() => { if (secretInput) secretInput.style.borderColor = ''; }, 2500);
      }
      showToast('Vui lòng nhập App Secret (Khóa bí mật) trước khi bấm Lưu!', 'warning');
      return;
    }

    const btn = document.getElementById('btnSaveSeqFbAppConfig');
    const msgEl = document.getElementById('seqAppSaveResultMsg');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang lưu...</span>';

    try {
      if (currentEditingAccountId) {
        const updateRes = await fetch(`/api/token-sources/${currentEditingAccountId}/update-app`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: accountLabel, app_id: appId, app_secret: appSecret })
        });
        const updateData = await updateRes.json();
        if (!updateData.ok) {
          throw new Error(updateData.error || 'Cập nhật tài khoản thất bại');
        }
      }

      // Save general app config for system
      const res = await fetch('/api/facebook-app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      });
      const data = await res.json();

      if (data.ok) {
        if (generalAppConfigCache) {
          generalAppConfigCache.appId = appId;
          generalAppConfigCache.hasAppSecret = true;
          generalAppConfigCache.appSecret = appSecret;
        }

        const badge = document.getElementById('fbAppConfigStatusBadge');
        if (badge) {
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#34d399';
          badge.textContent = `✅ Đã có App ID & Secret`;
        }

        const oauthBtnText = document.getElementById('btnSeqExecuteOAuthLoginText');
        if (oauthBtnText) {
          oauthBtnText.textContent = `Đăng Nhập Facebook Ngay (Cổng App: ${appId})`;
        }

        // UNLOCK STEP 2: Chỉ hiển thị Bước 2 sau khi nhập xong Bước 1
        updateStep2Visibility(true);
        const step2Card = document.getElementById('step2ConnectCard');
        if (step2Card) {
          step2Card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (msgEl) {
          const nowTime = new Date().toLocaleTimeString('vi-VN');
          msgEl.style.display = 'inline-block';
          msgEl.style.color = '#34d399';
          msgEl.textContent = `✓ Đã lưu & Mở khóa Bước 2 (${nowTime})`;
          setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 4000);
        }
        showToast('✅ Đã lưu cấu hình App! Bước 2: Kết Nối Tài Khoản Facebook đã được mở khóa.', 'success');
        loadTokenSources();
      } else {
        if (msgEl) {
          msgEl.style.display = 'inline-block';
          msgEl.style.color = '#f87171';
          msgEl.textContent = 'Lỗi: ' + (data.error || 'Thất bại');
        }
        showToast('Lỗi khi lưu cấu hình App: ' + data.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>💾</span> Lưu Cấu Hình App';
    }
  });

  // Execute Step 2A: OAuth 1-Click Login
  document.getElementById('btnSeqExecuteOAuthLogin')?.addEventListener('click', async () => {
    let appId = document.getElementById('seqFbAppIdInput')?.value.trim() || generalAppConfigCache?.appId;
    let appSecret = document.getElementById('seqFbAppSecretInput')?.value.trim() || generalAppConfigCache?.appSecret;
    const accountLabel = document.getElementById('seqAccountLabelInput')?.value.trim();

    if (!appId) {
      const appIdInput = document.getElementById('seqFbAppIdInput');
      if (appIdInput) {
        appIdInput.focus();
        appIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        appIdInput.style.borderColor = '#ef4444';
        setTimeout(() => { if (appIdInput) appIdInput.style.borderColor = ''; }, 3000);
      }
      showToast('Vui lòng nhập App ID ở Bước 1 (hoặc dùng Cách 2 bên dưới nếu chỉ có Token)!', 'warning');
      return;
    }

    if (!appSecret && !generalAppConfigCache?.hasAppSecret) {
      const secretInput = document.getElementById('seqFbAppSecretInput');
      if (secretInput) {
        secretInput.focus();
        secretInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        secretInput.style.borderColor = '#ef4444';
        setTimeout(() => { if (secretInput) secretInput.style.borderColor = ''; }, 3000);
      }
      showToast('Vui lòng nhập App Secret ở Bước 1 để hoàn tất đăng nhập!', 'warning');
      return;
    }

    const btn = document.getElementById('btnSeqExecuteOAuthLogin');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang chuẩn bị đăng nhập Facebook...</span>';

    try {
      // Auto-save App Config before opening popup
      if (appId && appSecret) {
        await fetch('/api/facebook-app-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret })
        });
        if (generalAppConfigCache) {
          generalAppConfigCache.appId = appId;
          generalAppConfigCache.hasAppSecret = true;
          generalAppConfigCache.appSecret = appSecret;
        }
      }

      closeModal('facebookLoginSequentialModal');

      const width = 650;
      const height = 750;
      const left = Math.max(0, Math.round((window.screen.width - width) / 2));
      const top = Math.max(0, Math.round((window.screen.height - height) / 2));

      let popupUrl = `/auth/facebook?popup=1&reauth=1&app_id=${encodeURIComponent(appId)}&app_secret=${encodeURIComponent(appSecret || '')}&account_name=${encodeURIComponent(accountLabel || '')}`;
      if (currentEditingAccountId) {
        popupUrl += `&account_id=${encodeURIComponent(currentEditingAccountId)}`;
      }

      const popup = window.open(
        popupUrl,
        'fb_oauth_popup',
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,resizable=yes`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        showToast('Trình duyệt đã chặn pop-up. Đang mở trang đăng nhập trực tiếp...', 'info');
        window.location.href = popupUrl.replace('popup=1&', '');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      const activeAppId = appId || generalAppConfigCache?.appId;
      btn.innerHTML = `<span>🔵</span> <span id="btnSeqExecuteOAuthLoginText">${activeAppId ? `Đăng Nhập Facebook Ngay (Cổng App: ${activeAppId})` : 'Đăng Nhập Facebook Ngay'}</span>`;
    }
  });

  // Execute Step 2B: Direct Token Scan & 1-Step Auto Connection
  document.getElementById('btnSeqExecuteTokenScan')?.addEventListener('click', async () => {
    const token = document.getElementById('seqTokenInput')?.value.trim();
    const appId = document.getElementById('seqFbAppIdInput')?.value.trim();
    const appSecret = document.getElementById('seqFbAppSecretInput')?.value.trim();
    const accountLabel = document.getElementById('seqAccountLabelInput')?.value.trim();

    if (!token) {
      showToast('Vui lòng dán mã Token Facebook để kết nối!', 'error');
      return;
    }

    const scanBtn = document.getElementById('btnSeqExecuteTokenScan');
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span>⏳ Đang kết nối & kích hoạt tự động...</span>';

    try {
      // If appId provided, save it as well
      if (appId) {
        await fetch('/api/facebook-app-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret })
        });
      }

      const res = await fetch('/api/pages/fetch-from-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          app_id: appId,
          app_secret: appSecret,
          account_label: accountLabel,
          auto_import: true
        })
      });
      const data = await res.json();

      if (!data.ok || !data.pages || data.pages.length === 0) {
        showToast('Không tìm thấy Fanpage nào: ' + (data.error || 'Token không hợp lệ hoặc thiếu quyền'), 'error');
        return;
      }

      const userDisplayName = data.userName || accountLabel || 'Tài khoản Facebook';
      const count = data.auto_imported_count || data.pages.length || 0;
      showToast(`🎉 Tự động kết nối thành công: "${userDisplayName}" (${count} Fanpage đã kích hoạt)!`, 'success');

      // Clear token input
      const tokenInput = document.getElementById('seqTokenInput');
      if (tokenInput) tokenInput.value = '';

      closeModal('facebookLoginSequentialModal');
      await loadTokenSources();
      await loadPages();
      loadConversations();

      if (data.token_source_id) {
        setTimeout(() => {
          openManageAccountPagesModal(Number(data.token_source_id));
        }, 400);
      }

    } catch (err) {
      showToast('Lỗi khi kết nối token: ' + err.message, 'error');
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span>⚡</span> Kết Nối Tự Động Từ Token';
    }
  });

  // Fallback & Diagnostic Feedback Engine for Facebook Login
  function showFacebookOAuthDiagnosticFallback({ status, error, diagnosis, accountName, pagesCount }) {
    const pane = document.getElementById('fbOAuthFallbackPane');
    if (!pane) return;

    if (status === 'error') {
      const diagTitle = diagnosis?.title || 'Đăng nhập Facebook không thành công';
      const diagHint = diagnosis?.hint || 'Quá trình xác thực gặp trở ngại từ Meta hoặc kết nối mạng. Hãy kiểm tra lại App ID & Secret hoặc sử dụng Cách B.';
      const rawError = error || 'Lỗi không xác định từ Facebook';

      pane.style.display = 'block';
      pane.style.background = 'rgba(239, 68, 68, 0.1)';
      pane.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      pane.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">❌</span>
            <strong style="color: #f87171; font-size: 13.5px;">${escapeHtml(diagTitle)}</strong>
          </div>
          <button type="button" class="btn btn-xs btn-secondary" onclick="document.getElementById('fbOAuthFallbackPane').style.display='none'" style="font-size: 11px; padding: 2px 6px;">✕ Đóng</button>
        </div>
        <div style="background: rgba(15, 23, 42, 0.6); border-left: 3px solid #f87171; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; font-size: 12px; color: #fca5a5; line-height: 1.5;">
          <strong>🔍 Điểm đúng / sai & Chẩn đoán:</strong>
          <div style="margin-top: 3px; color: #cbd5e1;">${escapeHtml(diagHint)}</div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 10px; word-break: break-all; font-family: monospace; background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 4px;">
          Chi tiết lỗi Meta: ${escapeHtml(rawError)}
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button type="button" id="btnFallbackToDirectToken" class="btn btn-sm btn-primary" style="gap: 6px; font-weight: 700; font-size: 12px;">
            <span>🔑</span> Dùng Phương Án Dự Phòng: Dán Token Trực Tiếp (Cách B)
          </button>
          <button type="button" id="btnFallbackEditAppConfig" class="btn btn-sm btn-secondary" style="gap: 6px; font-size: 12px;">
            <span>✏️</span> Sửa Lại App ID &amp; Secret ở Bước 1
          </button>
        </div>
      `;

      pane.querySelector('#btnFallbackToDirectToken')?.addEventListener('click', () => {
        switchToDirectTokenSection();
      });
      pane.querySelector('#btnFallbackEditAppConfig')?.addEventListener('click', () => {
        const appIdInput = document.getElementById('seqFbAppIdInput');
        if (appIdInput) {
          appIdInput.focus();
          appIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      // Ensure modal is open and scrolled to top so user sees the diagnostic feedback immediately
      openModal('facebookLoginSequentialModal');
      pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } else if (status === 'success') {
      const isZeroPages = Number(pagesCount) === 0;
      pane.style.display = 'block';
      pane.style.background = isZeroPages ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)';
      pane.style.borderColor = isZeroPages ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)';
      pane.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">${isZeroPages ? '⚠️' : '🎉'}</span>
            <div>
              <strong style="color: ${isZeroPages ? '#fbbf24' : '#34d399'}; font-size: 13.5px;">
                ${isZeroPages ? 'Đã Đăng Nhập Tài Khoản Nhưng Chưa Có Fanpage' : 'Đăng Nhập Facebook Thành Công!'}
              </strong>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                Tài khoản: <strong style="color: #60a5fa;">${escapeHtml(accountName || 'Facebook')}</strong>
                ${!isZeroPages ? ` &bull; Đã kết nối <strong style="color: #34d399;">${pagesCount} Fanpage</strong> vĩnh viễn.` : ''}
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-xs btn-secondary" onclick="document.getElementById('fbOAuthFallbackPane').style.display='none'" style="font-size: 11px; padding: 2px 6px;">✕ Đóng</button>
        </div>
        ${isZeroPages ? `
          <div style="background: rgba(15, 23, 42, 0.6); border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 4px; margin-top: 8px; font-size: 12px; color: #fde68a; line-height: 1.5;">
            <strong>🔍 Chẩn đoán:</strong> Nick Facebook này hiện không sở hữu hoặc không có quyền Quản trị viên trên Trang nào, hoặc bạn chưa tích chọn cấp quyền Trang trong hộp thoại Facebook.
            <div style="margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" id="btnZeroPagesTryAgain" class="btn btn-xs btn-secondary">🔵 Đăng Nhập Lại Bằng Nick Khác</button>
              <button type="button" id="btnZeroPagesUseToken" class="btn btn-xs btn-primary">🔑 Thử Cách B: Dán Token Trực Tiếp</button>
            </div>
          </div>
        ` : ''}
      `;

      if (isZeroPages) {
        pane.querySelector('#btnZeroPagesTryAgain')?.addEventListener('click', () => {
          document.getElementById('btnSeqExecuteOAuthLogin')?.click();
        });
        pane.querySelector('#btnZeroPagesUseToken')?.addEventListener('click', () => {
          switchToDirectTokenSection();
        });
        openModal('facebookLoginSequentialModal');
      }
    }
  }

  function switchToDirectTokenSection() {
    const tokenInput = document.getElementById('seqTokenInput');
    if (tokenInput) {
      tokenInput.focus();
      tokenInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tokenInput.style.borderColor = '#10b981';
      tokenInput.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.3)';
      setTimeout(() => {
        tokenInput.style.borderColor = '';
        tokenInput.style.boxShadow = '';
      }, 3000);
    }
  }

  // Listen for OAuth Success, Error or Popup Inter-Window Navigation
  window.addEventListener('message', async (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'FB_AUTH_SUCCESS') {
      showToast(`🎉 Đăng nhập thành công tài khoản Facebook "${event.data.accountName}"! Đã kết nối ${event.data.pagesCount} Fanpage.`, 'success');
      showFacebookOAuthDiagnosticFallback({
        status: 'success',
        accountName: event.data.accountName,
        pagesCount: event.data.pagesCount
      });
      closeModal('facebookLoginSequentialModal');
      await loadPages();
      await loadTokenSources();
      loadConversations();

      if (event.data.tokenSourceId) {
        setTimeout(() => {
          openManageAccountPagesModal(Number(event.data.tokenSourceId));
        }, 400);
      }
    } else if (event.data.type === 'FB_AUTH_ERROR') {
      showToast(`⚠️ Đăng nhập Facebook không thành công!`, 'error');
      showFacebookOAuthDiagnosticFallback({
        status: 'error',
        error: event.data.error,
        diagnosis: event.data.diagnosis
      });
    } else if (event.data.type === 'OPEN_DIRECT_TOKEN_MODAL') {
      openFacebookLoginSequentialModal();
      switchToDirectTokenSection();
    } else if (event.data.type === 'OPEN_FB_APP_CONFIG') {
      openFacebookLoginSequentialModal();
      document.getElementById('seqFbAppIdInput')?.focus();
    }
  });

  // Check URL query on initial load for direct redirect callback
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('fb_auth_success') === '1') {
    const accName = urlParams.get('account') || 'Facebook';
    const pagesCount = urlParams.get('pages') || '0';
    showToast(`🎉 Đăng nhập thành công tài khoản Facebook "${accName}"${pagesCount ? ` (${pagesCount} Fanpage)` : ''}!`, 'success');
    showFacebookOAuthDiagnosticFallback({
      status: 'success',
      accountName: accName,
      pagesCount: pagesCount
    });
    window.history.replaceState({}, document.title, window.location.pathname);
    loadPages();
    loadTokenSources().then(() => {
      if (savedTokenSourcesCache && savedTokenSourcesCache.length > 0) {
        setTimeout(() => {
          openManageAccountPagesModal(savedTokenSourcesCache[0].id);
        }, 500);
      }
    });
  } else if (urlParams.get('fb_error')) {
    const error = urlParams.get('fb_error');
    const diagTitle = urlParams.get('fb_diag_title') || '';
    const diagHint = urlParams.get('fb_diag_hint') || '';
    showToast(`⚠️ Lỗi Facebook: ${diagTitle || error}`, 'error');
    showFacebookOAuthDiagnosticFallback({
      status: 'error',
      error,
      diagnosis: { title: diagTitle, hint: diagHint }
    });
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
    const soundType = e.target.value;
    updateAlarmSoundPanes(soundType);
    const vol = parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10) / 100;
    if (soundType !== 'custom_file' && soundType !== 'youtube') {
      alarmAudioEngine.playSingleChime(vol, soundType);
    }
  });

  // Custom Audio File Upload Handlers
  const btnSelectCustomAudio = document.getElementById('btnSelectCustomAudio');
  const customAudioFileInput = document.getElementById('customAudioFileInput');
  if (btnSelectCustomAudio && customAudioFileInput) {
    btnSelectCustomAudio.addEventListener('click', () => {
      customAudioFileInput.click();
    });

    customAudioFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (file.size > 25 * 1024 * 1024) {
        showToast('File âm thanh quá lớn! Giới hạn tối đa 25MB.', 'error');
        return;
      }

      btnSelectCustomAudio.disabled = true;
      btnSelectCustomAudio.innerHTML = '<span>⏳</span> Đang tải lên...';
      const fileNameDisplay = document.getElementById('customAudioFileNameDisplay');
      if (fileNameDisplay) fileNameDisplay.textContent = 'Đang tải ' + file.name + '...';

      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = reader.result;
          try {
            const res = await fetch('/api/host-profile/upload-alarm-sound', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file_name: file.name,
                file_data: base64Data
              })
            });
            const data = await res.json();
            if (data.ok && data.sound_url) {
              const customUrlInput = document.getElementById('hostCustomSoundUrlInput');
              if (customUrlInput) customUrlInput.value = data.sound_url;
              if (fileNameDisplay) fileNameDisplay.textContent = '✓ ' + file.name;

              const preview = document.getElementById('customAudioPreviewPlayer');
              if (preview) {
                preview.src = data.sound_url;
                preview.style.display = 'block';
                preview.play().catch(() => {});
              }

              if (hostProfile) {
                hostProfile.custom_sound_url = data.sound_url;
                hostProfile.web_sound_type = 'custom_file';
              }
              showToast('Đã tải lên tệp âm thanh chuông báo thành công!', 'success');
            } else {
              showToast('Lỗi tải file: ' + (data.error || 'Thất bại'), 'error');
              if (fileNameDisplay) fileNameDisplay.textContent = 'Lỗi tải file';
            }
          } catch (netErr) {
            showToast('Lỗi mạng khi tải âm thanh: ' + netErr.message, 'error');
          } finally {
            btnSelectCustomAudio.disabled = false;
            btnSelectCustomAudio.innerHTML = '<span>📂</span> Chọn File Khác...';
          }
        };
        reader.onerror = () => {
          showToast('Lỗi khi đọc file', 'error');
          btnSelectCustomAudio.disabled = false;
          btnSelectCustomAudio.innerHTML = '<span>📂</span> Chọn File Âm Thanh...';
        };
        reader.readAsDataURL(file);
      } catch (readErr) {
        showToast('Lỗi: ' + readErr.message, 'error');
        btnSelectCustomAudio.disabled = false;
        btnSelectCustomAudio.innerHTML = '<span>📂</span> Chọn File Âm Thanh...';
      }
    });
  }

  // YouTube Alarm Link Input & Badge Detection
  const hostYoutubeUrlInput = document.getElementById('hostYoutubeUrlInput');
  const youtubeBadge = document.getElementById('youtubeVideoDetectedBadge');
  if (hostYoutubeUrlInput) {
    hostYoutubeUrlInput.addEventListener('input', () => {
      const url = hostYoutubeUrlInput.value.trim();
      const videoId = extractYouTubeVideoId(url);
      if (youtubeBadge) {
        youtubeBadge.style.display = videoId ? 'inline-block' : 'none';
      }
    });
  }

  // Test Web Audio Chime / Custom Audio / YouTube Button
  let isTestingAlarmSound = false;
  const testWebAudioBtn = document.getElementById('testWebAudioChimeBtn');
  testWebAudioBtn?.addEventListener('click', () => {
    const vol = parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10) / 100;
    const soundType = document.getElementById('hostWebSoundType')?.value || 'loud_chime';

    const soundNames = {
      loud_chime: '🔔 Chuông Đôi Ngân Vang Đanh To',
      phone_ring: '📱 Chuông Điện Thoại Réo Rắt',
      digital_alarm: '⏰ Đồng Hồ Điện Tử Bíp Dồn Dập',
      siren: '🚨 Còi Hú Khẩn Cấp Cứu Hỏa',
      custom_file: '📁 Tệp Âm Thanh Tùy Chỉnh',
      youtube: '📺 Video / Nhạc YouTube'
    };

    if (isTestingAlarmSound) {
      alarmAudioEngine.stopContinuousAlarm();
      isTestingAlarmSound = false;
      testWebAudioBtn.innerHTML = '<span>🔊</span> Thử Nghe Chuông Loa Ngay';
      testWebAudioBtn.classList.remove('btn-danger');
      testWebAudioBtn.classList.add('btn-secondary');
      showToast('Đã dừng phát thử âm thanh.', 'info');
      return;
    }

    if (soundType === 'custom_file') {
      const customUrl = document.getElementById('hostCustomSoundUrlInput')?.value;
      if (!customUrl) {
        showToast('Vui lòng tải lên tệp âm thanh trước khi thử nghe!', 'error');
        return;
      }
    } else if (soundType === 'youtube') {
      const ytUrl = document.getElementById('hostYoutubeUrlInput')?.value;
      const vid = extractYouTubeVideoId(ytUrl);
      if (!vid) {
        showToast('Vui lòng nhập đường link YouTube hợp lệ trước khi thử nghe!', 'error');
        return;
      }
    }

    alarmAudioEngine.playSingleChime(vol, soundType);
    showToast('🔊 Đang phát: ' + (soundNames[soundType] || soundType), 'info');

    if (soundType === 'youtube' || soundType === 'custom_file') {
      isTestingAlarmSound = true;
      testWebAudioBtn.innerHTML = '<span>⏹️</span> Dừng Nghe Thử';
      testWebAudioBtn.classList.remove('btn-secondary');
      testWebAudioBtn.classList.add('btn-danger');
    }
  });

  // Save Host Config Button
  document.getElementById('saveHostConfigBtn')?.addEventListener('click', async () => {
    const payload = {
      name: document.getElementById('hostProfileName')?.value.trim() || 'Chủ Host',
      pin_code: document.getElementById('hostProfilePin')?.value.trim() || '1234',
      web_sound_enabled: document.getElementById('hostWebSoundToggle')?.checked ? 'true' : 'false',
      web_sound_volume: parseInt(document.getElementById('hostWebSoundVolume')?.value || '100', 10),
      web_sound_type: document.getElementById('hostWebSoundType')?.value || 'loud_chime',
      custom_sound_url: document.getElementById('hostCustomSoundUrlInput')?.value || '',
      youtube_url: document.getElementById('hostYoutubeUrlInput')?.value?.trim() || '',
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

  // Silence Safety Alarm Button (Backward-compatible route to unified killswitch)
  document.getElementById('silenceSafetyAlarmBtn')?.addEventListener('click', () => {
    if (typeof window.triggerUnifiedAlarmDismiss === 'function') {
      window.triggerUnifiedAlarmDismiss();
    } else {
      alarmAudioEngine.hardStopAllAudio();
    }
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

  // Start Tunnel (usable from header and settings view)
  async function handleStartTunnel() {
    const headerBtn = document.getElementById('headerStartTunnelBtn');
    const viewBtn = document.getElementById('startTunnelBtn');

    if (headerBtn) {
      headerBtn.disabled = true;
      headerBtn.textContent = '⏳ Đang bật...';
    }
    if (viewBtn) {
      viewBtn.disabled = true;
      viewBtn.textContent = '⏳ Đang khởi tạo...';
    }

    showToast('Đang khởi tạo Cloudflare Tunnel công khai...', 'info');

    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.url) {
        showToast('Đã khởi tạo Cloudflare Tunnel thành công: ' + data.url, 'success');
        updateHeaderTunnelBadge(data.url);
        loadSystemSettings();
      } else {
        showToast('Lỗi khởi tạo tunnel: ' + (data.error || 'Không xác định'), 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.textContent = '⚡ Bật Tunnel';
      }
      if (viewBtn) {
        viewBtn.disabled = false;
        viewBtn.textContent = '⚡ Bật Cloudflare Tunnel';
      }
    }
  }

  // Stop Tunnel (usable from header and settings view)
  async function handleStopTunnel() {
    const headerBtn = document.getElementById('headerStopTunnelBtn');
    const viewBtn = document.getElementById('stopTunnelBtn');

    if (headerBtn) {
      headerBtn.disabled = true;
      headerBtn.textContent = '⏳...';
    }
    if (viewBtn) {
      viewBtn.disabled = true;
      viewBtn.textContent = '⏳ Đang dừng...';
    }

    try {
      const res = await fetch('/api/tunnel/stop', { method: 'POST' });
      const data = await res.json();
      showToast(data.message || 'Đã tắt Tunnel. Tool tiếp tục chạy ở chế độ Local.', 'info');
      updateHeaderTunnelBadge('');
      loadSystemSettings();
    } catch (err) {
      showToast('Lỗi khi dừng tunnel: ' + err.message, 'error');
    } finally {
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.textContent = '⏹️ Tắt Tunnel';
      }
      if (viewBtn) {
        viewBtn.disabled = false;
        viewBtn.textContent = '⏹️ Tắt Tunnel';
      }
    }
  }

  // Reconnect / Reset Tunnel (Get a brand new URL TryCloudflare)
  async function handleReconnectTunnel() {
    const mainBtn = document.getElementById('reconnectTunnelBtn');
    const headerBtn = document.getElementById('reconnectHeaderTunnelBtn');

    if (mainBtn) {
      mainBtn.disabled = true;
      mainBtn.textContent = '⏳ Đang đổi link...';
    }
    if (headerBtn) {
      headerBtn.disabled = true;
      headerBtn.textContent = '⏳ Đang đổi link...';
    }

    showToast('Đang tạo link Cloudflare Tunnel mới (thích ứng mạng/VPN)...', 'info');

    try {
      const res = await fetch('/api/tunnel/reset', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.url) {
        showToast('Đã cấp link mới thành công! Public URL: ' + data.url, 'success');
        updateHeaderTunnelBadge(data.url);
        loadSystemSettings();
      } else {
        showToast('Lỗi cấp link mới: ' + (data.error || 'Không xác định'), 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      if (mainBtn) {
        mainBtn.disabled = false;
        mainBtn.textContent = '🔄 Đổi Link Mới';
      }
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.textContent = '🔄 Đổi Link Mới';
      }
    }
  }

  document.getElementById('startTunnelBtn')?.addEventListener('click', handleStartTunnel);
  document.getElementById('headerStartTunnelBtn')?.addEventListener('click', handleStartTunnel);

  document.getElementById('stopTunnelBtn')?.addEventListener('click', handleStopTunnel);
  document.getElementById('headerStopTunnelBtn')?.addEventListener('click', handleStopTunnel);

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
    const title = document.getElementById('headerTunnelTitle');
    const urlText = document.getElementById('headerTunnelUrlText');
    const headerStartBtn = document.getElementById('headerStartTunnelBtn');
    const copyHeaderBtn = document.getElementById('copyHeaderWebhookBtn');
    const headerResetBtn = document.getElementById('reconnectHeaderTunnelBtn');
    const headerStopBtn = document.getElementById('headerStopTunnelBtn');

    const webhookInput = document.getElementById('publicWebhookUrlInput');
    const startBtn = document.getElementById('startTunnelBtn');
    const stopBtn = document.getElementById('stopTunnelBtn');
    const reconnectBtn = document.getElementById('reconnectTunnelBtn');
    const viewTitle = document.getElementById('viewTunnelStatusTitle');
    const viewSubtitle = document.getElementById('viewTunnelStatusSubtitle');
    const viewDot = document.getElementById('viewTunnelStatusDot');

    if (publicUrl && publicUrl.startsWith('http')) {
      // Header controls: Active state
      if (badge) {
        badge.style.display = 'flex';
        badge.classList.remove('inactive');
        badge.classList.add('active');
      }
      if (title) title.textContent = 'Cloudflare:';
      if (urlText) {
        urlText.textContent = publicUrl.replace(/^https?:\/\//, '');
        urlText.title = publicUrl;
        urlText.style.display = 'inline-block';
      }
      if (headerStartBtn) headerStartBtn.style.display = 'none';
      if (copyHeaderBtn) copyHeaderBtn.style.display = 'inline-flex';
      if (headerResetBtn) headerResetBtn.style.display = 'inline-flex';
      if (headerStopBtn) headerStopBtn.style.display = 'inline-flex';

      // View 6 controls: Active state
      if (webhookInput) webhookInput.value = `${publicUrl}/webhook`;
      if (startBtn) startBtn.style.display = 'none';
      if (reconnectBtn) reconnectBtn.style.display = 'inline-flex';
      if (stopBtn) stopBtn.style.display = 'inline-flex';
      if (viewTitle) viewTitle.textContent = 'Cloudflare Tunnel đang HOẠT ĐỘNG (Meta Webhook Trực Tiếp)';
      if (viewSubtitle) viewSubtitle.textContent = `URL: ${publicUrl} — Meta đẩy tin nhắn webhook tức thì với độ trễ 0s.`;
      if (viewDot) {
        viewDot.style.background = '#10b981';
        viewDot.style.boxShadow = '0 0 0 0 rgba(16, 185, 129, 0.7)';
        viewDot.style.animation = 'tunnelPulse 2s infinite cubic-bezier(0.66, 0, 0, 1)';
      }
    } else {
      // Header controls: Inactive (Local mode)
      if (badge) {
        badge.style.display = 'flex';
        badge.classList.remove('active');
        badge.classList.add('inactive');
      }
      if (title) title.textContent = 'Chế độ Local (Tunnel: Tắt)';
      if (urlText) {
        urlText.textContent = '';
        urlText.title = '';
        urlText.style.display = 'none';
      }
      if (headerStartBtn) headerStartBtn.style.display = 'inline-flex';
      if (copyHeaderBtn) copyHeaderBtn.style.display = 'none';
      if (headerResetBtn) headerResetBtn.style.display = 'none';
      if (headerStopBtn) headerStopBtn.style.display = 'none';

      // View 6 controls: Inactive state
      if (webhookInput) webhookInput.value = 'Chưa kích hoạt tunnel...';
      if (startBtn) startBtn.style.display = 'inline-flex';
      if (reconnectBtn) reconnectBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'none';
      if (viewTitle) viewTitle.textContent = 'Chế độ Local (Tunnel đang TẮT)';
      if (viewSubtitle) viewSubtitle.textContent = 'Hệ thống vẫn nhận tin nhắn khách hàng 100% tự động qua Fast Polling (2.5 giây) bằng Page Token trực tiếp từ Meta.';
      if (viewDot) {
        viewDot.style.background = '#64748b';
        viewDot.style.boxShadow = 'none';
        viewDot.style.animation = 'none';
      }
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

  // -------------------------------------------------------------
  // Event wiring for Fanpage Filter Bar & Account Pages Modal
  // -------------------------------------------------------------
  function initFanpageFiltersAndAccountModalEvents() {
    // 0. Top Workspace: Sync all accounts pages
    document.getElementById('btnSyncAllAccountsPages')?.addEventListener('click', () => {
      syncAllTokenSourcesPages();
    });

    // 1. Status filter buttons (Tất cả / Đang Quản Lý / Tạm Dừng)
    document.querySelectorAll('.page-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.page-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPageStatusFilter = btn.dataset.pageStatus || 'all';
        renderPagesGrid();
      });
    });

    // 2. Real-time Search input
    const searchInput = document.getElementById('pagesSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentPageSearchQuery = e.target.value || '';
        renderPagesGrid();
      });
    }

    // 3. Modal Manage Account Pages: Select All
    document.getElementById('btnSelectAllAccountPages')?.addEventListener('click', () => {
      const listEl = document.getElementById('accountPagesListModal');
      if (!listEl) return;
      listEl.querySelectorAll('.account-page-checkbox').forEach(chk => {
        chk.checked = true;
        const item = chk.closest('.account-page-item');
        const badge = item ? item.querySelector('.status-label') : null;
        item?.classList.add('active');
        if (badge) {
          badge.textContent = '🟢 Đang Quản Lý';
          badge.style.background = 'rgba(16, 185, 129, 0.2)';
          badge.style.color = '#34d399';
        }
      });
      const countTextEl = document.getElementById('selectedPagesCountText');
      const total = listEl.querySelectorAll('.account-page-checkbox').length;
      if (countTextEl) countTextEl.innerHTML = `Đang chọn quản lý: <strong style="color: #34d399;">${total}</strong> / ${total} Fanpage`;
    });

    // 4. Modal Manage Account Pages: Deselect All
    document.getElementById('btnDeselectAllAccountPages')?.addEventListener('click', () => {
      const listEl = document.getElementById('accountPagesListModal');
      if (!listEl) return;
      listEl.querySelectorAll('.account-page-checkbox').forEach(chk => {
        chk.checked = false;
        const item = chk.closest('.account-page-item');
        const badge = item ? item.querySelector('.status-label') : null;
        item?.classList.remove('active');
        if (badge) {
          badge.textContent = '⚪ Tạm Dừng';
          badge.style.background = 'rgba(100, 116, 139, 0.2)';
          badge.style.color = '#94a3b8';
        }
      });
      const countTextEl = document.getElementById('selectedPagesCountText');
      const total = listEl.querySelectorAll('.account-page-checkbox').length;
      if (countTextEl) countTextEl.innerHTML = `Đang chọn quản lý: <strong style="color: #34d399;">0</strong> / ${total} Fanpage`;
    });

    // 5. Modal Manage Account Pages: Save Selection
    document.getElementById('btnSaveAccountPagesSelection')?.addEventListener('click', async () => {
      if (!activeManagingTokenSourceId) return;
      const listEl = document.getElementById('accountPagesListModal');
      if (!listEl) return;

      const activePageIds = [];
      listEl.querySelectorAll('.account-page-checkbox:checked').forEach(chk => {
        activePageIds.push(chk.dataset.pageId);
      });

      const saveBtn = document.getElementById('btnSaveAccountPagesSelection');
      try {
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = '⏳ Đang lưu...';
        }

        const res = await fetch(`/api/token-sources/${activeManagingTokenSourceId}/manage-pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_page_ids: activePageIds })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(data.message || `Đã cập nhật: ${activePageIds.length} Fanpage được quản lý!`, 'success');
          closeModal('manageAccountPagesModal');
          await loadTokenSources();
          await loadPages();
        } else {
          showToast('Lỗi: ' + (data.error || 'Không thể lưu lựa chọn'), 'error');
        }
      } catch (err) {
        showToast('Lỗi kết nối khi lưu: ' + err.message, 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Lưu Lựa Chọn Này';
        }
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
  initFanpageFiltersAndAccountModalEvents();
  loadStatus();
  setInterval(loadStatus, 15000);
});
