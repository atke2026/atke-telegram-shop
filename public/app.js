/**
 * ====================================================================
 * ATKE DIGITAL STORE - TELEGRAM MINI APP FRONTEND ENGINE
 * Integrates: Telegram WebApp SDK, Dynamic Catalog, Local Payment Reconciler
 * Target: Plesk Shared Hosting (shop.atke.com.et)
 * ====================================================================
 */

// Determine API base URL (handles root or subdirectory deployment)
const API_BASE_URL = window.location.pathname.includes('/public_html/') 
  ? '../api.php' 
  : 'api.php';

// Application State with pre-cached catalog for zero-latency initial paint
const INITIAL_PRODUCTS = [
  {
    id: 'canva-admin-3y',
    name: 'Canva Admin Panel (3 Years)',
    category: 'Education & Design',
    description: 'Get full access to Canva Education with Advanced verified Admin tools. Access to Canva Pro features, 3-Year account.',
    instructions: 'Account format: CANVA & Outlook EMAIL:PASS | 2FA EMAIL:PASS | 2FA website.',
    selling_price: '3200.00',
    currency: 'ETB',
    stock: 10,
    badge: 'Popular',
    warranty: '2-Month Warranty'
  },
  {
    id: 'coursera-plus-1y',
    name: 'Coursera Premium (1 Year)',
    category: 'Education & Design',
    description: 'Org+ Premium Access. All courses and professional certificates issued in your own name. Ready-made account with mail access.',
    instructions: 'Instructions: Log in using provided details. Change name and password after first login. Duration: 12 Months.',
    selling_price: '850.00',
    currency: 'ETB',
    stock: 50,
    badge: 'Instant Delivery',
    warranty: '1-Month Warranty'
  },
  {
    id: 'elevenlabs-creator-1y',
    name: 'ElevenLabs Creator (1 Year)',
    category: 'AI Tools',
    description: 'Official Coupon Code for 12 months Creator plan with monthly voice generation quota. Activated directly on your account.',
    instructions: 'Instructions: 1. Sign up at elevenlabs.io. 2. Upgrade to Creator plan with Monthly billing. 3. Enter promo code at checkout.',
    selling_price: '7500.00',
    currency: 'ETB',
    stock: 15,
    badge: 'High Demand',
    warranty: 'Activation Guarantee'
  },
  {
    id: 'gamma-pro-1y',
    name: 'Gamma Pro (1 Year)',
    category: 'AI Tools',
    description: 'Create stunning presentations, docs, and web pages with AI. Official 12-month coupon code redeemable on your own account.',
    instructions: 'Instructions: Log in at gamma.app, select Gamma Pro Yearly, enter promo code at checkout.',
    selling_price: '4600.00',
    currency: 'ETB',
    stock: 25,
    badge: 'Best Seller',
    warranty: 'Activation Guarantee'
  },
  {
    id: 'factory-pro-1y',
    name: 'Factory Pro AI (1 Year)',
    category: 'AI Tools',
    description: 'Autonomous AI software development platform. Official 12-month voucher code redeemable on your account.',
    instructions: 'Instructions: Create account at app.factory.ai. Visit app.factory.ai/voucher and enter your voucher code.',
    selling_price: '2400.00',
    currency: 'ETB',
    stock: 12,
    badge: 'Developer Choice',
    warranty: 'Activation Guarantee'
  },
  {
    id: 'linkedin-business-2m',
    name: 'LinkedIn Business (2 Months)',
    category: 'Business & Career',
    description: 'Premium Business upgrade. 15 InMails/month, see who viewed your profile, Unlimited People Browsing, and business insights.',
    instructions: 'Works on accounts that have not had active premium in last 12 months. Open redeem link in browser and click Activate.',
    selling_price: '650.00',
    currency: 'ETB',
    stock: 30,
    badge: 'Special Offer',
    warranty: 'Activation Guarantee'
  },
  {
    id: 'lovable-lite-1y',
    name: 'Lovable Lite (1 Year)',
    category: 'AI Tools',
    description: 'Build full-stack apps and tools with AI. 12-month full Lite access with 150 monthly credits and custom domain support.',
    instructions: 'Instructions: Redeem link must be applied within 72 hours of receiving order.',
    selling_price: '950.00',
    currency: 'ETB',
    stock: 20,
    badge: 'Hot',
    warranty: '1-Month Warranty'
  },
  {
    id: 'm365-family-1y',
    name: 'Microsoft 365 Family (1 Year)',
    category: 'Software & Productivity',
    description: 'Direct yearly billed plan. Word, Excel, PowerPoint, Outlook, plus 1TB OneDrive cloud storage. Readymade account with mail access.',
    instructions: 'Login with credentials provided. Password can be changed immediately.',
    selling_price: '1450.00',
    currency: 'ETB',
    stock: 18,
    badge: 'Productivity',
    warranty: 'Full Term Access'
  }
];

const state = {
  products: [...INITIAL_PRODUCTS],
  filteredProducts: [...INITIAL_PRODUCTS],
  activeCategory: 'ALL',
  searchQuery: '',
  selectedProduct: null,
  selectedChannel: 'CBE',
  selectedTopupChannel: 'CBE',
  checkoutReceiptBase64: null,
  topupReceiptBase64: null,
  activeTab: 'viewHome',
  userWalletBalance: 0.00,
  webAppUser: null,
  isAdmin: false,
  adminSettings: {},
  channelUsername: '@AtkeStore',
  selectedChimeTone: 'crystal',
  audioEnabled: true,
  walletTransactions: [],
  paymentChannels: {
    CBE: {
      id: 'CBE',
      name: 'Commercial Bank of Ethiopia',
      accountNumber: '1000233801837',
      accountHolder: 'Mohammed Abdirahman Ibrahim',
      instructions: 'Transfer using CBE Birr or Commercial Bank Mobile App. Copy the 10-14 digit FT transaction reference number from your SMS.'
    },
    EBIRR: {
      id: 'EBIRR',
      name: 'Telebirr / E-Birr',
      accountNumber: '0906818924',
      accountHolder: 'Mohammed Abdirahman Ibrahim',
      instructions: 'Send payment via Telebirr or E-Birr transfer. Enter the unique Transaction ID found on your payment confirmation SMS.'
    },
    KAAFI: {
      id: 'KAAFI',
      name: 'Kaafi Payment',
      accountNumber: '0906818924',
      accountHolder: 'Mohammed Abdirahman Ibrahim',
      instructions: 'Transfer via Kaafi mobile app or agent. Enter the transaction reference code provided upon successful transfer.'
    }
  },
  activeOrderUuid: null,
  pollIntervalId: null,
  tgUser: null
};

// Telegram WebApp Object Reference
const tg = window.Telegram?.WebApp || null;

// HTML5 Web Audio Synthesizer (0 external network requests, zero latency)
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioCtx = new AudioCtx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playAudioChime(toneName = state.selectedChimeTone) {
  if (!state.audioEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (toneName === 'crystal') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(1046.50, now);
      osc2.frequency.setValueAtTime(1318.51, now + 0.04);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.04);
      osc1.stop(now + 0.75);
      osc2.stop(now + 0.75);

    } else if (toneName === 'pulse') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);

    } else if (toneName === 'bell') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);

    } else if (toneName === 'pop') {
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + (idx * 0.05);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.25);
      });
    }
  } catch (e) {
    console.warn("Audio chime playback blocked or not supported:", e);
  }
}

/**
 * --------------------------------------------------------------------
 * Initialize Application & Telegram WebApp SDK
 * --------------------------------------------------------------------
 */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTelegram();
  bindEvents();
  initWalletTab();
  initWebAppSync();
  renderProducts(state.products); // Instant 0ms render from pre-cached catalog
  loadCatalog();                  // Background sync with live server/Ethio-Viral
  loadPaymentChannels();
  checkStoredActiveOrder();
  checkAdminStatus();
  checkDeepLinkParam();
  loadSavedSettings();
  loadUserProfile();
  loadWalletBalance();
});

/**
 * --------------------------------------------------------------------
 * Theme Management (Dark / Light Mode)
 * --------------------------------------------------------------------
 */
