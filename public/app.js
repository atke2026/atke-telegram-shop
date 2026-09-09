/**
 * YeneShop Mini App Frontend Controller
 * Integrates with Telegram WebApp SDK and PHP Backend REST APIs
 */

// Application State
const state = {
  tg: window.Telegram?.WebApp || null,
  initData: window.Telegram?.WebApp?.initData || '',
  user: null,
  products: [],
  orders: [],
  activeCategory: 'All',
  selectedMethod: 'telebirr',
  paymentMethods: {
    telebirr: { name: 'Telebirr', account: '0906818924', holder: 'Mohammed Abdirahman Ibrahim' },
    cbe: { name: 'Commercial Bank of Ethiopia (CBE)', account: '1000233801837', holder: 'Mohammed Abdirahman Ibrahim' },
    ebirr: { name: 'E-Birr (Coop / Kaafi)', account: '0906818924', holder: 'Mohammed Abdirahman Ibrahim' }
  },
  pendingPurchaseProduct: null,
  deliveredPayload: '',
  adminProducts: [],
  adminDeposits: [],
  adminPaymentMethods: [],
  adminSection: 'products',
  adminDepositFilter: 'pending'
};

// ==========================================================
// 1. INITIALIZATION & TELEGRAM SDK SETUP
// ==========================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupTelegramSDK();
  setupIcons();
  
  // Authenticate user & load initial catalog
  await authenticateUser();
  await loadCatalog();
});

function setupTelegramSDK() {
  if (state.tg) {
    try {
      state.tg.ready();
      state.tg.expand();
      if (typeof state.tg.setHeaderColor === 'function') {
        state.tg.setHeaderColor('#0b0f19');
      }
      if (typeof state.tg.setBackgroundColor === 'function') {
        state.tg.setBackgroundColor('#0b0f19');
      }
      if (typeof state.tg.enableClosingConfirmation === 'function') {
        state.tg.enableClosingConfirmation();
      }
    } catch (err) {
      console.warn('Telegram SDK initialization note:', err);
    }
  }

  // Standalone browser fallback for local testing
  if (!state.initData) {
    console.info('Running outside Telegram client. Using development test context.');
    state.initData = 'mock_test=1&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Demo%20User%22%2C%22username%22%3A%22demouser%22%7D&auth_date=1770000000&hash=mock';
  }
}

function setupIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function triggerHaptic(type = 'light') {
  if (!state.tg?.HapticFeedback) return;
  try {
    switch (type) {
      case 'success':
        state.tg.HapticFeedback.notificationOccurred('success');
        break;
      case 'error':
        state.tg.HapticFeedback.notificationOccurred('error');
        break;
      case 'warning':
        state.tg.HapticFeedback.notificationOccurred('warning');
        break;
      case 'medium':
        state.tg.HapticFeedback.impactOccurred('medium');
        break;
      default:
        state.tg.HapticFeedback.impactOccurred('light');
    }
  } catch (e) {
    // Ignore haptic errors on unsupported devices
  }
}

// ==========================================================
// 2. AUTHENTICATION & USER PROFILE
// ==========================================================
async function authenticateUser() {
  try {
    const res = await fetch('../api/auth.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({ initData: state.initData })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
      return;
    }

    state.user = data.user;
    if (data.payment_methods) {
      state.paymentMethods = data.payment_methods;
    }

    updateUserUI();
  } catch (err) {
    console.error('Authentication request error:', err);
    showToast('Failed to connect to store server.', true);
  }
}

function updateUserUI() {
  if (!state.user) return;

  const nameEl = document.getElementById('userName');
  const handleEl = document.getElementById('userHandle');
  const avatarEl = document.getElementById('userAvatar');
  const headerBal = document.getElementById('headerBalance');
  const walletBalBig = document.getElementById('walletBalanceBig');
  const friendsCount = document.getElementById('referralFriendsCount');
  const ordersCount = document.getElementById('referralOrdersCount');
  const refLinkInput = document.getElementById('referralLinkInput');

  const firstName = state.user.first_name || 'User';
  nameEl.textContent = firstName;
  handleEl.textContent = state.user.username ? `@${state.user.username}` : `ID: ${state.user.telegram_id}`;
  avatarEl.textContent = firstName.charAt(0).toUpperCase();

  const formattedBal = state.user.wallet_balance.toFixed(2);
  headerBal.textContent = `${formattedBal} ETB`;
  walletBalBig.innerHTML = `${formattedBal} <span class="text-sm font-semibold text-emerald-400">ETB</span>`;

  friendsCount.textContent = state.user.referral_count || 0;
  ordersCount.textContent = state.user.orders_count || 0;
  refLinkInput.value = state.user.referral_link || '';

  // Reveal Admin features if authenticated user is store administrator
  if (state.user.is_admin) {
    const adminHeaderBtn = document.getElementById('headerAdminBtn');
    const adminNavBtn = document.getElementById('nav-admin');
    const bottomNav = document.getElementById('bottomNavGrid');

    if (adminHeaderBtn) {
      adminHeaderBtn.classList.remove('hidden');
      adminHeaderBtn.classList.add('flex');
    }
    if (adminNavBtn) {
      adminNavBtn.classList.remove('hidden');
    }
    if (bottomNav) {
      bottomNav.classList.remove('grid-cols-4');
      bottomNav.classList.add('grid-cols-5');
    }

    // Direct launch to admin tab if URL has ?tab=admin or hash #admin
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'admin' || window.location.hash === '#admin') {
      switchTab('admin');
    }
  }

  // Refresh current payment method box
  renderWalletMethodButtons();
  renderPaymentMethodDetails();
}

// ==========================================================
// 3. STORE CATALOG & PRODUCTS
// ==========================================================
async function loadCatalog() {
  try {
    const res = await fetch('../api/store.php');
    const data = await res.json();
    if (data.products) {
      state.products = data.products;
      renderProducts();
    }
  } catch (err) {
    console.error('Catalog fetch error:', err);
  }
}

