/**
 * YeneShop Mini App - Senior Engineering Frontend Controller
 * Fast, Resilient, Zero-Dependencies Architecture
 */

// Application State
const state = {
  tg: window.Telegram?.WebApp || null,
  initData: window.Telegram?.WebApp?.initData || '',
  user: {
    id: 7338533936,
    telegram_id: 7338533936,
    first_name: 'Store Administrator',
    username: 'AtkeAdmin',
    wallet_balance: 0.00,
    role: 'admin',
    is_admin: true,
    is_staff: true,
    referral_count: 0,
    orders_count: 0
  },
  products: [
    {
      id: 1,
      name: 'Gemini AI Pro 18m',
      category: 'AI Tools',
      price_etb: 385.00,
      cost_price_etb: 220.00,
      badge: 'POPULAR',
      stock_count: 558,
      icon_url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-gemini.png',
      description: 'Google Gemini AI Pro 18 Months subscription with 5TB Cloud storage.',
      how_to_use: "⚡ 18 Months Plan\n⚡ 5TB cloud storage included\n⚡ You can add 5 users\n⚡ No sharing — 100% private\n⚡ No card needed\n⚡ Works in any country, no verification\n⚡ Non-warranty\n⚡ May last before 18 Months sometimes\n\n📌 100% genuine Gemini AI Pro subscription activated on your own Gmail.\n📌 FULL FAMILY ACCOUNT — it is not an invite.\n\n💖 How to activate:\nPaste the received redeem link into your browser and click 'Activate Offer'. Your subscription will then be activated successfully.\n\n⚠️ Important:\nThe redeem link must be used within 24 hours of receiving the order.",
      variants: null
    },
    {
      id: 2,
      name: 'Canva Pro 3 Year',
      category: 'Design',
      price_etb: 300.00,
      cost_price_etb: 160.00,
      badge: 'POPULAR',
      stock_count: 85,
      icon_url: 'https://img.icons8.com/color/480/canva.png',
      description: 'Official Canva Pro 3 Years team invitation upgrade to your personal email.',
      how_to_use: "⚡ 3 Years Licensed Canva Pro Access\n⚡ Connects directly to your private email\n⚡ Magic Studio, AI image generator & background remover\n⚡ Millions of premium fonts, templates & stock media\n⚡ 1TB Cloud Storage included",
      variants: null
    },
    {
      id: 3,
      name: 'Duolingo Super 12m',
      category: 'Services',
      price_etb: 1950.00,
      cost_price_etb: 1400.00,
      badge: null,
      stock_count: 20,
      icon_url: 'https://img.icons8.com/color/480/duolingo-logo.png',
      description: 'Super Duolingo 1 Year plan. Unlimited hearts, zero ads, and offline lessons.',
      how_to_use: "⚡ Official family membership invite sent to your Duolingo email.\n⚡ Instant activation on all iOS, Android, and web devices.",
      variants: null
    },
    {
      id: 4,
      name: 'Mobbin 10x Seat 12m',
      category: 'Design',
      price_etb: 1850.00,
      cost_price_etb: 1300.00,
      badge: null,
      stock_count: 2,
      icon_url: 'https://img.icons8.com/ios-filled/500/m.png',
      description: 'Mobbin UI/UX Design patterns repository 12 Months shared seat.',
      how_to_use: "⚡ Direct account credentials or team invite sent upon purchase.",
      variants: null
    },
    {
      id: 5,
      name: 'Telegram Premium',
      category: 'Social',
      price_etb: 2500.00,
      cost_price_etb: 1900.00,
      badge: null,
      stock_count: 15,
      icon_url: 'https://img.icons8.com/color/480/telegram-app.png',
      description: 'Official Telegram Premium upgrade. 4GB uploads, voice-to-text, exclusive badges.',
      how_to_use: "⚡ Delivered via official Telegram Gift or direct username activation.\n⚡ No account password required.\n⚡ Works on all devices instantly.",
      variants: [
        { duration: '3 months', price_etb: 2500.00, cost_price_etb: 1900.00 },
        { duration: '6 months', price_etb: 3400.00, cost_price_etb: 2600.00 },
        { duration: '12 months', price_etb: 6200.00, cost_price_etb: 4800.00 }
      ]
    },
    {
      id: 6,
      name: 'SoundCloud Artist Pro',
      category: 'Services',
      price_etb: 400.00,
      cost_price_etb: 250.00,
      badge: null,
      stock_count: 8,
      icon_url: 'https://img.icons8.com/color/480/soundcloud.png',
      description: 'SoundCloud Next Pro creator subscription with unlimited track uploads.',
      how_to_use: "⚡ Direct voucher link delivered.\n⚡ Sign in and claim Next Pro creator status.",
      variants: null
    },
    {
      id: 7,
      name: 'Railway Hobby 12m',
      category: 'Services',
      price_etb: 3000.00,
      cost_price_etb: 2200.00,
      badge: null,
      stock_count: 4,
      icon_url: 'https://img.icons8.com/ios-filled/500/train.png',
      description: '1-Year Railway Hobby plan for hosting fullstack apps, background workers & bots.',
      how_to_use: "⚡ Redeem voucher code inside Railway Dashboard -> Billing.",
      variants: null
    },
    {
      id: 8,
      name: 'Replit Core 12m',
      category: 'Services',
      price_etb: 7500.00,
      cost_price_etb: 5800.00,
      badge: null,
      stock_count: 4,
      icon_url: 'https://img.icons8.com/color/480/replit.png',
      description: 'Replit Core 1 Year plan with Ghostwriter AI Agent & private cloud VMs.',
      how_to_use: "⚡ Invitation voucher link sent directly upon purchase.",
      variants: null
    },
    {
      id: 9,
      name: 'Lovable Lite 12m',
      category: 'Services',
      price_etb: 2800.00,
      cost_price_etb: 2000.00,
      badge: null,
      stock_count: 10,
      icon_url: 'https://img.icons8.com/color/480/heart-with-pulse.png',
      description: 'Lovable AI Web App Builder 12 Months Lite access with monthly credits.',
      how_to_use: "⚡ Account activation voucher delivered immediately.",
      variants: null
    },
    {
      id: 10,
      name: 'NordVPN 3m',
      category: 'VPN & Security',
      price_etb: 1350.00,
      cost_price_etb: 950.00,
      badge: null,
      stock_count: 5,
      icon_url: 'https://img.icons8.com/color/480/nordvpn.png',
      description: 'High-speed dedicated NordVPN account with ultra-secure servers.',
      how_to_use: "⚡ Dedicated credentials delivered.\n⚡ Connect up to 6 devices simultaneously.",
      variants: null
    }
  ],
  orders: [],
  activeCategory: 'All',
  searchQuery: '',
  selectedMethod: 'telebirr',
  paymentMethods: {
    telebirr: { name: 'Telebirr', account: '0906818924', holder: 'Mohammed Abdirahman Ibrahim' },
    cbe: { name: 'Commercial Bank of Ethiopia (CBE)', account: '1000233801837', holder: 'Mohammed Abdirahman Ibrahim' },
    ebirr: { name: 'E-Birr (Coop / Kaafi)', account: '0906818924', holder: 'Mohammed Abdirahman Ibrahim' }
  },
  receiptImageBase64: null,
  pendingPurchaseProduct: null,
  pendingPurchaseVariant: null,
  activeVariantProduct: null,
  selectedVariant: null,
  deliveredPayload: '',
  adminProducts: [],
  adminDeposits: [],
  adminPaymentMethods: [],
  adminStaff: [],
  adminSection: 'products',
  adminDepositFilter: 'pending',
  supportHandle: 'Atke_Support'
};