function initTheme() {
  const savedTheme = localStorage.getItem('atke_theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const isLight = savedTheme ? savedTheme === 'light' : prefersLight;
  applyTheme(isLight ? 'light' : 'dark');
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  if (isLight) {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
  const toggleIcon = document.getElementById('themeToggleIcon');
  if (toggleIcon) toggleIcon.textContent = isLight ? '🌙' : '☀️';
  const switchEl = document.getElementById('switchThemeMode');
  if (switchEl) switchEl.checked = isLight;
  const switchIcon = document.getElementById('themeSwitchIcon');
  if (switchIcon) switchIcon.textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('atke_theme', isLight ? 'light' : 'dark');

  if (tg?.setHeaderColor) {
    try {
      tg.setHeaderColor(isLight ? 'bg_color' : 'secondary_bg_color');
    } catch (e) {}
  }
}

function toggleTheme() {
  const isCurrentlyLight = document.body.classList.contains('light-theme');
  applyTheme(isCurrentlyLight ? 'dark' : 'light');
  triggerHaptic('selection');
  showToast(isCurrentlyLight ? '🌙 Switched to Dark Mode' : '☀️ Switched to Light Mode');
}

function initTelegram() {
  const banner = document.getElementById('connectionStatusBanner');
  const bannerText = document.getElementById('connectionStatusText');
  const spinner = document.getElementById('connectionStatusSpinner');

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      
      // Configure Theme Colors
      if (tg.setHeaderColor) {
        tg.setHeaderColor('secondary_bg_color');
      }

      // Extract User Information
      if (tg.initDataUnsafe?.user) {
        state.tgUser = tg.initDataUnsafe.user;
        updateUserProfileUI(state.tgUser);
        console.log("Logged in Telegram User:", state.tgUser.id, state.tgUser.first_name);
      }

      // Telegram BackButton management
      if (tg.BackButton) {
        tg.BackButton.onClick(() => {
          closeAllModals();
        });
      }
    } catch (e) {
      console.warn("Telegram WebApp initialization error:", e);
    }
  }

  // Exact Competitor Status Transition (Screenshot 1 -> Screenshot 2)
  setTimeout(() => {
    if (banner && bannerText) {
      if (spinner) spinner.style.display = 'none';
      banner.classList.remove('connecting');
      banner.classList.add('connected');
      bannerText.textContent = "This Telegram wallet is already connected. Your balance and history are up to date.";

      // Allow tap to dismiss or auto-collapse after 7s
      banner.addEventListener('click', () => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-10px)';
        setTimeout(() => { banner.style.display = 'none'; }, 300);
      });
      setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-10px)';
        setTimeout(() => { banner.style.display = 'none'; }, 400);
      }, 7000);
    }
  }, 950);
}

function updateUserProfileUI(user) {
  if (!user) return;
  const nameEl = document.getElementById('dispUserName');
  const idEl = document.getElementById('dispUserTelegramId');
  const avatarEl = document.getElementById('dispUserAvatar');

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User';
  if (nameEl) nameEl.textContent = fullName;
  if (idEl) idEl.textContent = `Telegram ID: ${user.id} (@${user.username || 'n/a'})`;
  if (avatarEl) {
    const f = user.first_name ? user.first_name[0] : 'U';
    const l = user.last_name ? user.last_name[0] : '';
    avatarEl.textContent = (f + l).toUpperCase() || 'TG';
  }
}

/**
 * --------------------------------------------------------------------
 * Event Listeners & Binding
 * --------------------------------------------------------------------
 */
function bindEvents() {
  // Search Bar
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }
  document.getElementById('btnSearchGo')?.addEventListener('click', () => {
    applyFilters();
  });

  // Category Tabs
  const categoryContainer = document.getElementById('categoryTabs');
  if (categoryContainer) {
    categoryContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-pill');
      if (!btn) return;

      document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.activeCategory = btn.dataset.category || 'ALL';
      applyFilters();
      triggerHaptic('selection');
    });
  }

  // Theme Mode Controls
  document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('switchThemeMode')?.addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'light' : 'dark');
  });
  document.getElementById('headerUserAvatar')?.addEventListener('click', () => {
    switchTab('viewProfile');
  });

  // Header Shortcuts
  document.getElementById('btnOpenOrders')?.addEventListener('click', () => {
    switchTab('viewActivity');
  });
  document.getElementById('btnAdminHub')?.addEventListener('click', () => {
    switchTab('viewAdmin');
  });
  document.getElementById('btnProfileAdminHub')?.addEventListener('click', () => {
    switchTab('viewAdmin');
  });

  // Admin Hub Specific Refresh & Modal Launchers
  document.getElementById('btnRefreshAdminOrders')?.addEventListener('click', loadAdminPendingData);
  document.getElementById('btnRefreshAdminTopups')?.addEventListener('click', loadAdminPendingData);
  document.getElementById('btnOpenPricingModal')?.addEventListener('click', openAdminModal);

  // Close Modals
  document.getElementById('btnCloseCheckout')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseStatus')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseOrders')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseAdmin')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseTopup')?.addEventListener('click', closeAllModals);

  // Bottom Navigation Bar Switcher (4 Tabs: Home, Wallet, Activity, Profile)
  document.querySelectorAll('.bottom-nav-bar .nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = btn.dataset.tab;
      if (targetTab) {
        switchTab(targetTab);
      }
    });
  });

  // Audio Test Sound Button
  document.getElementById('btnTestSound')?.addEventListener('click', () => {
    playAudioChime();
    triggerHaptic('medium');
    showToast(`🔊 Playing ${state.selectedChimeTone.toUpperCase()} Chime`);
  });

  // Chime Tone Selection Cards
  const chimeGrid = document.getElementById('chimeTonesGrid');
  if (chimeGrid) {
    chimeGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.chime-tone-card');
      if (!card) return;

      document.querySelectorAll('.chime-tone-card').forEach(c => {
        c.classList.remove('active');
        const check = c.querySelector('.check-mark');
        if (check) check.textContent = '';
      });

      card.classList.add('active');
      const check = card.querySelector('.check-mark');
      if (check) check.textContent = '✓';

      const tone = card.dataset.tone || 'crystal';
      state.selectedChimeTone = tone;
      localStorage.setItem('atke_chime_tone', tone);
      playAudioChime(tone);
      triggerHaptic('selection');
    });
  }

  // Audio & Notification Switches
  document.getElementById('switchAudio')?.addEventListener('change', (e) => {
    state.audioEnabled = e.target.checked;
    localStorage.setItem('atke_audio_enabled', e.target.checked ? '1' : '0');
  });

  // Wallet Add Funds & Top-up Quick Chips
  document.getElementById('btnOpenTopUp')?.addEventListener('click', () => {
    openTopupModal(100);
  });
  document.querySelectorAll('.quick-chips-grid .quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const amt = parseInt(chip.dataset.amount || '100', 10);
      openTopupModal(amt);
    });
  });

  // Top-up Modal Amount Chips
  document.querySelectorAll('.modal-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.modal-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const amt = chip.dataset.topup;
      const customInput = document.getElementById('customTopupAmount');
      if (customInput) customInput.value = amt;
    });
  });

  // Top-up Channel Selector
  const topupChannels = document.getElementById('topupChannelSelector');
  if (topupChannels) {
    topupChannels.addEventListener('click', (e) => {
      const card = e.target.closest('.channel-card');
      if (!card) return;
      document.querySelectorAll('#topupChannelSelector .channel-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const ch = card.dataset.topupChannel || 'CBE';
      state.selectedTopupChannel = ch;
      updateTopupAccountDisplay(ch);
    });
  }

  // Submit Top-up Verification
  document.getElementById('btnSubmitTopup')?.addEventListener('click', submitTopupRequest);

  // Transactions Filter Pills
  document.getElementById('txFilterPills')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.tx-pill');
    if (!pill) return;
    document.querySelectorAll('.tx-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderWalletLedger(pill.dataset.filter);
  });

  // Admin Quick Settings Buttons
  document.getElementById('btnSaveRate')?.addEventListener('click', async () => {
    const rateVal = parseFloat(document.getElementById('adminUsdRate')?.value || '140');
    try {
      const initData = tg?.initData || '';
      const userId = state.tgUser?.id || '7608745515';
      const res = await fetch(`${API_BASE_URL}?action=admin_update_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData, admin_id: userId, usd_to_etb_rate: rateVal })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Exchange rate saved: ' + rateVal + ' ETB');
        triggerHaptic('success');
      }
    } catch (e) { showToast('⚠️ Failed to save rate'); }
  });

  document.getElementById('btnSaveSupport')?.addEventListener('click', async () => {
    const supVal = document.getElementById('adminSupportContact')?.value.trim();
    try {
      const initData = tg?.initData || '';
      const userId = state.tgUser?.id || '7608745515';
      const res = await fetch(`${API_BASE_URL}?action=admin_update_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: initData, admin_id: userId, support_contact: supVal })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Support handle saved: ' + supVal);
        triggerHaptic('success');
      }
    } catch (e) { showToast('⚠️ Failed to save handle'); }
  });

  // Close when clicking modal backdrop
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAllModals();
      }
    });
  });

  // Payment Channel Switcher
  const channelSelector = document.getElementById('channelSelector');
  if (channelSelector) {
    channelSelector.addEventListener('click', (e) => {
      const card = e.target.closest('.channel-card');
      if (!card) return;

      const channelKey = card.dataset.channel;
      selectPaymentChannel(channelKey);
    });
  }

  // Copy Account Number Button
  document.getElementById('btnCopyAccount')?.addEventListener('click', () => {
    const accNum = document.getElementById('dispAccountNumber').textContent.trim();
    copyToClipboard(accNum, 'Account number copied to clipboard! 📋');
  });

  // Copy Delivery Code Button
  document.getElementById('btnCopyDeliveryCode')?.addEventListener('click', () => {
    const code = document.getElementById('deliveryCodeDisplay').textContent.trim();
    copyToClipboard(code, 'Delivery code / credentials copied! 🔑');
  });

  // Setup Screenshot Dropzones (Checkout & Top-up)
  setupImageDropzone(
    'checkoutUploadDropzone',
    'receiptFileInput',
    'uploadPrompt',
    'uploadPreviewBox',
    'receiptPreviewImg',
    'btnRemoveReceipt',
    'checkoutReceiptBase64'
  );

  setupImageDropzone(
    'topupUploadDropzone',
    'topupReceiptFileInput',
    'topupUploadPrompt',
    'topupUploadPreviewBox',
    'topupReceiptPreviewImg',
    'btnRemoveTopupReceipt',
    'topupReceiptBase64'
  );

  // Submit Order Button
  document.getElementById('btnSubmitOrder')?.addEventListener('click', submitOrder);
}