function filterCategory(category) {
  triggerHaptic('light');
  state.activeCategory = category;

  // Update pills UI
  document.querySelectorAll('.cat-pill').forEach(btn => {
    if (btn.textContent.trim() === category || (category === 'VPN & Security' && btn.textContent.trim() === 'VPN')) {
      btn.className = 'cat-pill active px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold whitespace-nowrap transition-all shadow-sm';
    } else {
      btn.className = 'cat-pill px-3.5 py-1.5 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 whitespace-nowrap transition-all';
    }
  });

  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  const filtered = state.products.filter(p => {
    if (state.activeCategory === 'All') return true;
    return p.category.toLowerCase().includes(state.activeCategory.toLowerCase());
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-gray-400 space-y-2">
        <i data-lucide="package-search" class="w-10 h-10 mx-auto text-gray-600"></i>
        <p class="text-xs">No products found in this category.</p>
      </div>
    `;
    setupIcons();
    return;
  }

  container.innerHTML = filtered.map(prod => {
    const isOutOfStock = prod.stock_count <= 0;
    const badgeHtml = prod.badge 
      ? `<span class="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${prod.badge}</span>`
      : '';

    const stockHtml = isOutOfStock
      ? `<span class="inline-flex items-center space-x-1 text-[11px] text-red-400 font-medium">
           <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
           <span>Out of Stock</span>
         </span>`
      : `<span class="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-medium">
           <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
           <span>${prod.stock_count} in stock</span>
         </span>`;

    const iconUrl = prod.icon_url || 'https://img.icons8.com/color/480/shield.png';

    return `
      <div class="p-3.5 rounded-2xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all flex flex-col justify-between space-y-3">
        <div class="flex items-start space-x-3">
          <div class="w-12 h-12 rounded-xl bg-gray-800/80 p-2 shrink-0 border border-gray-700/50 flex items-center justify-center">
            <img src="${iconUrl}" alt="${prod.name}" class="w-full h-full object-contain" onerror="this.src='https://img.icons8.com/color/480/gift--v1.png'" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-0.5">
              <h3 class="text-xs font-bold text-white truncate">${prod.name}</h3>
              ${badgeHtml}
            </div>
            <p class="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">${prod.description || ''}</p>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-gray-800/70">
          <div>
            <div class="text-sm font-extrabold text-white">${prod.price_etb.toFixed(2)} <span class="text-[10px] font-bold text-emerald-400">ETB</span></div>
            ${stockHtml}
          </div>

          <button 
            onclick="openBuyModal(${prod.id})" 
            ${isOutOfStock ? 'disabled' : ''} 
            class="${isOutOfStock 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/40 active:scale-95'} 
              px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5">
            <i data-lucide="${isOutOfStock ? 'ban' : 'zap'}" class="w-3.5 h-3.5"></i>
            <span>${isOutOfStock ? 'Sold Out' : 'Buy Now'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  setupIcons();
}

// ==========================================================
// 4. CHECKOUT & DIGITAL KEY DELIVERY
// ==========================================================
function openBuyModal(productId) {
  triggerHaptic('medium');
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  state.pendingPurchaseProduct = product;

  const currentBal = state.user?.wallet_balance || 0;
  const shortfall = product.price_etb - currentBal;
  const balanceAfter = currentBal - product.price_etb;

  document.getElementById('buyModalIcon').src = product.icon_url || 'https://img.icons8.com/color/480/gift--v1.png';
  document.getElementById('buyModalName').textContent = product.name;
  document.getElementById('buyModalCategory').textContent = product.category;
  document.getElementById('buyModalPrice').textContent = `${product.price_etb.toFixed(2)} ETB`;
  
  document.getElementById('buyModalCurrentBal').textContent = `${currentBal.toFixed(2)} ETB`;
  document.getElementById('buyModalDeductPrice').textContent = `-${product.price_etb.toFixed(2)} ETB`;

  const balAfterEl = document.getElementById('buyModalBalAfter');
  const confirmBtn = document.getElementById('btnConfirmPurchase');
  const noticeEl = document.getElementById('buyModalNotice');

  if (shortfall > 0) {
    balAfterEl.className = 'font-bold text-red-400';
    balAfterEl.textContent = `-${shortfall.toFixed(2)} ETB`;
    noticeEl.innerHTML = `⚠️ <b class="text-red-400">Insufficient balance.</b> Please add at least <b>${shortfall.toFixed(2)} ETB</b> to proceed.`;
    confirmBtn.innerHTML = `<span>Deposit to Buy</span>`;
    confirmBtn.onclick = () => {
      closeModal('buyModal');
      switchTab('wallet');
      document.getElementById('depositAmountInput').value = Math.ceil(shortfall);
    };
  } else {
    balAfterEl.className = 'font-bold text-emerald-400';
    balAfterEl.textContent = `${balanceAfter.toFixed(2)} ETB`;
    noticeEl.textContent = 'The digital account credentials or voucher link will be unlocked instantly.';
    confirmBtn.innerHTML = `<span>Confirm & Unlock</span>`;
    confirmBtn.onclick = executePurchase;
  }

  document.getElementById('buyModal').classList.remove('hidden');
}

async function executePurchase() {
  if (!state.pendingPurchaseProduct) return;
  const product = state.pendingPurchaseProduct;

  const confirmBtn = document.getElementById('btnConfirmPurchase');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="animate-spin mr-1">⏳</span> Processing...`;

  try {
    const res = await fetch('../api/store.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({
        product_id: product.id,
        initData: state.initData
      })
    });

    const data = await res.json();

    if (data.error) {
      triggerHaptic('error');
      showToast(data.error, true);
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<span>Confirm & Unlock</span>`;
      return;
    }

    // Success!
    triggerHaptic('success');
    closeModal('buyModal');

    // Update state balance
    if (typeof data.wallet_balance === 'number') {
      state.user.wallet_balance = data.wallet_balance;
      state.user.orders_count = (state.user.orders_count || 0) + 1;
      updateUserUI();
    }

    // Show delivery modal
    state.deliveredPayload = data.delivered_payload;
    document.getElementById('deliveredPayloadText').textContent = data.delivered_payload;
    document.getElementById('deliveryModal').classList.remove('hidden');

    // Reload catalog in background to update stock count
    loadCatalog();

  } catch (err) {
    console.error('Purchase request error:', err);
    triggerHaptic('error');
    showToast('Network error during checkout.', true);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<span>Confirm & Unlock</span>`;
  }
}