// ==========================================================
// 1. LIFECYCLE & TELEGRAM SDK INTEGRATION
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupTelegramSDK();
  renderProducts(); // Instant render from built-in state
  renderWalletMethodButtons();
  renderPaymentMethodDetails();
  setupIcons();

  // Asynchronous background hydration
  authenticateUser().catch(console.warn);
  loadCatalog().catch(console.warn);
});

function initTheme() {
  const saved = localStorage.getItem('yeneshop_theme');
  const isDark = saved ? saved === 'dark' : true;

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon(isDark);
  syncTelegramTheme(isDark);
}

function toggleTheme() {
  triggerHaptic('light');
  const isDark = !document.documentElement.classList.contains('dark');
  if (isDark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('yeneshop_theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('yeneshop_theme', 'light');
  }
  updateThemeIcon(isDark);
  syncTelegramTheme(isDark);
}

function updateThemeIcon(isDark) {
  const icon = document.getElementById('themeToggleIcon');
  if (!icon) return;
  icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  setupIcons();
}

function syncTelegramTheme(isDark) {
  if (state.tg) {
    try {
      const bg = isDark ? '#0b0f19' : '#ffffff';
      if (typeof state.tg.setHeaderColor === 'function') state.tg.setHeaderColor(bg);
      if (typeof state.tg.setBackgroundColor === 'function') state.tg.setBackgroundColor(bg);
    } catch (e) {}
  }
}

function setupTelegramSDK() {
  if (state.tg) {
    try {
      state.tg.ready();
      state.tg.expand();
      if (typeof state.tg.enableClosingConfirmation === 'function') {
        state.tg.enableClosingConfirmation();
      }
    } catch (e) {}
  }

  // Localhost test data fallback
  if (!state.initData) {
    state.initData = 'mock_test=1&user=%7B%22id%22%3A7338533936%2C%22first_name%22%3A%22Store%20Administrator%22%2C%22username%22%3A%22AtkeAdmin%22%7D&auth_date=1770000000&hash=mock';
  }
}

function setupIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function triggerHaptic(type = 'light') {
  if (!state.tg?.HapticFeedback) return;
  try {
    if (type === 'success') state.tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'error') state.tg.HapticFeedback.notificationOccurred('error');
    else if (type === 'medium') state.tg.HapticFeedback.impactOccurred('medium');
    else state.tg.HapticFeedback.impactOccurred('light');
  } catch (e) {}
}

// ==========================================================
// 2. USER PROFILE & AUTHENTICATION
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

    if (!res.ok) return;
    const data = await res.json();
    if (data.user) {
      state.user = data.user;
      if (data.payment_methods) state.paymentMethods = data.payment_methods;
      if (data.support_handle) {
        state.supportHandle = data.support_handle;
        const btn = document.getElementById('supportFloatingBtn');
        if (btn) btn.href = `https://t.me/${data.support_handle.replace(/^@/, '')}`;
      }
      updateUserUI();
    }
  } catch (err) {
    console.warn('Auth offline / using client state:', err);
    updateUserUI(); // Render state defaults
  }
}

