/**
 * YeneShop Reseller API Client for Atke Shop
 * Interacts with https://yeneshop.amixmon.com/api/reseller/v1
 * Supports both Sandbox and Live environments
 */

const fs = require('fs');
const path = require('path');

class YeneShopClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl]
   * @param {string} [options.apiKey]
   * @param {'sandbox'|'live'} [options.mode]
   * @param {number} [options.timeoutMs]
   */
  constructor(options = {}) {
    this.configPath = path.join(__dirname, 'config.json');
    const localConfig = this.loadConfig();

    this.baseUrl = (options.baseUrl || localConfig.resellerApi?.baseUrl || 'https://yeneshop.amixmon.com/api/reseller/v1').replace(/\/$/, '');
    this.mode = options.mode || process.env.YENESHOP_MODE || localConfig.resellerApi?.mode || 'sandbox';

    const envKey = this.mode === 'live' 
      ? (process.env.YENESHOP_LIVE_KEY || localConfig.resellerApi?.liveApiKey)
      : (process.env.YENESHOP_SANDBOX_KEY || localConfig.resellerApi?.sandboxApiKey);

    this.apiKey = options.apiKey || envKey || '';
    this.timeoutMs = options.timeoutMs || localConfig.resellerApi?.timeoutMs || 15000;
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      console.warn('Could not read config.json:', e.message);
    }
    return {};
  }

  /**
   * Set or update active API Key and mode
   */
  setCredentials({ apiKey, mode }) {
    if (apiKey !== undefined) this.apiKey = apiKey.trim();
    if (mode !== undefined) this.mode = mode;
  }

  /**
   * Internal HTTP request handler with timeout and error mapping
   */
  async request(endpoint, options = {}, retries = 2) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    if (!this.apiKey) {
      throw new Error(`MISSING_API_KEY: No API key configured for ${this.mode} mode. Please generate a key in YeneShop Mini App -> Reseller -> API keys.`);
    }

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { rawResponse: text };
      }

      if (!response.ok) {
        // Safe retry for 5xx errors or network glitches (using same externalId if POST)
        if (response.status >= 500 && retries > 0) {
          console.warn(`[YeneShop] Server returned ${response.status}. Retrying in 1s... (${retries} retries left)`);
          await new Promise(r => setTimeout(r, 1000));
          return this.request(endpoint, options, retries - 1);
        }

        const errorMsg = data.message || data.error || `HTTP ${response.status} ${response.statusText}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        if (retries > 0) {
          console.warn(`[YeneShop] Request timed out. Retrying (${retries} left)...`);
          return this.request(endpoint, options, retries - 1);
        }
        throw new Error(`REQUEST_TIMEOUT: Request to YeneShop timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  /**
   * 1. GET /balance
   * Retrieve current live or sandbox balance
   */
  async getBalance() {
    return await this.request('/balance');
  }

  /**
   * 2. GET /products
   * Fetch wholesale reseller product catalogue
   */
  async getProducts() {
    return await this.request('/products');
  }

  /**
   * 3. POST /orders
   * Create or safely retry an order
   * @param {Object} orderData
   * @param {string|number} orderData.productId - ID of product to purchase
   * @param {string} [orderData.externalId] - Unique reference (up to 100 alphanumeric/hyphens/underscores)
   * @param {string} [orderData.customerInput] - Required for manual or customized products
   */
  async createOrder({ productId, externalId, customerInput }) {
    if (!productId) {
      throw new Error('productId is required to place an order');
    }

    // Generate safe unique externalId if not provided
    const safeExternalId = externalId || `ATKE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payload = {
      productId,
      externalId: safeExternalId
    };

    if (customerInput !== undefined && customerInput !== null && customerInput !== '') {
      payload.customerInput = String(customerInput);
    }

    return await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * 4. GET /orders
   * List the latest 50 orders
   */
  async getOrders() {
    return await this.request('/orders');
  }

  /**
   * 5. GET /orders/:externalId
   * Look up an order status by external reference ID
   */
  async getOrderByExternalId(externalId) {
    if (!externalId) throw new Error('externalId is required');
    return await this.request(`/orders/${encodeURIComponent(externalId)}`);
  }
}

module.exports = YeneShopClient;