function copyDeliveredPayload() {
  if (!state.deliveredPayload) return;
  triggerHaptic('medium');
  navigator.clipboard.writeText(state.deliveredPayload).then(() => {
    const btn = document.getElementById('copyPayloadBtnText');
    btn.textContent = 'Copied to Clipboard! ✓';
    setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    showToast('Delivery copied to clipboard! 🎉');
  }).catch(() => {
    showToast('Failed to copy. Please select text manually.', true);
  });
}

function viewInOrders() {
  closeModal('deliveryModal');
  switchTab('orders');
}

// ==========================================================
// 5. WALLET & DEPOSIT FLOW
// ==========================================================
function renderWalletMethodButtons() {
  const container = document.getElementById('walletMethodButtonsContainer');
  if (!container) return;

  const methodsList = Object.values(state.paymentMethods).filter(m => m.is_active !== 0);
  if (methodsList.length === 0) return;

  const activeCodes = methodsList.map(m => (m.code || m.name).toLowerCase());
  if (!activeCodes.includes(state.selectedMethod.toLowerCase())) {
    state.selectedMethod = activeCodes[0];
  }

  container.className = `grid grid-cols-${Math.min(methodsList.length, 3)} gap-2`;
  container.innerHTML = methodsList.map(m => {
    const code = (m.code || m.name).toLowerCase();
    const isSel = code === state.selectedMethod.toLowerCase();
    let badge = 'Instant';
    if (code.includes('telebirr')) badge = 'Superfast';
    else if (code.includes('cbe')) badge = 'Commercial';
    else if (code.includes('ebirr')) badge = 'Coop / Kaafi';

    return `
      <button type="button" onclick="selectDepositMethod('${code}')" id="btnMethod-${code}" class="method-btn ${isSel ? 'active py-2.5 px-3 rounded-xl bg-emerald-600/20 border border-emerald-500 text-emerald-300 font-bold' : 'py-2.5 px-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200 font-bold'} text-xs flex flex-col items-center justify-center space-y-1 transition-all">
        <span class="truncate max-w-[90px]">${m.name}</span>
        <span class="text-[10px] ${isSel ? 'text-emerald-400/80' : 'text-gray-500'} font-normal">${badge}</span>
      </button>
    `;
  }).join('');
}

function selectDepositMethod(method) {
  triggerHaptic('light');
  state.selectedMethod = method.toLowerCase();
  renderWalletMethodButtons();
  renderPaymentMethodDetails();
}

function renderPaymentMethodDetails() {
  const methodKey = state.selectedMethod.toLowerCase();
  const info = state.paymentMethods[methodKey] || Object.values(state.paymentMethods)[0] || {
    name: 'Telebirr',
    account: '0906818924',
    holder: 'Mohammed Abdirahman Ibrahim'
  };

  const accountNum = info.account_number || info.account || '0906818924';
  const holderName = info.account_name || info.holder || 'Mohammed Abdirahman Ibrahim';

  const titleEl = document.getElementById('depositMethodTitle');
  const numEl = document.getElementById('depositAccountNumber');
  const holderEl = document.getElementById('depositAccountHolder');

  if (titleEl) titleEl.textContent = `${info.name} Account`;
  if (numEl) numEl.textContent = accountNum;
  if (holderEl) holderEl.textContent = holderName;
}

function copyAccountInfo() {
  const methodKey = state.selectedMethod.toLowerCase();
  const info = state.paymentMethods[methodKey] || Object.values(state.paymentMethods)[0];
  const num = info?.account_number || info?.account || '0906818924';

  triggerHaptic('light');
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.getElementById('copyBtnText');
    if (btn) {
      btn.textContent = 'Copied! ✓';
      setTimeout(() => { btn.textContent = 'Copy Account'; }, 2000);
    }
    showToast(`${info.name || 'Account'} copied!`);
  });
}

async function submitDeposit(e) {
  e.preventDefault();
  triggerHaptic('medium');

  const amountInput = document.getElementById('depositAmountInput');
  const receiptInput = document.getElementById('depositReceiptInput');
  const submitBtn = document.getElementById('btnSubmitDeposit');

  const amount = parseFloat(amountInput.value);
  const receiptRaw = receiptInput.value.trim();

  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid amount in ETB.', true);
    return;
  }

  if (!receiptRaw) {
    showToast('Please paste your SMS receipt text.', true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="animate-spin mr-1">⏳</span> Verifying receipt...`;

  try {
    const res = await fetch('../api/deposit.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({
        amount: amount,
        payment_method: state.selectedMethod,
        receipt_raw: receiptRaw,
        initData: state.initData
      })
    });

    const data = await res.json();

    if (data.error) {
      triggerHaptic('error');
      showToast(data.error, true);
      return;
    }

    triggerHaptic('success');
    showToast('Deposit submitted! Verification in progress.');

    // Clear form inputs
    amountInput.value = '';
    receiptInput.value = '';

  } catch (err) {
    console.error('Deposit submit error:', err);
    triggerHaptic('error');
    showToast('Network error during deposit submission.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Submit Deposit for Verification</span>`;
    setupIcons();
  }
}