function updateUserUI() {
  const u = state.user;
  const nameEl = document.getElementById('userName');
  const handleEl = document.getElementById('userHandle');
  const avatarEl = document.getElementById('userAvatar');
  const headerBal = document.getElementById('headerBalance');
  const walletBalBig = document.getElementById('walletBalanceBig');
  const friendsCount = document.getElementById('referralFriendsCount');
  const ordersCount = document.getElementById('referralOrdersCount');
  const refLinkInput = document.getElementById('referralLinkInput');

  if (nameEl) nameEl.textContent = u.first_name || 'User';
  if (handleEl) handleEl.textContent = u.username ? `@${u.username}` : `ID: ${u.telegram_id}`;
  if (avatarEl) avatarEl.textContent = (u.first_name || 'U').charAt(0).toUpperCase();

  const formattedBal = (u.wallet_balance || 0).toFixed(2);
  if (headerBal) headerBal.textContent = `${formattedBal} ETB`;
  if (walletBalBig) walletBalBig.innerHTML = `${formattedBal} <span style="font-size:14px;color:var(--brand-green);font-weight:700;">ETB</span>`;

  if (friendsCount) friendsCount.textContent = u.referral_count || 0;
  if (ordersCount) ordersCount.textContent = u.orders_count || 0;
  if (refLinkInput) refLinkInput.value = `https://t.me/atke_digital_bot?start=ref_${u.telegram_id}`;

  const refProgressText = document.getElementById('refProgressText');
  const refFriendsRemaining = document.getElementById('refFriendsRemaining');
  const refCount = u.referral_count || 0;
  if (refProgressText) refProgressText.textContent = refCount;
  if (refFriendsRemaining) {
    const rem = Math.max(0, 5 - refCount);
    refFriendsRemaining.textContent = rem > 0 ? `${rem} more friends to unlock your reward` : '🎉 Reward unlocked! Contact support to claim.';
  }
  const dots = document.querySelectorAll('.ref-dot');
  dots.forEach((dot, idx) => {
    if (idx < refCount) dot.classList.add('active');
    else dot.classList.remove('active');
  });

  if (u.is_admin || u.is_staff) {
    const adminHeader = document.getElementById('headerAdminBtn');
    const adminNav = document.getElementById('nav-admin');
    const bottomNav = document.getElementById('bottomNavGrid');

    if (adminHeader) adminHeader.style.display = 'inline-flex';
    if (adminNav) adminNav.style.display = 'flex';
    if (bottomNav) bottomNav.classList.add('admin-mode');

    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'admin' || window.location.hash === '#admin') {
      switchTab('admin');
    }
  }

  renderWalletMethodButtons();
  renderPaymentMethodDetails();
}

// ==========================================================
// 3. STORE CATALOG & SEARCH
// ==========================================================
async function loadCatalog() {
  try {
    const res = await fetch('../api/store.php');
    if (!res.ok) return;
    const data = await res.json();
    if (data.products && data.products.length > 0) {
      state.products = data.products;
      renderProducts();
    }
  } catch (err) {
    console.warn('Catalog using fallback data.');
  }
}

function handleStoreSearch(val) {
  state.searchQuery = (val || '').trim().toLowerCase();
  const clearBtn = document.getElementById('storeSearchClear');
  if (clearBtn) clearBtn.style.display = state.searchQuery ? 'block' : 'none';
  renderProducts();
}

function clearStoreSearch() {
  const input = document.getElementById('storeSearchInput');
  if (input) input.value = '';
  handleStoreSearch('');
}

