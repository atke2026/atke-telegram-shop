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

/**
 * --------------------------------------------------------------------
 * Initialize Application & Telegram WebApp SDK
 * --------------------------------------------------------------------
 */
document.addEventListener('DOMContentLoaded', () => {
  initTelegram();
  bindEvents();
  renderProducts(state.products); // Instant 0ms render from pre-cached catalog
  loadCatalog();                  // Background sync with live server/Ethio-Viral
  loadPaymentChannels();
  checkStoredActiveOrder();
});

function initTelegram() {
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

  // Header "My Orders" Button
  const btnOrders = document.getElementById('btnOpenOrders');
  if (btnOrders) {
    btnOrders.addEventListener('click', openMyOrdersModal);
  }

  // Close Modals
  document.getElementById('btnCloseCheckout')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseStatus')?.addEventListener('click', closeAllModals);
  document.getElementById('btnCloseOrders')?.addEventListener('click', closeAllModals);

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

  // Submit Order Button
  document.getElementById('btnSubmitOrder')?.addEventListener('click', submitOrder);
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

    if (data.success && Array.isArray(data.products)) {
      state.products = data.products;
      state.filteredProducts = [...data.products];
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
    console.error("Failed to load catalog:", error);
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--hint-color);">
        <p>⚠️ Connection error loading catalog.</p>
        <button onclick="loadCatalog()" class="btn-buy" style="margin-top: 10px;">Retry</button>
      </div>
    `;
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

  selectPaymentChannel(state.selectedChannel || 'CBE');

  const modal = document.getElementById('checkoutModal');
  modal.classList.add('active');
  showTgBackButton(true);
  triggerHaptic('medium');
};

async function submitOrder() {
  if (!state.selectedProduct) return;

  const txInput = document.getElementById('txReferenceInput');
  const txRef = txInput.value.trim().toUpperCase();

  if (!txRef || txRef.length < 4) {
    showToast('⚠️ Please enter your valid bank transaction reference code or FT number.');
    txInput.focus();
    triggerHaptic('error');
    return;
  }

  const btn = document.getElementById('btnSubmitOrder');
  const btnText = document.getElementById('submitOrderBtnText');
  const spinner = document.getElementById('submitSpinner');

  btn.disabled = true;
  btnText.textContent = 'Verifying with System...';
  spinner.classList.remove('hidden');

  // Payload for backend
  const payload = {
    action: 'create_order',
    product_id: state.selectedProduct.id,
    payment_channel: state.selectedChannel,
    transaction_reference: txRef,
    init_data: tg?.initData || '',
    fallback_telegram_id: state.tgUser?.id || 12345678,
    fallback_username: state.tgUser?.username || 'user',
    fallback_first_name: state.tgUser?.first_name || 'Customer'
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

      showToast('🎉 Payment verified! Your subscription is ready.');
      triggerHaptic('success');
    } else if (order.payment_status === 'rejected') {
      clearInterval(state.pollIntervalId);
      state.pollIntervalId = null;
      localStorage.removeItem('active_order_uuid');

      document.getElementById('statusPendingBox').innerHTML = `
        <div style="color: var(--accent-rose); font-size: 2rem; margin-bottom: 8px;">❌</div>
        <h4 style="color: var(--accent-rose); margin-bottom: 4px;">Payment Verification Failed</h4>
        <p style="font-size: 0.8rem; color: var(--hint-color);">We could not verify the provided transaction reference. Please contact support via <a href="https://t.me/Captain_levi123" target="_blank" style="color: var(--link-color);">@Captain_levi123</a>.</p>
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