// ==========================================================
// 6. ORDERS VIEW
// ==========================================================
async function loadOrders() {
  triggerHaptic('light');
  const container = document.getElementById('ordersList');
  container.innerHTML = `
    <div class="p-4 rounded-xl bg-gray-900/60 border border-gray-800 animate-pulse h-24"></div>
  `;

  try {
    const res = await fetch('../api/orders.php', {
      method: 'GET',
      headers: {
        'X-Telegram-Init-Data': state.initData
      }
    });

    const data = await res.json();
    if (data.orders) {
      state.orders = data.orders;
      renderOrders();
    }
  } catch (err) {
    console.error('Orders fetch error:', err);
    container.innerHTML = `<div class="text-xs text-red-400 text-center py-6">Could not load orders.</div>`;
  }
}

function renderOrders() {
  const container = document.getElementById('ordersList');
  if (!container) return;

  if (state.orders.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 space-y-3">
        <i data-lucide="package-open" class="w-12 h-12 mx-auto text-gray-600"></i>
        <div class="space-y-1">
          <p class="text-xs font-bold text-gray-300">No Orders Yet</p>
          <p class="text-[11px] text-gray-500">Items you purchase will be permanently saved here.</p>
        </div>
        <button onclick="switchTab('store')" class="mt-2 px-4 py-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold">
          Explore Store
        </button>
      </div>
    `;
    setupIcons();
    return;
  }

  container.innerHTML = state.orders.map(ord => {
    const dateFormatted = new Date(ord.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const escapedPayload = ord.delivered_payload.replace(/'/g, "\\'");

    return `
      <div class="p-4 rounded-2xl bg-gray-900 border border-gray-800 space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">${ord.category || 'Digital'}</span>
            <h4 class="text-xs font-bold text-white">${ord.product_name}</h4>
            <span class="text-[10px] text-gray-500">${dateFormatted} • Order #${ord.id}</span>
          </div>
          <span class="text-xs font-extrabold text-emerald-400">${ord.price_paid.toFixed(2)} ETB</span>
        </div>

        <div class="p-2.5 bg-black/60 border border-gray-800 rounded-xl font-mono text-xs text-emerald-300 break-all select-all">
          ${ord.delivered_payload}
        </div>

        <button onclick="copyToClipboard('${escapedPayload}', this)" class="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Copy Details</span>
        </button>
      </div>
    `;
  }).join('');

  setupIcons();
}

// ==========================================================
// 7. INVITE & REFERRALS
// ==========================================================
function copyReferralLink() {
  const linkInput = document.getElementById('referralLinkInput');
  if (!linkInput.value) return;

  triggerHaptic('light');
  navigator.clipboard.writeText(linkInput.value).then(() => {
    showToast('Referral link copied! Share with your network.');
  });
}

function shareReferralLink() {
  const link = document.getElementById('referralLinkInput').value;
  if (!link) return;

  triggerHaptic('medium');
  const shareText = encodeURIComponent("Hey! Check out this Telegram store for verified Gemini, Canva Pro, and VPN accounts at great ETB rates:");
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`;

  if (state.tg && typeof state.tg.openTelegramLink === 'function') {
    state.tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}

// ==========================================================
// 8. NAVIGATION, MODALS & TOAST UTILITIES
// ==========================================================
function switchTab(tabId) {
  triggerHaptic('light');

  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.className = 'nav-item flex flex-col items-center py-1 text-gray-500 hover:text-gray-300 transition-colors';
  });

  // Activate selected tab
  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);

  if (targetTab) targetTab.classList.add('active');
  if (targetNav) {
    if (tabId === 'admin') {
      targetNav.className = 'nav-item active flex flex-col items-center py-1 text-amber-400 transition-colors';
    } else {
      targetNav.className = 'nav-item active flex flex-col items-center py-1 text-emerald-400 transition-colors';
    }
  }

  // Specific tab triggers
  if (tabId === 'orders') {
    loadOrders();
  } else if (tabId === 'admin') {
    loadAdminAll();
  }
}