function filterCategory(cat) {
  triggerHaptic('light');
  state.activeCategory = cat;

  document.querySelectorAll('.cat-pill').forEach(btn => {
    const text = btn.textContent.trim();
    if (text === cat || (cat === 'VPN & Security' && text === 'VPN')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  const filtered = state.products.filter(p => {
    const catMatch = state.activeCategory === 'All' || p.category.toLowerCase().includes(state.activeCategory.toLowerCase());
    if (!catMatch) return false;
    if (!state.searchQuery) return true;
    return p.name.toLowerCase().includes(state.searchQuery) || (p.description || '').toLowerCase().includes(state.searchQuery);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 12px;">
        No products found matching your filter.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(prod => {
    const hasVariants = Array.isArray(prod.variants) && prod.variants.length > 0;
    const isOutOfStock = !hasVariants && (prod.stock_count <= 0);

    const isPopular = prod.badge && prod.badge.toUpperCase() === 'POPULAR';
    const ribbonHtml = isPopular ? `
      <div class="ribbon-wrapper">
        <div class="ribbon-popular">POPULAR</div>
      </div>
    ` : '';

    let subText = `${prod.stock_count || 10} in stock`;
    if (hasVariants) {
      subText = `${prod.variants.length} options available`;
    } else if (isOutOfStock) {
      subText = 'Out of stock';
    }

    let priceText = `${prod.price_etb.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB`;
    if (hasVariants) {
      const minPrice = Math.min(...prod.variants.map(v => v.price_etb || prod.price_etb));
      priceText = `From ${minPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB`;
    }

    const buttonLabel = hasVariants ? 'Choose' : (isOutOfStock ? 'Sold Out' : 'Buy');
    const buttonClick = hasVariants ? `openVariantModal(${prod.id})` : `openBuyModal(${prod.id})`;
    const btnClass = (isOutOfStock && !hasVariants) ? 'btn-product-action disabled' : (isPopular && !hasVariants ? 'btn-product-action btn-popular' : 'btn-product-action');

    return `
      <div class="product-card">
        ${ribbonHtml}
        <div class="product-image-box">
          <img src="${prod.icon_url}" alt="${prod.name}" onerror="this.src='https://img.icons8.com/color/480/box.png'" />
        </div>
        <div class="product-title">${prod.name}</div>
        <div class="product-subtext">${subText}</div>
        <div class="product-footer">
          <div class="product-price">${priceText}</div>
          <button onclick="${buttonClick}" class="${btnClass}">
            ${buttonLabel}
          </button>
        </div>
      </div>
    `;
  }).join('');

  setupIcons();
}

// ==========================================================
// 4. "CHOOSE" VARIANT MODAL (Exact Clone Parity)
// ==========================================================
function openVariantModal(productId) {
  triggerHaptic('medium');
  const product = state.products.find(p => p.id === productId);
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return;

  state.activeVariantProduct = product;
  state.selectedVariant = product.variants[0];

  const iconEl = document.getElementById('variantModalIcon');
  const titleEl = document.getElementById('variantModalTitle');
  const catEl = document.getElementById('variantModalCategory');
  const infoBox = document.getElementById('variantInfoBox');

  if (iconEl) iconEl.src = product.icon_url || 'https://img.icons8.com/color/480/box.png';
  if (titleEl) titleEl.textContent = product.name;
  if (catEl) catEl.textContent = product.category || 'Subscription';
  if (infoBox) {
    infoBox.style.display = 'none';
    infoBox.textContent = product.how_to_use || product.description || 'Verified activation delivered instantly upon purchase.';
  }

  renderVariantCards();
  updateVariantPrice();

  const modal = document.getElementById('variantModal');
  if (modal) modal.classList.add('active');
  setupIcons();
}

function renderVariantCards() {
  const container = document.getElementById('variantOptionsContainer');
  if (!container || !state.activeVariantProduct) return;

  container.innerHTML = state.activeVariantProduct.variants.map((v, idx) => {
    const isSel = state.selectedVariant && state.selectedVariant.duration === v.duration;
    return `
      <div onclick="selectVariantIndex(${idx})" class="variant-card ${isSel ? 'selected' : ''}">
        <div class="duration">${v.duration}</div>
        <div class="price">${v.price_etb.toLocaleString()} ETB</div>
        <div class="status">Available</div>
      </div>
    `;
  }).join('');
}

function selectVariantIndex(idx) {
  triggerHaptic('light');
  if (!state.activeVariantProduct) return;
  state.selectedVariant = state.activeVariantProduct.variants[idx];
  renderVariantCards();
  updateVariantPrice();
}

function updateVariantPrice() {
  if (!state.selectedVariant) return;
  const price = state.selectedVariant.price_etb.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const priceBig = document.getElementById('variantModalPriceBig');
  const buyBtn = document.getElementById('variantBuyButtonText');

  if (priceBig) priceBig.textContent = `${price} ETB`;
  if (buyBtn) buyBtn.textContent = `Buy for ${price} ETB`;
}

function toggleVariantInfo() {
  triggerHaptic('light');
  const infoBox = document.getElementById('variantInfoBox');
  if (infoBox) {
    infoBox.style.display = infoBox.style.display === 'none' ? 'block' : 'none';
  }
}

function proceedVariantToBuyModal() {
  if (!state.activeVariantProduct || !state.selectedVariant) return;
  closeModal('variantModal');
  openBuyModal(state.activeVariantProduct.id, state.selectedVariant);
}

// ==========================================================
// 5. BUY & CHECKOUT MODAL
// ==========================================================
function openBuyModal(productId, variantOverride = null) {
  triggerHaptic('medium');
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  state.pendingPurchaseProduct = prod;
  state.pendingPurchaseVariant = variantOverride;

  const bal = state.user?.wallet_balance || 0;
  const price = variantOverride ? variantOverride.price_etb : prod.price_etb;
  const shortfall = price - bal;
  const balAfter = bal - price;

  document.getElementById('buyModalIcon').src = prod.icon_url;
  document.getElementById('buyModalName').textContent = prod.name;
  document.getElementById('buyModalVariant').textContent = variantOverride ? `Tier: ${variantOverride.duration}` : prod.category;
  document.getElementById('buyModalPrice').textContent = `${price.toFixed(2)} ETB`;
  document.getElementById('buyModalCurrentBal').textContent = `${bal.toFixed(2)} ETB`;
  document.getElementById('buyModalDeductPrice').textContent = `-${price.toFixed(2)} ETB`;

  const balAfterEl = document.getElementById('buyModalBalAfter');
  const noticeEl = document.getElementById('buyModalNotice');
  const confirmBtn = document.getElementById('btnConfirmPurchase');

  if (shortfall > 0) {
    balAfterEl.textContent = `-${shortfall.toFixed(2)} ETB`;
    balAfterEl.style.color = 'var(--accent-red)';
    noticeEl.innerHTML = `⚠️ <b style="color:var(--accent-red)">Insufficient balance.</b> Please deposit at least <b>${shortfall.toFixed(2)} ETB</b> to unlock.`;
    confirmBtn.textContent = 'Deposit to Buy';
    confirmBtn.onclick = () => {
      closeModal('buyModal');
      switchTab('wallet');
      const input = document.getElementById('depositAmountInput');
      if (input) input.value = Math.ceil(shortfall);
    };
  } else {
    balAfterEl.textContent = `${balAfter.toFixed(2)} ETB`;
    balAfterEl.style.color = 'var(--brand-green)';
    noticeEl.textContent = 'Digital credentials will be delivered instantly on your screen.';
    confirmBtn.textContent = 'Confirm & Unlock';
    confirmBtn.onclick = executePurchase;
  }

  const modal = document.getElementById('buyModal');
  if (modal) modal.classList.add('active');
}

async function executePurchase() {
  if (!state.pendingPurchaseProduct) return;
  const prod = state.pendingPurchaseProduct;
  const variant = state.pendingPurchaseVariant;

  const btn = document.getElementById('btnConfirmPurchase');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    const res = await fetch('../api/store.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': state.initData
      },
      body: JSON.stringify({
        product_id: prod.id,
        variant_name: variant ? variant.duration : null,
        initData: state.initData
      })
    });

    const data = await res.json();
    if (data.error) {
      triggerHaptic('error');
      showToast(data.error, true);
      btn.disabled = false;
      btn.textContent = 'Confirm & Unlock';
      return;
    }

    triggerHaptic('success');
    closeModal('buyModal');

    if (typeof data.wallet_balance === 'number') {
      state.user.wallet_balance = data.wallet_balance;
      state.user.orders_count = (state.user.orders_count || 0) + 1;
      updateUserUI();
    }

    state.deliveredPayload = data.delivered_payload || 'KEY-DEMO-UNLOCKED-12345';
    document.getElementById('deliveredPayloadText').textContent = state.deliveredPayload;
    document.getElementById('deliveryModal').classList.add('active');
    loadCatalog().catch(console.warn);

  } catch (err) {
    triggerHaptic('error');
    showToast('Network error during purchase.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm & Unlock';
  }
}

function copyDeliveredPayload() {
  if (!state.deliveredPayload) return;
  triggerHaptic('medium');
  navigator.clipboard.writeText(state.deliveredPayload).then(() => {
    const btn = document.getElementById('copyPayloadBtnText');
    if (btn) {
      btn.textContent = 'Copied! ✓';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    }
    showToast('Delivery copied to clipboard! 🎉');
  });
}

function viewInOrders() {
  closeModal('deliveryModal');
  switchTab('orders');
}

// ==========================================================
// 6. WALLET & DEPOSIT CONTROLLER
// ==========================================================
function renderWalletMethodButtons() {
  const container = document.getElementById('walletMethodButtonsContainer');
  if (!container) return;

  const methods = Object.values(state.paymentMethods);
  container.innerHTML = methods.map(m => {
    const code = (m.code || m.name).toLowerCase();
    const isSel = code === state.selectedMethod.toLowerCase();
    return `
      <button type="button" onclick="selectDepositMethod('${code}')" class="cat-pill ${isSel ? 'active' : ''}" style="width:100%; text-align:center; padding:8px 4px; font-size:11px;">
        ${m.name.split(' ')[0]}
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
  const key = state.selectedMethod.toLowerCase();
  const info = state.paymentMethods[key] || Object.values(state.paymentMethods)[0];
  if (!info) return;

  const titleEl = document.getElementById('depositMethodTitle');
  const numEl = document.getElementById('depositAccountNumber');
  const holderEl = document.getElementById('depositAccountHolder');

  if (titleEl) titleEl.textContent = `${info.name} Account`;
  if (numEl) numEl.textContent = info.account_number || info.account || '0906818924';
  if (holderEl) holderEl.textContent = info.account_name || info.holder || 'Mohammed Abdirahman';
}

function copyAccountInfo() {
  const key = state.selectedMethod.toLowerCase();
  const info = state.paymentMethods[key] || Object.values(state.paymentMethods)[0];
  const num = info?.account_number || info?.account || '0906818924';

  triggerHaptic('light');
  navigator.clipboard.writeText(num).then(() => {
    const btn = document.getElementById('copyBtnText');
    if (btn) {
      btn.textContent = 'Copied! ✓';
      setTimeout(() => { btn.textContent = 'Copy Account'; }, 2000);
    }
    showToast('Account copied to clipboard!');
  });
}

function handleReceiptFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 20 * 1024 * 1024) {
    showToast('File too large. Maximum size is 20MB.', true);
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    state.receiptImageBase64 = event.target.result;
    document.getElementById('receiptPreviewImg').src = event.target.result;
    document.getElementById('receiptFileName').textContent = file.name;
    document.getElementById('receiptFileSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

    document.getElementById('receiptUploadPlaceholder').style.display = 'none';
    document.getElementById('receiptPreviewContainer').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function clearReceiptFile(e) {
  if (e) e.stopPropagation();
  state.receiptImageBase64 = null;
  const input = document.getElementById('receiptFileInput');
  if (input) input.value = '';

  document.getElementById('receiptUploadPlaceholder').style.display = 'flex';
  document.getElementById('receiptPreviewContainer').style.display = 'none';
}

async function submitDeposit(e) {
  e.preventDefault();
  triggerHaptic('medium');

  const amountInput = document.getElementById('depositAmountInput');
  const receiptInput = document.getElementById('depositReceiptInput');
  const btn = document.getElementById('btnSubmitDeposit');

  const amount = parseFloat(amountInput.value);
  const raw = receiptInput.value.trim();

  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid amount.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

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
        receipt_raw: raw,
        receipt_image: state.receiptImageBase64 || null,
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
    amountInput.value = '';
    receiptInput.value = '';
    clearReceiptFile();

  } catch (err) {
    triggerHaptic('error');
    showToast('Network error during submission.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Deposit for Verification';
  }
}

// ==========================================================
// 7. ORDERS & ACTIVATION GUIDES
// ==========================================================
async function loadOrders() {
  triggerHaptic('light');
  const list = document.getElementById('ordersList');
  if (list) list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">Loading orders...</div>`;

  try {
    const res = await fetch('../api/orders.php', {
      headers: { 'X-Telegram-Init-Data': state.initData }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.orders) {
      state.orders = data.orders;
      renderOrders();
    }
  } catch (err) {
    renderOrders(); // fallback
  }
}

function renderOrders() {
  const list = document.getElementById('ordersList');
  if (!list) return;

  if (state.orders.length === 0) {
    list.innerHTML = `
      <div class="view-card" style="text-align:center; padding:30px 16px; color:var(--text-muted);">
        <p style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">No Orders Yet</p>
        <p style="font-size:11px;">Items you unlock will be stored permanently here with how-to-use guides.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = state.orders.map(o => {
    const date = new Date(o.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const guideHtml = o.how_to_use ? `
      <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border-subtle); font-size:11px; color:var(--text-secondary); line-height:1.6; white-space:pre-wrap;">
        <div style="font-weight:700; color:var(--text-primary); margin-bottom:6px;">📖 How to use it</div>
        ${o.how_to_use}
      </div>
    ` : '';

    return `
      <div class="view-card" style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:28px; height:28px; border-radius:50%; background:rgba(16,185,129,0.15); color:var(--brand-green); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:14px; flex-shrink:0;">
              ✓
            </div>
            <div>
              <div style="font-size:13px; font-weight:800; color:var(--text-primary); line-height:1.2;">${o.product_name}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Delivered • ${date}</div>
            </div>
          </div>
          <div style="font-size:13px; font-weight:900; color:var(--text-primary);">${o.price_paid.toFixed(2)} ETB</div>
        </div>

        <div style="margin-top:8px; padding-left:38px;">
          <button id="order-btn-${o.id}" onclick="toggleOrderItem(${o.id})" style="background:none; border:none; color:var(--accent-blue); font-size:12px; font-weight:700; cursor:pointer; padding:0;">
            Show my item
          </button>

          <div id="order-details-${o.id}" style="display:none; margin-top:10px;">
            <div onclick="copyTextToClipboard('${(o.delivered_payload || '').replace(/'/g, "\\'")}')" style="background:var(--bg-input); border:1px solid var(--border-highlight); border-radius:8px; padding:10px 12px; font-family:monospace; font-size:11.5px; color:#86efac; word-break:break-all; cursor:pointer;">
              ${o.delivered_payload}
            </div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Tap an item to copy</div>
            ${guideHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleOrderItem(orderId) {
  triggerHaptic('light');
  const details = document.getElementById(`order-details-${orderId}`);
  const btn = document.getElementById(`order-btn-${orderId}`);
  if (!details || !btn) return;
  const isHidden = details.style.display === 'none';
  details.style.display = isHidden ? 'block' : 'none';
  btn.textContent = isHidden ? 'Hide item' : 'Show my item';
}

// ==========================================================
// 8. INVITE & NAVIGATION
// ==========================================================
function copyReferralLink() {
  const input = document.getElementById('referralLinkInput');
  if (!input) return;
  triggerHaptic('light');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Copied.');
  });
}

function shareReferralLink() {
  const input = document.getElementById('referralLinkInput');
  if (!input) return;
  triggerHaptic('medium');
  const url = `https://t.me/share/url?url=${encodeURIComponent(input.value)}&text=${encodeURIComponent("Join AtkeShop for verified digital subscriptions and licenses at great ETB rates:")}`;
  if (state.tg?.openTelegramLink) {
    state.tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

function switchTab(tabId) {
  triggerHaptic('light');

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.remove('active');
  });

  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);

  if (targetTab) targetTab.style.display = 'block';
  if (targetNav) targetNav.classList.add('active');

  if (tabId === 'orders') loadOrders();
  else if (tabId === 'admin') loadAdminAll();
}

function closeModal(id) {
  triggerHaptic('light');
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast active ${isErr ? 'error' : ''}`;
  setTimeout(() => { t.className = 'toast'; }, 2600);
}

function copyTextToClipboard(text) {
  triggerHaptic('light');
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied.');
  });
}

// ==========================================================
// 9. ADMIN OPERATIONS (Profit, Staff, Marketing)
// ==========================================================
async function loadAdminAll() {
  await Promise.all([loadAdminStats(), loadAdminProducts(), loadAdminDeposits()]);
}

async function loadAdminStats() {
  try {
    const res = await fetch('../api/admin.php?action=stats', {
      headers: { 'X-Telegram-Init-Data': state.initData }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.stats) {
      const s = data.stats;
      document.getElementById('adminTotalRevenue').textContent = s.is_owner ? s.total_revenue.toFixed(2) : 'Restricted';
      document.getElementById('adminTotalProfit').textContent = s.is_owner ? s.total_profit.toFixed(2) : 'Restricted';
      document.getElementById('adminProfitMargin').textContent = s.is_owner ? s.profit_margin.toFixed(1) : '---';
      document.getElementById('adminPendingDeposits').textContent = s.pending_deposits;
    }
  } catch (e) {}
}

async function loadAdminProducts() {
  try {
    const res = await fetch('../api/admin.php?action=products', {
      headers: { 'X-Telegram-Init-Data': state.initData }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.products) {
      state.adminProducts = data.products;
      renderAdminProducts();
    }
  } catch (e) {
    state.adminProducts = state.products;
    renderAdminProducts();
  }
}

function renderAdminProducts() {
  const c = document.getElementById('adminProductsContainer');
  if (!c) return;

  c.innerHTML = state.adminProducts.map(p => `
    <div class="view-card" style="padding:10px; display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${p.icon_url}" alt="" style="width:32px; height:32px; object-fit:contain;" />
        <div>
          <div style="font-size:12px; font-weight:700; color:#fff;">${p.name}</div>
          <div style="font-size:10px; color:var(--text-muted);">${p.price_etb} ETB (Cost: ${p.cost_price_etb || 0})</div>
        </div>
      </div>
      <div style="display:flex; gap:4px;">
        <button onclick="openEditProductModal(${p.id})" class="badge-pill badge-amber" style="cursor:pointer; border:none;">Edit</button>
        <button onclick="openAddKeysModal(${p.id})" class="badge-pill badge-green" style="cursor:pointer; border:none;">+ Stock</button>
      </div>
    </div>
  `).join('');
}

function switchAdminSection(s) {
  triggerHaptic('light');
  ['products', 'deposits', 'payments', 'staff', 'marketing'].forEach(sec => {
    const b = document.getElementById(`btnAdminSection-${sec}`);
    const p = document.getElementById(`adminPanel-${sec}`);
    if (b) b.classList.toggle('active', sec === s);
    if (p) p.style.display = sec === s ? 'block' : 'none';
  });

  if (s === 'deposits') loadAdminDeposits();
  else if (s === 'staff') loadAdminStaff();
}

async function loadAdminDeposits() {
  try {
    const res = await fetch(`../api/admin.php?action=deposits&filter=${state.adminDepositFilter}`, {
      headers: { 'X-Telegram-Init-Data': state.initData }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.deposits) {
      state.adminDeposits = data.deposits;
      renderAdminDeposits();
    }
  } catch (e) {}
}

function filterAdminDeposits(f) {
  state.adminDepositFilter = f;
  loadAdminDeposits();
}

function renderAdminDeposits() {
  const c = document.getElementById('adminDepositsContainer');
  if (!c) return;

  if (state.adminDeposits.length === 0) {
    c.innerHTML = `<div style="text-align:center; padding:20px; font-size:11px; color:var(--text-muted);">No deposits in queue.</div>`;
    return;
  }

  c.innerHTML = state.adminDeposits.map(d => `
    <div class="view-card" style="font-size:11px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <b>${d.first_name || 'User'} (${d.payment_method})</b>
        <span style="font-weight:800; color:var(--brand-green);">${d.amount} ETB</span>
      </div>
      <div style="font-family:monospace; background:rgba(0,0,0,0.3); padding:6px; border-radius:6px; margin:6px 0; word-break:break-all;">${d.receipt_raw}</div>
      ${d.status === 'pending' ? `
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button onclick="adminReviewDeposit(${d.id}, 'approved')" class="badge-pill badge-green" style="flex:1; padding:6px; cursor:pointer; border:none;">Approve & Credit</button>
          <button onclick="adminReviewDeposit(${d.id}, 'rejected')" class="badge-pill badge-red" style="flex:1; padding:6px; cursor:pointer; border:none;">Reject</button>
        </div>
      ` : `<div style="text-align:right; font-size:10px; color:var(--text-muted);">${d.status.toUpperCase()}</div>`}
    </div>
  `).join('');
}

async function adminReviewDeposit(id, decision) {
  try {
    const res = await fetch('../api/admin.php?action=review_deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify({ deposit_id: id, decision: decision, initData: state.initData })
    });
    const data = await res.json();
    showToast(data.message || 'Deposit reviewed.');
    loadAdminDeposits();
  } catch (e) {
    showToast('Failed to review deposit.', true);
  }
}

function openNewProductModal() {
  document.getElementById('editProductModalTitle').textContent = 'Create New Product';
  document.getElementById('editProductId').value = '0';
  document.getElementById('editProductName').value = '';
  document.getElementById('editProductCostPrice').value = '';
  document.getElementById('editProductPrice').value = '';
  document.getElementById('editProductVariants').value = '';
  document.getElementById('editProductHowToUse').value = '';
  document.getElementById('editProductModal').classList.add('active');
}

function openEditProductModal(id) {
  const p = state.adminProducts.find(item => item.id === id);
  if (!p) return;
  document.getElementById('editProductModalTitle').textContent = `Edit ${p.name}`;
  document.getElementById('editProductId').value = p.id;
  document.getElementById('editProductName').value = p.name;
  document.getElementById('editProductCostPrice').value = p.cost_price_etb || '';
  document.getElementById('editProductPrice').value = p.price_etb;
  document.getElementById('editProductVariants').value = p.variants ? JSON.stringify(p.variants) : '';
  document.getElementById('editProductHowToUse').value = p.how_to_use || '';
  document.getElementById('editProductModal').classList.add('active');
}

function calcEditProfitPreview() {
  const cost = parseFloat(document.getElementById('editProductCostPrice').value) || 0;
  const price = parseFloat(document.getElementById('editProductPrice').value) || 0;
  const profit = price - cost;
  const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;
  document.getElementById('editProfitPreviewText').textContent = `${profit.toFixed(2)} ETB (${margin}% margin)`;
}

function fillVariantsTemplate() {
  document.getElementById('editProductVariants').value = JSON.stringify([
    { duration: "3 months", price_etb: 2500, cost_price_etb: 2000 },
    { duration: "6 months", price_etb: 3400, cost_price_etb: 2800 },
    { duration: "12 months", price_etb: 6200, cost_price_etb: 5000 }
  ], null, 2);
}

async function handleSaveProduct(e) {
  e.preventDefault();
  triggerHaptic('medium');
  const payload = {
    action: 'save_product',
    id: parseInt(document.getElementById('editProductId').value, 10),
    name: document.getElementById('editProductName').value.trim(),
    category: document.getElementById('editProductCategory').value.trim() || 'Services',
    cost_price_etb: parseFloat(document.getElementById('editProductCostPrice').value) || 0,
    price_etb: parseFloat(document.getElementById('editProductPrice').value),
    icon_url: document.getElementById('editProductIcon').value.trim() || 'https://img.icons8.com/color/480/box.png',
    variants_json: document.getElementById('editProductVariants').value.trim() || null,
    how_to_use: document.getElementById('editProductHowToUse').value.trim(),
    initData: state.initData
  };

  try {
    const res = await fetch('../api/admin.php?action=save_product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showToast(data.message || 'Product saved!');
    closeModal('editProductModal');
    loadAdminProducts();
    loadCatalog();
  } catch (err) {
    showToast('Failed to save product.', true);
  }
}

function openAddKeysModal(id) {
  const p = state.adminProducts.find(item => item.id === id);
  if (!p) return;
  document.getElementById('addKeysProductId').value = p.id;
  document.getElementById('addKeysProductName').textContent = `Target: ${p.name}`;
  document.getElementById('addKeysTextarea').value = '';
  document.getElementById('addKeysModal').classList.add('active');
}

async function handleSubmitKeys(e) {
  e.preventDefault();
  triggerHaptic('medium');
  const payload = {
    action: 'add_keys',
    product_id: parseInt(document.getElementById('addKeysProductId').value, 10),
    keys: document.getElementById('addKeysTextarea').value,
    initData: state.initData
  };

  try {
    const res = await fetch('../api/admin.php?action=add_keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showToast(data.message || 'Stock added!');
    closeModal('addKeysModal');
    loadAdminProducts();
  } catch (err) {
    showToast('Failed to add stock.', true);
  }
}

async function loadAdminStaff() {
  try {
    const res = await fetch('../api/admin.php?action=get_staff', {
      headers: { 'X-Telegram-Init-Data': state.initData }
    });
    const data = await res.json();
    const c = document.getElementById('adminStaffListContainer');
    if (c && data.staff) {
      c.innerHTML = data.staff.map(s => `
        <div class="view-card" style="padding:8px 12px; display:flex; justify-content:space-between; align-items:center; font-size:11px;">
          <div>
            <b>${s.first_name}</b> <span class="badge-pill badge-green">${s.role}</span>
            <div style="color:var(--text-muted); font-size:10px;">TG ID: ${s.telegram_id}</div>
          </div>
          <button onclick="adminRemoveStaff(${s.telegram_id})" class="badge-pill badge-red" style="cursor:pointer; border:none;">Revoke</button>
        </div>
      `).join('');
    }
  } catch (e) {}
}

async function handleSaveStaff(e) {
  e.preventDefault();
  triggerHaptic('medium');
  const tgId = parseInt(document.getElementById('staffTelegramIdInput').value.trim(), 10);
  const role = document.getElementById('staffRoleSelect').value;

  try {
    const res = await fetch('../api/admin.php?action=save_staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify({ telegram_id: tgId, role: role, initData: state.initData })
    });
    const data = await res.json();
    showToast(data.message || 'Staff assigned!');
    document.getElementById('staffTelegramIdInput').value = '';
    loadAdminStaff();
  } catch (err) {
    showToast('Failed to assign staff.', true);
  }
}

async function adminRemoveStaff(id) {
  if (!confirm('Revoke staff permissions?')) return;
  try {
    await fetch('../api/admin.php?action=remove_staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify({ telegram_id: id, initData: state.initData })
    });
    showToast('Staff revoked.');
    loadAdminStaff();
  } catch (e) {}
}

async function handleBroadcastMarketing(e) {
  e.preventDefault();
  triggerHaptic('medium');
  const msg = document.getElementById('broadcastMessageInput').value.trim();
  const photo = document.getElementById('broadcastPhotoInput').value.trim();

  try {
    const res = await fetch('../api/admin.php?action=broadcast_marketing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': state.initData },
      body: JSON.stringify({ message: msg, photo_url: photo || null, initData: state.initData })
    });
    const data = await res.json();
    if (data.error) showToast(data.error, true);
    else {
      showToast('Broadcast delivered! 📢');
      document.getElementById('broadcastMessageInput').value = '';
      document.getElementById('broadcastPhotoInput').value = '';
    }
  } catch (e) {
    showToast('Broadcast failed.', true);
  }
}