/**
 * --------------------------------------------------------------------
 * Image Dropzone & Client-side Compression Engine
 * --------------------------------------------------------------------
 */
function setupImageDropzone(dropzoneId, fileInputId, promptId, previewBoxId, previewImgId, removeBtnId, stateKey) {
  const dropzone = document.getElementById(dropzoneId);
  const fileInput = document.getElementById(fileInputId);
  const prompt = document.getElementById(promptId);
  const previewBox = document.getElementById(previewBoxId);
  const previewImg = document.getElementById(previewImgId);
  const removeBtn = document.getElementById(removeBtnId);

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', (e) => {
    if (e.target === removeBtn || (removeBtn && removeBtn.contains(e.target))) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleSelectedImage(file, prompt, previewBox, previewImg, stateKey);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleSelectedImage(file, prompt, previewBox, previewImg, stateKey);
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state[stateKey] = null;
    fileInput.value = '';
    previewImg.src = '';
    previewBox.classList.add('hidden');
    prompt.classList.remove('hidden');
    triggerHaptic('light');
  });
}

function handleSelectedImage(file, promptEl, previewBoxEl, previewImgEl, stateKey) {
  if (file.size > 8 * 1024 * 1024) {
    showToast('⚠️ Image is larger than 8MB. Please select a smaller screenshot.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawDataUrl = e.target.result;
    compressImage(rawDataUrl, 1200, 0.82, (compressedDataUrl) => {
      state[stateKey] = compressedDataUrl;
      previewImgEl.src = compressedDataUrl;
      promptEl.classList.add('hidden');
      previewBoxEl.classList.remove('hidden');
      showToast('📸 Screenshot attached successfully!');
      triggerHaptic('success');
    });
  };
  reader.readAsDataURL(file);
}

function compressImage(dataUrl, maxDim, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let width = img.width;
    let height = img.height;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}


/**
 * --------------------------------------------------------------------
 * Tab Switcher (Home, Wallet, Activity, Profile)
 * --------------------------------------------------------------------
 */
function switchTab(targetViewId) {
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.add('hidden');
    view.classList.remove('active');
  });

  const targetView = document.getElementById(targetViewId);
  if (targetView) {
    targetView.classList.remove('hidden');
    targetView.classList.add('active');
  }

  document.querySelectorAll('.bottom-nav-bar .nav-item').forEach(btn => {
    if (btn.dataset.tab === targetViewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  state.activeTab = targetViewId;
  closeAllModals();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  triggerHaptic('selection');

  if (targetViewId === 'viewActivity') {
    renderActivityOrders();
  } else if (targetViewId === 'viewWallet') {
    renderWalletLedger('all');
    loadWalletBalance();
  } else if (targetViewId === 'viewProfile') {
    loadUserProfile();
  } else if (targetViewId === 'viewAdmin') {
    loadAdminPendingData();
  }
}

/**
 * --------------------------------------------------------------------
 * Wallet Tab Setup (Payment Chips & Copying)
 * --------------------------------------------------------------------
 */
function initWalletTab() {
  const accountSelector = document.getElementById('walletAccountSelector');
  if (accountSelector) {
    accountSelector.addEventListener('click', (e) => {
      const chip = e.target.closest('.payment-chip');
      if (!chip) return;
      document.querySelectorAll('#walletAccountSelector .payment-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const accountType = chip.dataset.walletAccount || 'CBE';
      updateWalletAccountCard(accountType);
      triggerHaptic('selection');
    });
  }

  document.getElementById('btnCopyWalletAccount')?.addEventListener('click', () => {
    const accNum = document.getElementById('walletDispAccountNumber')?.textContent.trim();
    if (accNum) copyToClipboard(accNum, 'Account number copied! 📋');
  });

  document.getElementById('btnWalletSignIn')?.addEventListener('click', () => {
    switchTab('viewProfile');
  });
}

function updateWalletAccountCard(channelKey) {
  const ch = state.paymentChannels[channelKey] || state.paymentChannels['CBE'];
  const nameEl = document.getElementById('walletSelectedChannel');
  const numEl = document.getElementById('walletDispAccountNumber');
  const holderEl = document.getElementById('walletDispAccountHolder');
  if (nameEl) nameEl.textContent = ch.name;
  if (numEl) numEl.textContent = ch.accountNumber;
  if (holderEl) holderEl.textContent = ch.accountHolder;
}

function loadSavedSettings() {
  const savedTone = localStorage.getItem('atke_chime_tone');
  if (savedTone) {
    state.selectedChimeTone = savedTone;
    document.querySelectorAll('.chime-tone-card').forEach(c => {
      const isActive = c.dataset.tone === savedTone;
      c.classList.toggle('active', isActive);
      const check = c.querySelector('.check-mark');
      if (check) check.textContent = isActive ? '✓' : '';
    });
  }

  const audioPref = localStorage.getItem('atke_audio_enabled');
  if (audioPref !== null) {
    state.audioEnabled = audioPref === '1';
    const audioSwitch = document.getElementById('switchAudio');
    if (audioSwitch) audioSwitch.checked = state.audioEnabled;
  }
}

function openTopupModal(amount = 100) {
  const modal = document.getElementById('topupModal');
  const customInput = document.getElementById('customTopupAmount');
  if (customInput) customInput.value = amount;

  // Reset topup screenshot & notes
  state.topupReceiptBase64 = null;
  const fileInput = document.getElementById('topupReceiptFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('topupUploadPrompt')?.classList.remove('hidden');
  document.getElementById('topupUploadPreviewBox')?.classList.add('hidden');
  const previewImg = document.getElementById('topupReceiptPreviewImg');
  if (previewImg) previewImg.src = '';
  const notesInput = document.getElementById('topupNotesInput');
  if (notesInput) notesInput.value = '';

  if (modal) modal.classList.add('active');
  updateTopupAccountDisplay(state.selectedTopupChannel || 'CBE');
}

function updateTopupAccountDisplay(channelKey) {
  const ch = state.paymentChannels[channelKey] || state.paymentChannels['CBE'];
  const nameEl = document.getElementById('topupDispChannel');
  const numEl = document.getElementById('topupDispNumber');
  if (nameEl) nameEl.textContent = ch.name;
  if (numEl) numEl.textContent = ch.accountNumber;
}

async function submitTopupRequest() {
  const amt = parseFloat(document.getElementById('customTopupAmount')?.value || '0');
  const txInput = document.getElementById('topupTxReference');
  let ref = txInput ? txInput.value.trim().toUpperCase() : '';
  const hasReceipt = !!state.topupReceiptBase64;
  const note = document.getElementById('topupNotesInput')?.value.trim() || '';

  if (amt <= 0 || isNaN(amt)) {
    showToast('⚠️ Please enter a valid top-up amount (min. 50 ETB)');
    return;
  }

  // Strict EITHER / OR Rule
  if (!ref && !hasReceipt) {
    showToast('⚠️ Provide EITHER your FT reference number OR attach a deposit screenshot.');
    if (txInput) txInput.focus();
    triggerHaptic('error');
    return;
  }

  if (!ref && hasReceipt) {
    ref = 'REC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const btn = document.getElementById('btnSubmitTopup');
  if (btn) btn.disabled = true;
  showToast('⏳ Submitting deposit verification...');
  playAudioChime();
  triggerHaptic('medium');

  const currentUserId = state.tgUser?.id || (state.webAppUser ? state.webAppUser.id : 12345678);
  const currentUsername = state.tgUser?.username || (state.webAppUser ? state.webAppUser.username : 'user');
  const currentFirstName = state.tgUser?.first_name || (state.webAppUser ? state.webAppUser.name : 'Customer');

  try {
    const res = await fetch(`${API_BASE_URL}?action=wallet_topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || ''
      },
      body: JSON.stringify({
        init_data: tg?.initData || '',
        fallback_telegram_id: currentUserId,
        fallback_username: currentUsername,
        fallback_first_name: currentFirstName,
        amount: amt,
        payment_channel: state.selectedTopupChannel || 'CBE',
        transaction_reference: ref,
        receipt_image: state.topupReceiptBase64 || null,
        notes: note
      })
    });

    const data = await res.json();

    if (data.success) {
      closeAllModals();
      showToast(`✅ ${data.message || 'Deposit submitted! Awaiting admin review.'}`);
      playAudioChime('crystal');
      triggerHaptic('success');

      // Record transaction in local state
      const newTx = {
        id: data.topup_id || Date.now(),
        type: 'deposit',
        amount: amt,
        channel: state.selectedTopupChannel || 'CBE',
        reference: ref,
        status: 'pending',
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      state.walletTransactions.unshift(newTx);
      localStorage.setItem('atke_wallet_txs', JSON.stringify(state.walletTransactions));
      renderWalletLedger('all');
    } else {
      showToast(`❌ ${data.error || 'Failed to submit deposit'}`);
      triggerHaptic('error');
    }
  } catch (err) {
    console.error("Top-up submission error:", err);
    showToast('⚠️ Network error submitting deposit verification.');
    triggerHaptic('error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderWalletLedger(filter = 'all') {
  const container = document.getElementById('walletTransactionsList');
  const countEl = document.getElementById('dispTxCount');
  const balanceEl = document.getElementById('dispWalletBalance');
  if (!container) return;

  if (balanceEl) balanceEl.textContent = state.userWalletBalance.toFixed(2);

  // Load from local storage if available
  try {
    const raw = localStorage.getItem('atke_wallet_txs');
    if (raw) state.walletTransactions = JSON.parse(raw);
  } catch (e) {}

  let txs = state.walletTransactions || [];
  if (filter !== 'all') {
    txs = txs.filter(t => t.type === filter);
  }

  if (countEl) countEl.textContent = txs.length.toString();

  if (txs.length === 0) {
    container.innerHTML = `
      <div class="empty-wallet-card">
        <div class="empty-icon">🦁</div>
        <h4>No transactions in this filter</h4>
        <p>Top-up your balance or place an order to see your wallet activity.</p>
        <button onclick="openTopupModal(100)" class="btn-wallet-signin">+ Add funds</button>
      </div>
    `;
    return;
  }

  container.innerHTML = txs.map(t => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-md); margin-bottom: 8px;">
      <div>
        <div style="font-weight: 700; font-size: 0.88rem;">${t.type === 'deposit' ? '💰 Deposit Top-up' : '🛍️ Purchase'}</div>
        <div style="font-size: 0.74rem; color: var(--hint-color);">${t.channel || 'Wallet'} • Ref: ${t.reference}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 800; font-size: 0.92rem; color: ${t.type === 'deposit' ? '#34d399' : '#f87171'};">
          ${t.type === 'deposit' ? '+' : '-'}${t.amount.toFixed(2)} ETB
        </div>
        <span style="font-size: 0.7rem; color: #fbbf24; text-transform: uppercase;">${t.status}</span>
      </div>
    </div>
  `).join('');
}

function renderActivityOrders() {
  const container = document.getElementById('activityOrdersList');
  if (!container) return;

  let history = [];
  try {
    const raw = localStorage.getItem('atke_orders_history');
    if (raw) history = JSON.parse(raw);
  } catch (e) {}

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-wallet-card">
        <div class="empty-icon">📦</div>
        <h4>No orders placed yet</h4>
        <p>Browse our catalog and place your first order. Your license keys and delivery tickets will show here.</p>
        <button onclick="switchTab('viewHome')" class="btn-wallet-signin">Browse Store</button>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(order => `
    <div style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-lg); padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h4 style="font-size: 0.95rem; font-weight: 700;">${order.productName || 'Digital Subscription'}</h4>
        <span class="pill-tag" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">
          ${order.status === 'completed' ? 'Delivered' : 'Reconciling'}
        </span>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--hint-color); margin-bottom: 8px;">
        <span>UUID: <code>${order.uuid}</code></span>
        <span style="font-weight: 700; color: var(--text-color);">${order.amount} ETB</span>
      </div>
      ${order.deliveryCode ? `
        <div style="background: rgba(0,0,0,0.3); border: 1px dashed var(--accent-emerald); padding: 10px; border-radius: var(--radius-md); font-family: monospace; font-size: 0.85rem; color: #34d399; word-break: break-all; margin-top: 6px;">
          🔑 ${order.deliveryCode}
        </div>
      ` : `
        <p style="font-size: 0.74rem; color: #fbbf24; margin-top: 4px;">⏳ Verifying payment with bank. Code unlocks upon approval.</p>
      `}
    </div>
  `).join('');
}


/**
 * --------------------------------------------------------------------
 * Catalog Fetching & Rendering
 * --------------------------------------------------------------------
 */
async function loadCatalog() {
  const grid = document.getElementById('productsGrid');

  try {
    const response = await fetch(`${API_BASE_URL}?action=get_products`);
    const data = await response.json();

    if (data.success && Array.isArray(data.products) && data.products.length > 0) {
      state.products = data.products;
      state.filteredProducts = [...data.products];
      renderProducts(state.filteredProducts);
    } else if (state.products.length > 0) {
      renderProducts(state.filteredProducts);
    } else {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--hint-color);">
          <p>⚠️ Unable to load product catalog.</p>
          <button onclick="loadCatalog()" class="btn-buy" style="margin-top: 10px;">Retry</button>
        </div>
      `;
    }
  } catch (error) {
    console.warn("API offline or static mode, preserving verified pre-cached catalog:", error);
    if (state.products.length > 0) {
      renderProducts(state.filteredProducts);
    } else {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--hint-color);">
          <p>⚠️ Connection error loading catalog.</p>
          <button onclick="loadCatalog()" class="btn-buy" style="margin-top: 10px;">Retry</button>
        </div>
      `;
    }
  }
}

function applyFilters() {
  state.filteredProducts = state.products.filter(product => {
    const matchesCategory = (state.activeCategory === 'ALL') || 
      (product.category && product.category.toLowerCase().includes(state.activeCategory.toLowerCase()));
    
    const matchesSearch = !state.searchQuery || 
      product.name.toLowerCase().includes(state.searchQuery) ||
      (product.description && product.description.toLowerCase().includes(state.searchQuery));

    return matchesCategory && matchesSearch;
  });

  renderProducts(state.filteredProducts);
}

function renderProducts(items) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: var(--hint-color);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
        <p style="font-weight: 600;">No subscriptions found</p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Try searching with different keywords</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(p => {
    const isOutOfStock = parseInt(p.stock, 10) <= 0;
    const priceFormatted = Number(p.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 });
    const badgeHtml = p.badge ? `<span class="product-badge">${escapeHtml(p.badge)}</span>` : '';
    const warrantyHtml = p.warranty ? `<div class="meta-item">🛡️ ${escapeHtml(p.warranty)}</div>` : '';
    const stockHtml = isOutOfStock 
      ? `<span style="color: var(--accent-rose);">❌ Out of stock</span>` 
      : `<span style="color: var(--accent-emerald);">🔥 In Stock (${p.stock})</span>`;

    return `
      <div class="product-card">
        <div>
          <div class="card-top">
            <span class="product-category-tag">${escapeHtml(p.category || 'Digital')}</span>
            ${badgeHtml}
          </div>
          <h3 class="product-title">${escapeHtml(p.name)}</h3>
          <p class="product-desc">${escapeHtml(p.description || '')}</p>
          <div class="product-meta">
            ${warrantyHtml}
            <div class="meta-item">${stockHtml}</div>
          </div>
        </div>

        <div class="card-bottom">
          <div class="price-box">
            <span class="price-label">Price</span>
            <span class="price-value">${priceFormatted} <span class="price-currency">${escapeHtml(p.currency || 'ETB')}</span></span>
          </div>
          <button 
            class="btn-buy ${isOutOfStock ? 'out-of-stock' : ''}" 
            ${isOutOfStock ? 'disabled' : ''}
            onclick="openCheckoutModal('${escapeHtml(p.id)}')"
          >
            ${isOutOfStock ? 'Sold Out' : '⚡ Order Now'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * --------------------------------------------------------------------
 * Payment Channel Setup
 * --------------------------------------------------------------------
 */
async function loadPaymentChannels() {
  try {
    const res = await fetch(`${API_BASE_URL}?action=get_payment_methods`);
    const data = await res.json();
    if (data.success && Array.isArray(data.channels)) {
      data.channels.forEach(ch => {
        state.paymentChannels[ch.id] = {
          id: ch.id,
          name: ch.name,
          accountNumber: ch.account_number,
          accountHolder: ch.account_holder,
          instructions: ch.instructions
        };
      });
      selectPaymentChannel(state.selectedChannel);
    }
  } catch (e) {
    console.warn("Using default payment channel configs", e);
  }
}

function selectPaymentChannel(channelKey) {
  state.selectedChannel = channelKey;

  // Highlight card
  document.querySelectorAll('.channel-card').forEach(card => {
    if (card.dataset.channel === channelKey) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const ch = state.paymentChannels[channelKey];
  if (!ch) return;

  const dispName   = document.getElementById('dispChannelName');
  const dispHolder = document.getElementById('dispAccountHolder');
  const dispNumber = document.getElementById('dispAccountNumber');
  const dispInstr  = document.getElementById('channelInstructions');

  if (dispName)   dispName.textContent   = ch.name;
  if (dispHolder) dispHolder.textContent = ch.accountHolder;
  if (dispNumber) dispNumber.textContent = ch.accountNumber;
  if (dispInstr)  dispInstr.textContent  = ch.instructions;

  triggerHaptic('light');
}

/**
 * --------------------------------------------------------------------
 * Checkout Flow
 * --------------------------------------------------------------------
 */
window.openCheckoutModal = function(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  state.selectedProduct = product;

  document.getElementById('checkoutItemName').textContent = product.name;
  document.getElementById('checkoutItemWarranty').textContent = product.warranty || 'Instant Fulfillment';
  document.getElementById('checkoutItemPrice').textContent = `${Number(product.selling_price).toLocaleString()} ${product.currency}`;
  document.getElementById('txReferenceInput').value = '';

  // Reset screenshot dropzone & comments
  state.checkoutReceiptBase64 = null;
  const fileInput = document.getElementById('receiptFileInput');
  if (fileInput) fileInput.value = '';
  document.getElementById('uploadPrompt')?.classList.remove('hidden');
  document.getElementById('uploadPreviewBox')?.classList.add('hidden');
  const previewImg = document.getElementById('receiptPreviewImg');
  if (previewImg) previewImg.src = '';
  const notesInput = document.getElementById('orderNotesInput');
  if (notesInput) notesInput.value = '';

  selectPaymentChannel(state.selectedChannel || 'CBE');

  const modal = document.getElementById('checkoutModal');
  modal.classList.add('active');
  showTgBackButton(true);
  triggerHaptic('medium');
};

async function submitOrder() {
  if (!state.selectedProduct) return;

  const txInput = document.getElementById('txReferenceInput');
  let txRef = txInput ? txInput.value.trim().toUpperCase() : '';
  const hasReceipt = !!state.checkoutReceiptBase64;

  // Strict EITHER / OR Rule
  if (!txRef && !hasReceipt) {
    showToast('⚠️ Provide EITHER your FT reference number OR attach a receipt screenshot.');
    if (txInput) txInput.focus();
    triggerHaptic('error');
    return;
  }

  if (!txRef && hasReceipt) {
    txRef = 'REC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  const btn = document.getElementById('btnSubmitOrder');
  const btnText = document.getElementById('submitOrderBtnText');
  const spinner = document.getElementById('submitSpinner');

  btn.disabled = true;
  btnText.textContent = 'Verifying with System...';
  spinner.classList.remove('hidden');

  const notes = document.getElementById('orderNotesInput')?.value.trim() || '';
  const currentUserId = state.tgUser?.id || (state.webAppUser ? state.webAppUser.id : 12345678);
  const currentUsername = state.tgUser?.username || (state.webAppUser ? state.webAppUser.username : 'user');
  const currentFirstName = state.tgUser?.first_name || (state.webAppUser ? state.webAppUser.name : 'Customer');

  // Payload for backend
  const payload = {
    action: 'create_order',
    product_id: state.selectedProduct.id,
    payment_channel: state.selectedChannel,
    transaction_reference: txRef,
    receipt_image: state.checkoutReceiptBase64 || null,
    customer_notes: notes,
    init_data: tg?.initData || '',
    fallback_telegram_id: currentUserId,
    fallback_username: currentUsername,
    fallback_first_name: currentFirstName
  };

  try {
    const response = await fetch(`${API_BASE_URL}?action=create_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || ''
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success && data.order) {
      showToast('✅ Order logged! Checking verification status...');
      triggerHaptic('success');
      playAudioChime('pop');

      // Save order to history for Activity view
      let history = [];
      try {
        const raw = localStorage.getItem('atke_orders_history');
        if (raw) history = JSON.parse(raw);
      } catch (e) {}
      history.unshift({
        uuid: data.order.order_uuid,
        productId: state.selectedProduct.id,
        productName: state.selectedProduct.name,
        amount: state.selectedProduct.selling_price || 0,
        status: data.order.fulfillment_status || 'reconciling',
        deliveryCode: data.order.delivery_code || '',
        date: new Date().toLocaleDateString()
      });
      localStorage.setItem('atke_orders_history', JSON.stringify(history));

      // Close checkout modal
      document.getElementById('checkoutModal').classList.remove('active');

      // Open Status Tracking Modal
      openStatusModal(data.order.order_uuid, state.selectedProduct.name);
    } else {
      showToast(`❌ ${data.error || 'Failed to submit order'}`);
      triggerHaptic('error');
    }
  } catch (error) {
    console.error("Order submission error:", error);
    showToast('⚠️ Network error while submitting payment. Please try again.');
    triggerHaptic('error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Confirm & Submit Payment';
    spinner.classList.add('hidden');
  }
}

/**
 * --------------------------------------------------------------------
 * Order Tracking & Live Polling
 * --------------------------------------------------------------------
 */
function openStatusModal(orderUuid, productName) {
  state.activeOrderUuid = orderUuid;
  localStorage.setItem('active_order_uuid', orderUuid);

  document.getElementById('statusItemName').textContent = productName || 'Product Delivery';
  document.getElementById('statusOrderUuid').textContent = orderUuid;

  // Reset steps
  updateStepperState(1);

  document.getElementById('statusPendingBox').classList.remove('hidden');
  document.getElementById('statusDeliveryBox').classList.add('hidden');
  document.getElementById('redemptionInstructionsBox').classList.add('hidden');

  document.getElementById('statusModal').classList.add('active');
  showTgBackButton(true);

  // Start status polling
  startOrderPolling(orderUuid);
}

function startOrderPolling(orderUuid) {
  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
  }

  // Poll immediately, then every 3.5 seconds
  checkOrderStatus(orderUuid);
  state.pollIntervalId = setInterval(() => {
    checkOrderStatus(orderUuid);
  }, 3500);
}

async function checkOrderStatus(orderUuid) {
  try {
    const res = await fetch(`${API_BASE_URL}?action=get_order_status&order_uuid=${encodeURIComponent(orderUuid)}`);
    const data = await res.json();

    if (!data.success || !data.order) return;

    const order = data.order;

    if (order.payment_status === 'pending') {
      updateStepperState(2);
    } else if (order.fulfillment_status === 'completed') {
      // ORDER DELIVERED!
      updateStepperState(3);
      clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
      localStorage.removeItem('active_order_uuid');

      document.getElementById('statusPendingBox').classList.add('hidden');
      
      const deliveryBox = document.getElementById('statusDeliveryBox');
      const codeDisplay = document.getElementById('deliveryCodeDisplay');
      deliveryBox.classList.remove('hidden');
      codeDisplay.textContent = order.delivery_code || 'VOUCHER DELIVERED DIRECTLY TO YOUR TELEGRAM CHAT';

      if (order.redemption_instructions) {
        const instrBox = document.getElementById('redemptionInstructionsBox');
        document.getElementById('redemptionText').textContent = order.redemption_instructions;
        instrBox.classList.remove('hidden');
      }

      // Update history in localStorage
      try {
        const raw = localStorage.getItem('atke_orders_history');
        if (raw) {
          const history = JSON.parse(raw);
          const match = history.find(h => h.uuid === orderUuid);
          if (match) {
            match.status = 'completed';
            match.deliveryCode = order.delivery_code;
            localStorage.setItem('atke_orders_history', JSON.stringify(history));
          }
        }
      } catch (e) {}

      showToast('🎉 Payment verified! Your subscription is ready.');
      playAudioChime('crystal');
      triggerHaptic('success');
    } else if (order.payment_status === 'rejected') {
      clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
      localStorage.removeItem('active_order_uuid');

      document.getElementById('statusPendingBox').innerHTML = `
        <div style="color: var(--accent-rose); font-size: 2rem; margin-bottom: 8px;">❌</div>
        <h4 style="color: var(--accent-rose); margin-bottom: 4px;">Payment Verification Failed</h4>
        <p style="font-size: 0.8rem; color: var(--hint-color);">We could not verify the provided transaction reference. Please contact support via <a href="https://t.me/AtkeShop" target="_blank" style="color: var(--link-color);">@AtkeShop</a>.</p>
      `;
      triggerHaptic('error');
    }
  } catch (err) {
    console.warn("Polling error:", err);
  }
}

function updateStepperState(stepNum) {
  const s1 = document.getElementById('step1');
  const s2 = document.getElementById('step2');
  const s3 = document.getElementById('step3');

  [s1, s2, s3].forEach(s => s?.classList.remove('active', 'completed'));

  if (stepNum === 1) {
    s1.classList.add('active');
  } else if (stepNum === 2) {
    s1.classList.add('completed');
    s2.classList.add('active');
  } else if (stepNum === 3) {
    s1.classList.add('completed');
    s2.classList.add('completed');
    s3.classList.add('completed');
  }
}

function checkStoredActiveOrder() {
  const storedUuid = localStorage.getItem('active_order_uuid');
  if (storedUuid) {
    openStatusModal(storedUuid, 'Recent Order');
  }
}

/**
 * --------------------------------------------------------------------
 * My Orders Screen
 * --------------------------------------------------------------------
 */
async function openMyOrdersModal() {
  const modal = document.getElementById('ordersModal');
  const list = document.getElementById('myOrdersList');
  modal.classList.add('active');
  showTgBackButton(true);
  triggerHaptic('light');

  list.innerHTML = `<div style="text-align: center; padding: 30px;"><div class="spinner"></div></div>`;

  try {
    const userId = state.tgUser?.id || '';
    const url = `${API_BASE_URL}?action=get_my_orders&init_data=${encodeURIComponent(tg?.initData || '')}&user_id=${userId}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success && Array.isArray(data.orders) && data.orders.length > 0) {
      // Update header badge
      const badge = document.getElementById('ordersCountBadge');
      if (badge) {
        badge.textContent = data.orders.length;
        badge.classList.remove('hidden');
      }

      list.innerHTML = data.orders.map(o => {
        const isDone = o.fulfillment_status === 'completed';
        const badgeClass = isDone ? 'badge-completed' : (o.payment_status === 'rejected' ? 'badge-failed' : 'badge-pending');
        const badgeText = isDone ? 'Completed' : (o.payment_status === 'rejected' ? 'Rejected' : 'Pending Verification');

        return `
          <div class="purchase-card">
            <div class="purchase-card-header">
              <span class="purchase-title">${escapeHtml(o.product_name)}</span>
              <span class="purchase-status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--hint-color); margin-bottom: 6px;">
              <span>UUID: ${escapeHtml(o.order_uuid)}</span> • <span>${Number(o.amount).toLocaleString()} ${o.currency}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--hint-color); margin-bottom: 8px;">
              <span>Channel: ${escapeHtml(o.payment_channel)}</span> (Ref: <code>${escapeHtml(o.transaction_reference || 'N/A')}</code>)
            </div>

            ${isDone && o.delivery_code ? `
              <div style="margin-top: 8px;">
                <div class="code-display" style="margin: 6px 0; font-size: 0.85rem;">${escapeHtml(o.delivery_code)}</div>
                <button class="btn-copy-account" style="font-size: 0.7rem; padding: 4px 8px;" onclick="copyToClipboard('${escapeHtml(o.delivery_code)}', 'Code copied!')">
                  📋 Copy Code
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      list.innerHTML = `
        <div style="text-align: center; padding: 40px 10px; color: var(--hint-color);">
          <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
          <p style="font-weight: 600;">No past orders found</p>
          <p style="font-size: 0.8rem; margin-top: 4px;">Your verified digital purchases will appear here.</p>
        </div>
      `;
    }
  } catch (e) {
    console.error("Failed to load orders:", e);
    list.innerHTML = `<p style="text-align: center; color: var(--hint-color); padding: 20px;">Could not load past orders.</p>`;
  }
}

/**
 * --------------------------------------------------------------------
 * Utilities: Modals, Copy, Toasts, and Haptics
 * --------------------------------------------------------------------
 */
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.remove('active');
  });

  if (state.pollIntervalId) {
    clearInterval(state.pollIntervalId);
    state.pollIntervalId = null;
  }

  showTgBackButton(false);
}

function showTgBackButton(visible) {
  if (tg?.BackButton) {
    if (visible) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }
  }
}

window.copyToClipboard = function(text, successMsg) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg || 'Copied to clipboard!');
      triggerHaptic('success');
    }).catch(() => {
      fallbackCopyText(text, successMsg);
    });
  } else {
    fallbackCopyText(text, successMsg);
  }
};

function fallbackCopyText(text, successMsg) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(successMsg || 'Copied to clipboard!');
    triggerHaptic('success');
  } catch (err) {
    showToast('⚠️ Copy failed, please manually select the code');
  }
  document.body.removeChild(textArea);
}

function showToast(message) {
  const toast = document.getElementById('appToast');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function triggerHaptic(type) {
  if (!tg?.HapticFeedback) return;
  try {
    switch (type) {
      case 'light':
        tg.HapticFeedback.impactOccurred('light');
        break;
      case 'medium':
        tg.HapticFeedback.impactOccurred('medium');
        break;
      case 'selection':
        tg.HapticFeedback.selectionChanged();
        break;
      case 'success':
        tg.HapticFeedback.notificationOccurred('success');
        break;
      case 'error':
        tg.HapticFeedback.notificationOccurred('error');
        break;
    }
  } catch (e) {
    // Ignore haptic failures on unsupported clients
  }
}

function escapeHtml(string) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(string || ''));
  return div.innerHTML;
}

/**
 * --------------------------------------------------------------------
 * Admin Hub Controller & Channel Broadcasts
 * --------------------------------------------------------------------
 */
async function checkAdminStatus() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const adminParam = urlParams.get('admin');
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || (adminParam === '1' ? '7608745515' : '');

    const res = await fetch(`${API_BASE_URL}?action=is_admin&init_data=${encodeURIComponent(initData)}&admin_id=${userId}`);
    const data = await res.json();

    if (data.success && data.is_admin) {
      state.isAdmin = true;
      state.adminSettings = data.settings || {};
      state.channelUsername = data.channel || '@AtkeStore';

      const btnAdmin = document.getElementById('btnAdminHub');
      if (btnAdmin) {
        btnAdmin.classList.remove('hidden');
      }
      const navAdmin = document.getElementById('navAdmin');
      if (navAdmin) {
        navAdmin.classList.remove('hidden');
      }
      const btnProfileAdmin = document.getElementById('btnProfileAdminHub');
      if (btnProfileAdmin) {
        btnProfileAdmin.classList.remove('hidden');
      }

      if (data.settings?.usd_to_etb_rate) {
        const rateInput = document.getElementById('adminUsdRate');
        if (rateInput) rateInput.value = data.settings.usd_to_etb_rate;
      }
      if (data.support) {
        const supportInput = document.getElementById('adminSupportContact');
        if (supportInput) supportInput.value = data.support;
      }
    }
  } catch (err) {
    console.warn("checkAdminStatus error:", err);
  }
}

function openAdminModal() {
  const modal = document.getElementById('adminModal');
  if (!modal) return;
  modal.classList.add('active');
  showTgBackButton(true);
  triggerHaptic('medium');
  renderAdminProducts();
}

function renderAdminProducts() {
  const container = document.getElementById('adminProductsList');
  if (!container) return;

  container.innerHTML = state.products.map(p => {
    const badges = ['', 'Popular', 'Hot', 'New', 'Best Seller', 'Flash Sale', 'Black Friday', 'Special Offer'];
    const optionsHtml = badges.map(b => {
      const selected = (p.badge || '') === b ? 'selected' : '';
      return `<option value="${escapeHtml(b)}" ${selected}>${b ? b : 'None (Default)'}</option>`;
    }).join('');

    return `
      <div class="admin-item-card" data-product-id="${p.id}">
        <div class="admin-item-header">
          <div>
            <div class="admin-item-title">${escapeHtml(p.name)}</div>
            <div class="admin-item-category">${escapeHtml(p.category)} (ID: <code>${p.id}</code>)</div>
          </div>
          <span style="font-size: 0.75rem; color: var(--accent-emerald);">Cost: $${p.wholesale_price || '0'}</span>
        </div>

        <div class="admin-item-grid">
          <div class="admin-field-group">
            <label>Price (ETB):</label>
            <input type="number" class="admin-price-input" value="${Number(p.selling_price)}" step="50">
          </div>
          <div class="admin-field-group">
            <label>Stock Count:</label>
            <input type="number" class="admin-stock-input" value="${p.stock || 10}">
          </div>
          <div class="admin-field-group" style="grid-column: 1/-1;">
            <label>Promotional Badge:</label>
            <select class="admin-badge-select">
              ${optionsHtml}
            </select>
          </div>
        </div>

        <div class="admin-actions-row">
          <button class="btn-admin-save" onclick="saveProductEdits('${p.id}')">💾 Save</button>
          <button class="btn-admin-broadcast" onclick="broadcastProduct('${p.id}')">📢 Post to Channel</button>
        </div>
      </div>
    `;
  }).join('');
}

window.saveProductEdits = async function(productId) {
  const card = document.querySelector(`.admin-item-card[data-product-id="${productId}"]`);
  if (!card) return;

  const price = parseFloat(card.querySelector('.admin-price-input').value);
  const stock = parseInt(card.querySelector('.admin-stock-input').value, 10);
  const badge = card.querySelector('.admin-badge-select').value;

  try {
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || '7608745515';

    const res = await fetch(`${API_BASE_URL}?action=admin_update_product`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        init_data: initData,
        admin_id: userId,
        id: productId,
        selling_price: price,
        stock: stock,
        badge: badge
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Product updated successfully!');
      triggerHaptic('success');
      const item = state.products.find(x => x.id === productId);
      if (item) {
        item.selling_price = price;
        item.stock = stock;
        item.badge = badge;
        applyFilters();
      }
    } else {
      showToast('❌ Update failed: ' + (data.error || 'Unknown error'));
      triggerHaptic('error');
    }
  } catch (err) {
    showToast('⚠️ Network error saving product');
  }
};

window.broadcastProduct = async function(productId) {
  if (!confirm('Post this product deal directly to ' + (state.channelUsername || '@AtkeStore') + '?')) return;

  try {
    showToast('⏳ Broadcasting offer to channel...');
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || '7608745515';

    const res = await fetch(`${API_BASE_URL}?action=admin_broadcast_channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        init_data: initData,
        admin_id: userId,
        id: productId
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('🚀 Broadcasted to ' + (state.channelUsername || '@AtkeStore') + '!');
      triggerHaptic('success');
    } else {
      showToast('❌ Broadcast error: ' + (data.error || 'Failed'));
      triggerHaptic('error');
    }
  } catch (err) {
    showToast('⚠️ Network error during broadcast');
  }
};

async function checkDeepLinkParam() {
  try {
    let startParam = tg?.initDataUnsafe?.start_param || '';
    if (!startParam) {
      const urlParams = new URLSearchParams(window.location.search);
      startParam = urlParams.get('startapp') || urlParams.get('start') || '';
    }
    if (startParam && startParam.startsWith('item_')) {
      const targetId = startParam.replace('item_', '');
      setTimeout(() => {
        const item = state.products.find(p => p.id === targetId);
        if (item) {
          openCheckoutModal(item.id);
        }
      }, 350);
    }
  } catch (e) {}
}

/**
 * --------------------------------------------------------------------
 * Standalone Web App Browser Sync (outside Telegram)
 * --------------------------------------------------------------------
 */
function initWebAppSync() {
  const savedUser = localStorage.getItem('atke_webapp_user');
  if (savedUser) {
    try {
      state.webAppUser = JSON.parse(savedUser);
      if (!state.tgUser) {
        updateUserProfileUI({
          id: state.webAppUser.id,
          first_name: state.webAppUser.name || 'Web Customer',
          username: state.webAppUser.email || state.webAppUser.username || ''
        });
      }
    } catch (e) {}
  }

  const btnSync = document.getElementById('btnWebSync');
  const inputSync = document.getElementById('inputWebSyncId');
  if (btnSync && inputSync) {
    if (state.webAppUser?.email || state.webAppUser?.username) {
      inputSync.value = state.webAppUser.email || state.webAppUser.username;
    }
    btnSync.addEventListener('click', () => {
      const val = inputSync.value.trim();
      if (!val || val.length < 3) {
        showToast('⚠️ Enter your Telegram @username, ID, or Email');
        return;
      }
      const isNum = /^\d+$/.test(val);
      const syntheticId = isNum ? parseInt(val, 10) : Math.abs(val.split('').reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)) % 1000000000;
      state.webAppUser = {
        id: syntheticId,
        name: val.includes('@') ? val.split('@')[0] : val,
        email: val.includes('@') ? val : '',
        username: val.replace('@', '')
      };
      localStorage.setItem('atke_webapp_user', JSON.stringify(state.webAppUser));
      updateUserProfileUI({
        id: state.webAppUser.id,
        first_name: state.webAppUser.name,
        username: state.webAppUser.username
      });
      showToast('✅ Account synced to browser!');
      loadUserProfile();
      loadWalletBalance();
      triggerHaptic('success');
    });
  }
}

/**
 * --------------------------------------------------------------------
 * Profile & Wallet Data Sync
 * --------------------------------------------------------------------
 */
async function loadUserProfile() {
  const userId = state.tgUser?.id || (state.webAppUser ? state.webAppUser.id : null);
  if (!userId) return;

  try {
    const initData = tg?.initData || '';
    const res = await fetch(`${API_BASE_URL}?action=get_user_profile&user_id=${userId}&init_data=${encodeURIComponent(initData)}`);
    const data = await res.json();
    if (data.success && data.user) {
      const u = data.user;
      state.userWalletBalance = parseFloat(u.wallet_balance || 0);
      const balEl = document.getElementById('dispWalletBalance');
      const profBalEl = document.getElementById('profileWalletBal');
      const totalOrdersEl = document.getElementById('profileTotalOrders');
      if (balEl) balEl.textContent = state.userWalletBalance.toFixed(2);
      if (profBalEl) profBalEl.textContent = `${state.userWalletBalance.toFixed(2)} ETB`;
      if (totalOrdersEl) totalOrdersEl.textContent = u.total_orders || '0';
    }
  } catch (e) {
    console.warn("Could not load user profile:", e);
  }
}

async function loadWalletBalance() {
  const userId = state.tgUser?.id || (state.webAppUser ? state.webAppUser.id : null);
  if (!userId) return;

  try {
    const initData = tg?.initData || '';
    const res = await fetch(`${API_BASE_URL}?action=get_wallet_balance&user_id=${userId}&init_data=${encodeURIComponent(initData)}`);
    const data = await res.json();
    if (data.success) {
      state.userWalletBalance = parseFloat(data.balance || 0);
      const balEl = document.getElementById('dispWalletBalance');
      const profBalEl = document.getElementById('profileWalletBal');
      if (balEl) balEl.textContent = state.userWalletBalance.toFixed(2);
      if (profBalEl) profBalEl.textContent = `${state.userWalletBalance.toFixed(2)} ETB`;

      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        state.walletTransactions = data.transactions.map(t => ({
          id: t.id,
          type: t.type === 'deposit' ? 'deposit' : 'purchase',
          amount: parseFloat(t.amount || 0),
          channel: t.channel || 'Wallet',
          reference: t.reference || '',
          status: t.status || 'completed',
          date: new Date(t.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
        localStorage.setItem('atke_wallet_txs', JSON.stringify(state.walletTransactions));
      }
      renderWalletLedger('all');
    }
  } catch (e) {
    console.warn("Could not load wallet balance:", e);
  }
}

/**
 * --------------------------------------------------------------------
 * Admin Hub Data & Action Handlers
 * --------------------------------------------------------------------
 */
async function loadAdminPendingData() {
  const ordersContainer = document.getElementById('adminPendingOrdersList');
  const topupsContainer = document.getElementById('adminPendingTopupsList');
  const metricOrders = document.getElementById('adminMetricPendingOrders');
  const metricTopups = document.getElementById('adminMetricPendingTopups');
  const metricCatalog = document.getElementById('adminMetricCatalogCount');

  if (metricCatalog) metricCatalog.textContent = state.products.length.toString();

  try {
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || '7608745515';
    const res = await fetch(`${API_BASE_URL}?action=admin_get_pending&admin_id=${userId}&init_data=${encodeURIComponent(initData)}`);
    const data = await res.json();

    if (data.success) {
      const orders = data.orders || [];
      const topups = data.topups || [];

      if (metricOrders) metricOrders.textContent = orders.length.toString();
      if (metricTopups) metricTopups.textContent = topups.length.toString();

      // Render Orders
      if (ordersContainer) {
        if (orders.length === 0) {
          ordersContainer.innerHTML = '<p class="empty-hint" style="padding: 16px; text-align: center; color: var(--hint-color);">🎉 No pending orders to review!</p>';
        } else {
          ordersContainer.innerHTML = orders.map(o => `
            <div class="admin-review-card" style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 14px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(o.product_name)}</span>
                <span style="font-weight: 800; color: var(--accent-emerald);">${Number(o.amount).toLocaleString()} ${escapeHtml(o.currency || 'ETB')}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--hint-color); margin-bottom: 4px;">
                <span>User: <b>@${escapeHtml(o.username || o.first_name || o.telegram_user_id)}</b></span> (ID: <code>${o.telegram_user_id}</code>)
              </div>
              <div style="font-size: 0.8rem; color: var(--hint-color); margin-bottom: 8px;">
                <span>Channel: <b>${escapeHtml(o.payment_channel)}</b></span> • <span>Ref: <code>${escapeHtml(o.transaction_reference)}</code></span>
              </div>
              ${o.customer_notes ? `<div style="font-size: 0.78rem; font-style: italic; color: var(--text-color); margin-bottom: 8px;">💬 Note: "${escapeHtml(o.customer_notes)}"</div>` : ''}
              ${o.receipt_image ? `<div style="font-size: 0.75rem; color: var(--accent-emerald); margin-bottom: 8px;">📸 Screenshot attached</div>` : ''}
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button onclick="adminActionOrder(${o.id}, 'approve')" class="btn-review-action btn-approve" style="flex: 1; padding: 8px; border-radius: var(--radius-sm); background: var(--accent-emerald); color: #fff; font-weight: 700; border: none; cursor: pointer;">✅ Approve & Deliver</button>
                <button onclick="adminActionOrder(${o.id}, 'reject')" class="btn-review-action btn-reject" style="flex: 1; padding: 8px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; border: 1px solid #ef4444; cursor: pointer;">❌ Reject</button>
              </div>
            </div>
          `).join('');
        }
      }

      // Render Top-ups
      if (topupsContainer) {
        if (topups.length === 0) {
          topupsContainer.innerHTML = '<p class="empty-hint" style="padding: 16px; text-align: center; color: var(--hint-color);">🎉 No pending wallet top-ups to review!</p>';
        } else {
          topupsContainer.innerHTML = topups.map(t => `
            <div class="admin-review-card" style="background: var(--card-bg); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 14px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-weight: 700; font-size: 0.95rem;">Deposit Top-Up</span>
                <span style="font-weight: 800; color: var(--accent-emerald);">+${Number(t.amount).toLocaleString()} ETB</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--hint-color); margin-bottom: 4px;">
                <span>User: <b>@${escapeHtml(t.username || t.first_name || t.telegram_user_id)}</b></span> (ID: <code>${t.telegram_user_id}</code>)
              </div>
              <div style="font-size: 0.8rem; color: var(--hint-color); margin-bottom: 8px;">
                <span>Channel: <b>${escapeHtml(t.payment_channel)}</b></span> • <span>Ref: <code>${escapeHtml(t.transaction_reference)}</code></span>
              </div>
              ${t.description ? `<div style="font-size: 0.78rem; font-style: italic; color: var(--text-color); margin-bottom: 8px;">💬 Note: "${escapeHtml(t.description)}"</div>` : ''}
              ${t.receipt_image ? `<div style="font-size: 0.75rem; color: var(--accent-emerald); margin-bottom: 8px;">📸 Screenshot attached</div>` : ''}
              <div style="display: flex; gap: 8px; margin-top: 10px;">
                <button onclick="adminActionTopup(${t.id}, 'approve')" class="btn-review-action btn-approve" style="flex: 1; padding: 8px; border-radius: var(--radius-sm); background: var(--accent-emerald); color: #fff; font-weight: 700; border: none; cursor: pointer;">✅ Credit Wallet</button>
                <button onclick="adminActionTopup(${t.id}, 'reject')" class="btn-review-action btn-reject" style="flex: 1; padding: 8px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; border: 1px solid #ef4444; cursor: pointer;">❌ Reject</button>
              </div>
            </div>
          `).join('');
        }
      }
    }
  } catch (err) {
    console.error("Admin load error:", err);
  }
}

window.adminActionOrder = async function(orderId, decision) {
  if (!confirm(`Are you sure you want to ${decision} order #${orderId}?`)) return;
  try {
    showToast('⏳ Updating order status...');
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || '7608745515';
    const res = await fetch(`${API_BASE_URL}?action=admin_action_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData, admin_id: userId, order_id: orderId, decision: decision })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Order #${orderId} ${decision}ed!`);
      triggerHaptic('success');
      loadAdminPendingData();
    } else {
      showToast(`❌ Action failed: ${data.error || 'Unknown'}`);
      triggerHaptic('error');
    }
  } catch (e) {
    showToast('⚠️ Network error updating order');
  }
};

window.adminActionTopup = async function(topupId, decision) {
  if (!confirm(`Are you sure you want to ${decision} top-up #${topupId}?`)) return;
  try {
    showToast('⏳ Updating top-up status...');
    const initData = tg?.initData || '';
    const userId = state.tgUser?.id || '7608745515';
    const res = await fetch(`${API_BASE_URL}?action=admin_action_topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData, admin_id: userId, topup_id: topupId, decision: decision })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Top-up #${topupId} ${decision}ed!`);
      triggerHaptic('success');
      loadAdminPendingData();
    } else {
      showToast(`❌ Action failed: ${data.error || 'Unknown'}`);
      triggerHaptic('error');
    }
  } catch (e) {
    showToast('⚠️ Network error updating topup');
  }
};