function closeModal(modalId) {
  triggerHaptic('light');
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

function copyToClipboard(text, btnElement) {
  triggerHaptic('medium');
  navigator.clipboard.writeText(text).then(() => {
    if (btnElement) {
      const originalHtml = btnElement.innerHTML;
      btnElement.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i><span class="text-emerald-400">Copied!</span>`;
      setupIcons();
      setTimeout(() => {
        btnElement.innerHTML = originalHtml;
        setupIcons();
      }, 2000);
    }
    showToast('Copied to clipboard!');
  });
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `fixed top-5 left-1/2 -translate-x-1/2 z-50 font-semibold text-xs px-4 py-2 rounded-full shadow-xl transition-all duration-300 transform translate-y-0 opacity-100 ${
    isError ? 'bg-red-600 text-white' : 'bg-emerald-500 text-slate-950'
  }`;

  setTimeout(() => {
    toast.className = toast.className.replace('opacity-100', 'opacity-0').replace('translate-y-0', '-translate-y-2');
  }, 2800);
}

// ==========================================================
// 9. 👑 ADMIN DASHBOARD CONTROLLER (Prices, Images, Vault Keys)
// ==========================================================

async function loadAdminAll() {
  triggerHaptic('light');
  await Promise.all([
    loadAdminStats(),
    loadAdminProducts(),
    loadAdminDeposits()
  ]);
}

async function loadAdminStats() {
  try {
    const res = await fetch('../api/admin.php?action=stats', {
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      }
    });
    const data = await res.json();
    if (data.stats) {
      const s = data.stats;
      const revEl = document.getElementById('adminTotalRevenue');
      const ordEl = document.getElementById('adminTotalOrders');
      const keysEl = document.getElementById('adminAvailableKeys');
      const depEl = document.getElementById('adminPendingDeposits');
      const badgeEl = document.getElementById('adminPendingBadge');

      if (revEl) revEl.textContent = s.total_revenue.toFixed(2);
      if (ordEl) ordEl.textContent = s.orders_count;
      if (keysEl) keysEl.textContent = s.available_keys;
      if (depEl) depEl.textContent = s.pending_deposits;

      if (badgeEl) {
        badgeEl.textContent = s.pending_deposits;
        if (s.pending_deposits > 0) {
          badgeEl.classList.remove('hidden');
        } else {
          badgeEl.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.error('Failed to load admin stats:', err);
  }
}

async function loadAdminProducts() {
  try {
    const res = await fetch('../api/admin.php?action=products', {
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      }
    });
    const data = await res.json();
    if (data.products) {
      state.adminProducts = data.products;
      renderAdminProducts();
    }
  } catch (err) {
    console.error('Failed to load admin products:', err);
  }
}

function renderAdminProducts() {
  const container = document.getElementById('adminProductsContainer');
  if (!container) return;

  if (state.adminProducts.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-gray-500 space-y-2">
        <i data-lucide="package-x" class="w-8 h-8 mx-auto text-gray-600"></i>
        <p class="text-xs">No products in catalog yet.</p>
      </div>
    `;
    setupIcons();
    return;
  }

  container.innerHTML = state.adminProducts.map(p => {
    const isOutOfStock = p.unsold_keys <= 0;
    const stockBadge = isOutOfStock
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">0 In Stock</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">${p.unsold_keys} Available</span>`;

    const statusBadge = p.is_active === 1
      ? `<span class="text-[10px] text-emerald-400">● Active</span>`
      : `<span class="text-[10px] text-gray-500">○ Hidden</span>`;

    return `
      <div class="p-4 rounded-2xl bg-gray-900 border ${p.is_active ? 'border-gray-800' : 'border-gray-800/40 opacity-70'} space-y-3 transition-all">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-3">
            <img src="${p.icon_url || 'https://img.icons8.com/color/480/box.png'}" alt="icon" onerror="this.src='https://img.icons8.com/color/480/box.png'" class="w-10 h-10 object-contain rounded-xl bg-black/40 p-1 border border-gray-800" />
            <div>
              <div class="flex items-center space-x-1.5">
                <h4 class="text-xs font-bold text-white leading-snug">${p.name}</h4>
                ${p.badge ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">${p.badge}</span>` : ''}
              </div>
              <div class="flex items-center space-x-2 mt-0.5">
                <span class="text-[10px] text-gray-400">${p.category}</span>
                <span class="text-[10px] text-gray-600">•</span>
                ${statusBadge}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs font-extrabold text-white">${p.price_etb.toFixed(2)} <span class="text-[10px] text-emerald-400 font-bold">ETB</span></div>
            <div class="mt-1">${stockBadge}</div>
          </div>
        </div>

        <!-- Management Action Buttons -->
        <div class="grid grid-cols-4 gap-1.5 pt-2 border-t border-gray-800/80 text-[11px] font-semibold">
          <button onclick="openEditProductModal(${p.id})" class="py-1.5 px-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-300 flex items-center justify-center space-x-1 transition-colors">
            <i data-lucide="edit-2" class="w-3 h-3"></i>
            <span>Edit</span>
          </button>
          <button onclick="openAddKeysModal(${p.id})" class="py-1.5 px-2 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 flex items-center justify-center space-x-1 transition-colors">
            <i data-lucide="plus" class="w-3 h-3"></i>
            <span>+ Keys</span>
          </button>
          <button onclick="openVaultInspector(${p.id})" class="py-1.5 px-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 flex items-center justify-center space-x-1 transition-colors">
            <i data-lucide="layers" class="w-3 h-3"></i>
            <span>Inspect</span>
          </button>
          <button onclick="toggleProductStatus(${p.id})" class="py-1.5 px-2 rounded-lg ${p.is_active ? 'bg-gray-800 text-gray-400 hover:text-red-400' : 'bg-emerald-950/30 text-emerald-400'} flex items-center justify-center space-x-1 transition-colors">
            <i data-lucide="${p.is_active ? 'eye-off' : 'eye'}" class="w-3 h-3"></i>
            <span>${p.is_active ? 'Hide' : 'Show'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  setupIcons();
}

function switchAdminSection(section) {
  triggerHaptic('light');
  state.adminSection = section;

  const btnProd = document.getElementById('btnAdminSection-products');
  const btnDep = document.getElementById('btnAdminSection-deposits');
  const btnPay = document.getElementById('btnAdminSection-payments');
  const panelProd = document.getElementById('adminPanel-products');
  const panelDep = document.getElementById('adminPanel-deposits');
  const panelPay = document.getElementById('adminPanel-payments');

  // Reset buttons
  if (btnProd) btnProd.className = 'px-3 py-1.5 rounded-xl bg-gray-800 text-gray-400 hover:text-gray-200 transition-all whitespace-nowrap';
  if (btnDep) btnDep.className = 'px-3 py-1.5 rounded-xl bg-gray-800 text-gray-400 hover:text-gray-200 transition-all flex items-center space-x-1.5 whitespace-nowrap';
  if (btnPay) btnPay.className = 'px-3 py-1.5 rounded-xl bg-gray-800 text-gray-400 hover:text-gray-200 transition-all flex items-center space-x-1 whitespace-nowrap';

  // Hide panels
  if (panelProd) panelProd.classList.add('hidden');
  if (panelDep) panelDep.classList.add('hidden');
  if (panelPay) panelPay.classList.add('hidden');

  if (section === 'products') {
    if (btnProd) btnProd.className = 'px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold transition-all shadow-sm whitespace-nowrap';
    if (panelProd) panelProd.classList.remove('hidden');
  } else if (section === 'deposits') {
    if (btnDep) btnDep.className = 'px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold transition-all shadow-sm flex items-center space-x-1.5 whitespace-nowrap';
    if (panelDep) panelDep.classList.remove('hidden');
    loadAdminDeposits();
  } else if (section === 'payments') {
    if (btnPay) btnPay.className = 'px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold transition-all shadow-sm flex items-center space-x-1 whitespace-nowrap';
    if (panelPay) panelPay.classList.remove('hidden');
    loadAdminPaymentMethods();
  }
}

async function loadAdminDeposits() {
  try {
    const res = await fetch(`../api/admin.php?action=deposits&filter=${state.adminDepositFilter}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      }
    });
    const data = await res.json();
    if (data.deposits) {
      state.adminDeposits = data.deposits;
      renderAdminDeposits();
    }
  } catch (err) {
    console.error('Failed to load admin deposits:', err);
  }
}

function filterAdminDeposits(filter) {
  triggerHaptic('light');
  state.adminDepositFilter = filter;

  const btnPend = document.getElementById('depFilter-pending');
  const btnAll = document.getElementById('depFilter-all');

  if (filter === 'pending') {
    btnPend.className = 'px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold';
    btnAll.className = 'px-2.5 py-1 rounded-lg bg-gray-800 text-gray-400 text-[11px]';
  } else {
    btnAll.className = 'px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold';
    btnPend.className = 'px-2.5 py-1 rounded-lg bg-gray-800 text-gray-400 text-[11px]';
  }

  loadAdminDeposits();
}

function renderAdminDeposits() {
  const container = document.getElementById('adminDepositsContainer');
  if (!container) return;

  if (state.adminDeposits.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-gray-500 space-y-2">
        <i data-lucide="check-circle-2" class="w-8 h-8 mx-auto text-emerald-500/50"></i>
        <p class="text-xs">No ${state.adminDepositFilter} deposits in queue!</p>
      </div>
    `;
    setupIcons();
    return;
  }

  container.innerHTML = state.adminDeposits.map(d => {
    const isPending = d.status === 'pending';
    const statusBadge = isPending
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">Pending Review</span>`
      : d.status === 'approved'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Approved</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">Rejected</span>`;

    return `
      <div class="p-4 rounded-2xl bg-gray-900 border ${isPending ? 'border-amber-500/30' : 'border-gray-800'} space-y-3">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <span class="text-xs font-bold text-white">${d.first_name || 'User'}</span>
              <span class="text-[10px] text-gray-400">${d.username ? '@' + d.username : 'ID: ' + d.telegram_id}</span>
            </div>
            <div class="text-[10px] text-gray-500 mt-0.5">
              ${d.payment_method} • Txn: <span class="text-emerald-400 font-mono font-bold">${d.extracted_txn_id || 'N/A'}</span>
            </div>
          </div>
          <div class="text-right">
            <div class="text-sm font-extrabold text-amber-300">${d.amount.toFixed(2)} ETB</div>
            <div class="mt-1">${statusBadge}</div>
          </div>
        </div>

        <div class="p-2.5 bg-black/60 border border-gray-800 rounded-xl font-mono text-[11px] text-gray-300 break-all select-all max-h-20 overflow-y-auto">
          ${d.receipt_raw}
        </div>

        ${isPending ? `
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button onclick="adminRejectDeposit(${d.id})" class="py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs font-bold flex items-center justify-center space-x-1 transition-colors">
              <i data-lucide="x" class="w-3.5 h-3.5"></i>
              <span>Reject</span>
            </button>
            <button onclick="adminApproveDeposit(${d.id})" class="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center justify-center space-x-1 shadow-md transition-colors">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
              <span>Approve & Credit</span>
            </button>
          </div>
        ` : `
          <div class="text-[10px] text-gray-500 text-right">
            Processed: ${d.reviewed_at || d.created_at}
          </div>
        `}
      </div>
    `;
  }).join('');

  setupIcons();
}

function openNewProductModal() {
  triggerHaptic('light');
  document.getElementById('editProductModalTitle').textContent = 'Create New Product';
  document.getElementById('editProductId').value = '0';
  document.getElementById('editProductName').value = '';
  document.getElementById('editProductCategory').value = 'AI Tools';
  document.getElementById('editProductPrice').value = '';
  document.getElementById('editProductIcon').value = 'https://img.icons8.com/color/480/box.png';
  document.getElementById('editProductIconPreview').src = 'https://img.icons8.com/color/480/box.png';
  document.getElementById('editProductBadge').value = 'HOT';
  document.getElementById('editProductActive').checked = true;
  document.getElementById('editProductDescription').value = '';

  const modal = document.getElementById('editProductModal');
  if (modal) modal.classList.remove('hidden');
}

function openEditProductModal(productId) {
  triggerHaptic('light');
  const prod = state.adminProducts.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('editProductModalTitle').textContent = `Edit Product #${prod.id}`;
  document.getElementById('editProductId').value = prod.id;
  document.getElementById('editProductName').value = prod.name;
  document.getElementById('editProductCategory').value = prod.category;
  document.getElementById('editProductPrice').value = prod.price_etb;
  document.getElementById('editProductIcon').value = prod.icon_url || '';
  document.getElementById('editProductIconPreview').src = prod.icon_url || 'https://img.icons8.com/color/480/box.png';
  document.getElementById('editProductBadge').value = prod.badge || '';
  document.getElementById('editProductActive').checked = prod.is_active === 1;
  document.getElementById('editProductDescription').value = prod.description || '';

  const modal = document.getElementById('editProductModal');
  if (modal) modal.classList.remove('hidden');
}

function previewEditIcon() {
  const url = document.getElementById('editProductIcon').value;
  const img = document.getElementById('editProductIconPreview');
  if (img && url) {
    img.src = url;
  }
}

async function handleSaveProduct(e) {
  e.preventDefault();
  triggerHaptic('medium');

  const btn = document.getElementById('btnSaveProduct');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>Saving...</span>`;

  const payload = {
    action: 'save_product',
    id: parseInt(document.getElementById('editProductId').value, 10),
    name: document.getElementById('editProductName').value.trim(),
    category: document.getElementById('editProductCategory').value.trim(),
    price_etb: parseFloat(document.getElementById('editProductPrice').value),
    icon_url: document.getElementById('editProductIcon').value.trim(),
    badge: document.getElementById('editProductBadge').value.trim(),
    is_active: document.getElementById('editProductActive').checked ? 1 : 0,
    description: document.getElementById('editProductDescription').value.trim(),
    initData: state.initData
  };

  try {
    const res = await fetch('../api/admin.php?action=save_product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message || 'Product saved successfully!');
      closeModal('editProductModal');
      await loadAdminProducts();
      await loadCatalog(); // sync customer catalog
    }
  } catch (err) {
    showToast('Failed to save product.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
    setupIcons();
  }
}

async function toggleProductStatus(productId) {
  triggerHaptic('light');
  try {
    const res = await fetch('../api/admin.php?action=toggle_product', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({ id: productId, initData: state.initData })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message);
      await loadAdminProducts();
      await loadCatalog();
    }
  } catch (err) {
    showToast('Failed to update status.', true);
  }
}

function openAddKeysModal(productId) {
  triggerHaptic('light');
  const prod = state.adminProducts.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('addKeysProductId').value = prod.id;
  document.getElementById('addKeysProductName').textContent = `${prod.name} (Current Stock: ${prod.unsold_keys})`;
  document.getElementById('addKeysTextarea').value = '';

  const modal = document.getElementById('addKeysModal');
  if (modal) modal.classList.remove('hidden');
}

async function handleSubmitKeys(e) {
  e.preventDefault();
  triggerHaptic('medium');

  const btn = document.getElementById('btnAddKeysSubmit');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>Uploading...</span>`;

  const payload = {
    action: 'add_keys',
    product_id: parseInt(document.getElementById('addKeysProductId').value, 10),
    keys: document.getElementById('addKeysTextarea').value,
    initData: state.initData
  };

  try {
    const res = await fetch('../api/admin.php?action=add_keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message);
      closeModal('addKeysModal');
      await loadAdminProducts();
      await loadAdminStats();
      await loadCatalog();
    }
  } catch (err) {
    showToast('Failed to upload keys.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
    setupIcons();
  }
}

async function openVaultInspector(productId) {
  triggerHaptic('light');
  const prod = state.adminProducts.find(p => p.id === productId);
  const titleEl = document.getElementById('vaultInspectorTitle');
  const listEl = document.getElementById('vaultKeysList');

  if (titleEl) titleEl.textContent = prod ? `Viewing stock for: ${prod.name}` : 'Stock Keys';
  if (listEl) listEl.innerHTML = `<div class="p-4 text-center text-gray-400">Loading keys...</div>`;

  const modal = document.getElementById('vaultKeysModal');
  if (modal) modal.classList.remove('hidden');

  try {
    const res = await fetch(`../api/admin.php?action=vault_keys&product_id=${productId}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      }
    });
    const data = await res.json();

    if (!data.keys || data.keys.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-gray-500 text-xs">No keys currently in vault. Use "+ Keys" to add some!</div>`;
      return;
    }

    listEl.innerHTML = data.keys.map(k => `
      <div class="p-2.5 rounded-xl bg-black/60 border ${k.is_sold ? 'border-gray-800 opacity-60' : 'border-emerald-500/30'} space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-[10px] ${k.is_sold ? 'text-gray-500 font-bold' : 'text-emerald-400 font-bold'}">
            ${k.is_sold ? '✓ SOLD' : '● AVAILABLE IN STOCK'}
          </span>
          ${!k.is_sold ? `
            <button onclick="deleteVaultKey(${k.id}, ${productId})" class="text-red-400 hover:text-red-300 text-[10px] font-bold flex items-center space-x-1">
              <i data-lucide="trash-2" class="w-3 h-3"></i>
              <span>Delete</span>
            </button>
          ` : ''}
        </div>
        <div class="font-mono text-[11px] text-gray-200 break-all select-all bg-gray-900/80 p-1.5 rounded">
          ${k.item_payload}
        </div>
      </div>
    `).join('');

    setupIcons();
  } catch (err) {
    listEl.innerHTML = `<div class="p-4 text-center text-red-400 text-xs">Failed to load vault keys.</div>`;
  }
}

async function deleteVaultKey(keyId, productId) {
  if (!confirm('Are you sure you want to delete this unsold key from stock?')) return;

  try {
    const res = await fetch('../api/admin.php?action=delete_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({ key_id: keyId, initData: state.initData })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast('Key deleted.');
      await openVaultInspector(productId);
      await loadAdminProducts();
      await loadCatalog();
    }
  } catch (err) {
    showToast('Failed to delete key.', true);
  }
}

async function adminApproveDeposit(depositId) {
  triggerHaptic('medium');
  try {
    const res = await fetch('../api/admin.php?action=review_deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({
        deposit_id: depositId,
        decision: 'approved',
        initData: state.initData
      })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message || 'Deposit approved!');
      await loadAdminDeposits();
      await loadAdminStats();
    }
  } catch (err) {
    showToast('Failed to approve deposit.', true);
  }
}

async function adminRejectDeposit(depositId) {
  if (!confirm('Are you sure you want to reject this deposit request?')) return;
  triggerHaptic('medium');

  try {
    const res = await fetch('../api/admin.php?action=review_deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({
        deposit_id: depositId,
        decision: 'rejected',
        initData: state.initData
      })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message || 'Deposit rejected.');
      await loadAdminDeposits();
      await loadAdminStats();
    }
  } catch (err) {
    showToast('Failed to reject deposit.', true);
  }
}

// ==========================================================
// 10. 👑 ADMIN: PAYMENT RECEIVING ACCOUNTS (Telebirr, CBE, etc.)
// ==========================================================

async function loadAdminPaymentMethods() {
  try {
    const res = await fetch('../api/admin.php?action=payment_methods', {
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      }
    });
    const data = await res.json();
    if (data.payment_methods) {
      state.adminPaymentMethods = data.payment_methods;
      renderAdminPaymentMethods();
    }
  } catch (err) {
    console.error('Failed to load admin payment methods:', err);
  }
}

function renderAdminPaymentMethods() {
  const container = document.getElementById('adminPaymentsContainer');
  if (!container) return;

  if (!state.adminPaymentMethods || state.adminPaymentMethods.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-gray-500 space-y-2">
        <i data-lucide="landmark" class="w-8 h-8 mx-auto text-emerald-500/50"></i>
        <p class="text-xs">No payment accounts found. Tap "Add Account" to create one!</p>
      </div>
    `;
    setupIcons();
    return;
  }

  container.innerHTML = state.adminPaymentMethods.map(m => {
    const isActive = m.is_active !== 0;
    const accountNum = m.account_number || m.account || '';
    const accountName = m.account_name || m.holder || '';
    const instructions = m.instructions || '';

    return `
      <div class="p-4 rounded-2xl bg-gray-900 border ${isActive ? 'border-gray-800' : 'border-gray-800/40 opacity-70'} space-y-3">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <i data-lucide="landmark" class="w-5 h-5 text-emerald-400"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h4 class="text-xs font-bold text-white">${m.name}</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-mono ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'}">
                  ${isActive ? 'Active' : 'Disabled'}
                </span>
              </div>
              <div class="text-xs font-mono font-bold text-emerald-400 mt-0.5">${accountNum}</div>
              <div class="text-[10px] text-gray-400 truncate max-w-[200px]">${accountName}</div>
            </div>
          </div>
          <button onclick="togglePaymentStatus(${m.id})" class="py-1 px-2.5 rounded-lg ${isActive ? 'bg-gray-800 text-gray-400 hover:text-red-400' : 'bg-emerald-950/40 text-emerald-400'} text-[10px] font-bold transition-colors">
            ${isActive ? 'Disable' : 'Enable'}
          </button>
        </div>

        ${instructions ? `<p class="text-[10px] text-gray-400 italic bg-black/40 p-2 rounded-lg border border-gray-800/50 leading-relaxed">${instructions}</p>` : ''}

        <div class="flex items-center space-x-2 pt-2 border-t border-gray-800/70">
          <button onclick="openEditPaymentModal(${m.id})" class="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-300 text-xs font-bold flex items-center justify-center space-x-1 transition-colors">
            <i data-lucide="edit-2" class="w-3 h-3"></i>
            <span>Edit Account</span>
          </button>
          <button onclick="copyToClipboard('${accountNum}', this)" class="py-1.5 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold flex items-center space-x-1 transition-colors">
            <i data-lucide="copy" class="w-3 h-3"></i>
            <span>Copy</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  setupIcons();
}

function openNewPaymentModal() {
  triggerHaptic('light');
  document.getElementById('editPaymentModalTitle').textContent = 'Add Bank / Payment Method';
  document.getElementById('editPaymentId').value = '';
  document.getElementById('editPaymentCode').value = '';
  document.getElementById('editPaymentName').value = '';
  document.getElementById('editPaymentNumber').value = '';
  document.getElementById('editPaymentHolder').value = 'Mohammed Abdirahman Ibrahim';
  document.getElementById('editPaymentInstructions').value = '';
  document.getElementById('editPaymentActive').checked = true;

  const modal = document.getElementById('editPaymentModal');
  if (modal) modal.classList.remove('hidden');
}

function openEditPaymentModal(id) {
  triggerHaptic('light');
  const m = state.adminPaymentMethods.find(item => item.id === id);
  if (!m) return;

  document.getElementById('editPaymentModalTitle').textContent = `Edit ${m.name}`;
  document.getElementById('editPaymentId').value = m.id;
  document.getElementById('editPaymentCode').value = m.code || '';
  document.getElementById('editPaymentName').value = m.name;
  document.getElementById('editPaymentNumber').value = m.account_number || m.account || '';
  document.getElementById('editPaymentHolder').value = m.account_name || m.holder || '';
  document.getElementById('editPaymentInstructions').value = m.instructions || '';
  document.getElementById('editPaymentActive').checked = m.is_active !== 0;

  const modal = document.getElementById('editPaymentModal');
  if (modal) modal.classList.remove('hidden');
}

async function handleSavePayment(e) {
  e.preventDefault();
  triggerHaptic('medium');

  const idVal = document.getElementById('editPaymentId').value;
  const payload = {
    id: idVal ? parseInt(idVal, 10) : null,
    code: document.getElementById('editPaymentCode').value,
    name: document.getElementById('editPaymentName').value.trim(),
    account_number: document.getElementById('editPaymentNumber').value.trim(),
    account_name: document.getElementById('editPaymentHolder').value.trim(),
    instructions: document.getElementById('editPaymentInstructions').value.trim(),
    is_active: document.getElementById('editPaymentActive').checked ? 1 : 0,
    initData: state.initData
  };

  const btn = document.getElementById('btnSavePayment');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Saving...';

  try {
    const res = await fetch('../api/admin.php?action=save_payment_method', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message || 'Payment account saved successfully! 🎉');
      closeModal('editPaymentModal');
      await loadAdminPaymentMethods();
      await authenticateUser();
    }
  } catch (err) {
    showToast('Failed to save payment account.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
    setupIcons();
  }
}

async function togglePaymentStatus(id) {
  triggerHaptic('medium');
  try {
    const res = await fetch('../api/admin.php?action=toggle_payment_method', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({ id, initData: state.initData })
    });

    const data = await res.json();
    if (data.error) {
      showToast(data.error, true);
    } else {
      showToast(data.message || 'Status updated.');
      await loadAdminPaymentMethods();
      await authenticateUser();
    }
  } catch (err) {
    showToast('Failed to toggle status.', true);
  }
}
