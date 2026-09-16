/**
 * Pricing & Catalog Synchronization Engine for Atke Shop
 * Computes retail prices, profit margins, and manages catalog caching
 */

const fs = require('fs');
const path = require('path');

// Snapshot from Reseller.mp4 screen recording
const CATALOG_SNAPSHOT = [
  {
    id: "n8n-starter-12m",
    name: "n8n Starter 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 2,
    resellerPrice: 5900,
    suggestedRetailPrice: 6250,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/n8n/EA4B71"
  },
  {
    id: "wispr-flow-pro-12m",
    name: "Wispr Flow Pro 12m",
    category: "AI & Productivity",
    deliveryType: "instant",
    stock: 3,
    resellerPrice: 5200,
    suggestedRetailPrice: 5400,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/openai/412991"
  },
  {
    id: "warp-build-12m",
    name: "Warp Build 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 2,
    resellerPrice: 5800,
    suggestedRetailPrice: 6000,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/warp/01B4D2"
  },
  {
    id: "replit-core-12m",
    name: "Replit Core 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 3,
    resellerPrice: 7300,
    suggestedRetailPrice: 7500,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/replit/F26207"
  },
  {
    id: "quillbot-premium-1m",
    name: "QuillBot Premium 1m",
    category: "AI & Productivity",
    deliveryType: "instant",
    stock: 65,
    resellerPrice: 700,
    suggestedRetailPrice: 750,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/googleclassroom/00A86B"
  },
  {
    id: "nordvpn-3m",
    name: "Nord VPN 3m",
    category: "Security & VPN",
    deliveryType: "instant",
    stock: 21,
    resellerPrice: 650,
    suggestedRetailPrice: 1350,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/nordvpn/4687FF"
  },
  {
    id: "monthly-iat-unlimited-data",
    name: "Monthly IAT Unlimited Data | 300 Birr ...",
    category: "Data Packages",
    deliveryType: "manual",
    stock: 999,
    resellerPrice: 1750,
    suggestedRetailPrice: 1820,
    customerInput: "Telegram Username or Ethio Telecom Number",
    icon: "https://cdn.simpleicons.org/telegram/26A5E4"
  },
  {
    id: "gemini-ai-pro-18m",
    name: "Gemini AI Pro 18m",
    category: "AI & Productivity",
    deliveryType: "instant",
    stock: 300,
    resellerPrice: 400,
    suggestedRetailPrice: 550,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/googlegemini/8E75B2"
  },
  {
    id: "elevenlabs-creator-12m",
    name: "ElevenLabs Creator 12m",
    category: "AI & Productivity",
    deliveryType: "instant",
    stock: 1,
    resellerPrice: 9000,
    suggestedRetailPrice: 10500,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/elevenlabs/000000"
  },
  {
    id: "lovable-lite-12m",
    name: "Lovable Lite 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 0,
    resellerPrice: 2520,
    suggestedRetailPrice: 2800,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/heart/FF5A5F"
  },
  {
    id: "weekly-iat-unlimited-data",
    name: "Weekly Unlimited IAT Data | 90 Birr ...",
    category: "Data Packages",
    deliveryType: "manual",
    stock: 999,
    resellerPrice: 540,
    suggestedRetailPrice: 600,
    customerInput: "Telegram Username or Ethio Telecom Number",
    icon: "https://cdn.simpleicons.org/telegram/26A5E4"
  },
  {
    id: "soundcloud-artist-pro-1m",
    name: "SoundCloud Artist Pro 1 Month",
    category: "Music & Streaming",
    deliveryType: "manual",
    stock: 999,
    resellerPrice: 360,
    suggestedRetailPrice: 400,
    customerInput: "SoundCloud Account Email",
    icon: "https://cdn.simpleicons.org/soundcloud/FF5500"
  },
  {
    id: "gamma-pro-12m",
    name: "Gamma Pro 12m",
    category: "AI & Productivity",
    deliveryType: "instant",
    stock: 3,
    resellerPrice: 5850,
    suggestedRetailPrice: 8100,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/slideshare/0077B5"
  },
  {
    id: "factory-pro-12m",
    name: "Factory Pro 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 5,
    resellerPrice: 3150,
    suggestedRetailPrice: 3500,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/probot/00B0FF"
  },
  {
    id: "github-developer-pack-2y",
    name: "Github Developer Pack (2 Years)",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 7,
    resellerPrice: 3150,
    suggestedRetailPrice: 3500,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/github/FFFFFF"
  },
  {
    id: "railway-hobby-12m",
    name: "Railway Hobby 12m",
    category: "Developer Tools",
    deliveryType: "instant",
    stock: 4,
    resellerPrice: 2700,
    suggestedRetailPrice: 3000,
    customerInput: null,
    icon: "https://cdn.simpleicons.org/railway/0B0D0E"
  }
];

class PricingEngine {
  constructor(config = null) {
    this.configPath = path.join(__dirname, 'config.json');
    this.config = config || this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      console.warn('Error reading config.json:', e.message);
    }
    return {};
  }

  saveConfig(newConfig) {
    this.config = newConfig;
    fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  }

  extractPrice(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return parseFloat(val) || 0;
    if (typeof val === 'object' && val.amount !== undefined) return parseFloat(val.amount) || 0;
    return 0;
  }

  /**
   * Calculate Atke Shop retail price and profit for a product
   */
  calculatePrice(product) {
    const wholesale = this.extractPrice(product.resellerPrice || product.price);
    const suggested = this.extractPrice(product.suggestedRetailPrice) || wholesale;
    const customPrices = this.config.pricing?.customPrices || {};
    
    // Normalize id and slug
    const slug = String(product.slug || product.id || product.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let retailPrice = 0;
    const minProfit = this.config.pricing?.minimumProfitEtb || 50;

    if (customPrices[product.id] !== undefined) {
      retailPrice = Number(customPrices[product.id]);
    } else if (product.slug && customPrices[product.slug] !== undefined) {
      retailPrice = Number(customPrices[product.slug]);
    } else if (customPrices[slug] !== undefined) {
      retailPrice = Number(customPrices[slug]);
    } else {
      const marginType = this.config.pricing?.defaultMarginType || 'percentage';
      const marginVal = Number(this.config.pricing?.defaultMarginValue || 20);

      if (marginType === 'percentage') {
        const computed = wholesale * (1 + marginVal / 100);
        retailPrice = Math.max(computed, wholesale + minProfit);
      } else {
        retailPrice = wholesale + marginVal;
      }

      // Round nicely to nearest 50 ETB for clean retail presentation
      retailPrice = Math.ceil(retailPrice / 50) * 50;
    }

    if (retailPrice <= wholesale) {
      retailPrice = wholesale + minProfit;
    }

    const profitEtb = retailPrice - wholesale;
    const profitMarginPct = wholesale > 0 ? ((profitEtb / wholesale) * 100).toFixed(1) : '0.0';

    return {
      retailPrice,
      profitEtb,
      profitMarginPct
    };
  }

  /**
   * Synchronize & decorate products with Atke Shop retail pricing and profit metrics
   * @param {Array} [rawProducts] - Live products array from YeneShop API
   * @returns {Array} List of processed products
   */
  processCatalog(rawProducts = null) {
    let products = rawProducts;
    if (products && !Array.isArray(products) && Array.isArray(products.products)) {
      products = products.products;
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
      products = CATALOG_SNAPSHOT;
    }

    return products.map(p => {
      const pricing = this.calculatePrice(p);
      const wholesale = this.extractPrice(p.resellerPrice || p.price);
      const suggested = this.extractPrice(p.suggestedRetailPrice) || wholesale;

      let custInput = null;
      if (p.customerInput) {
        if (typeof p.customerInput === 'object') {
          custInput = p.customerInput.label || p.customerInput.placeholder || 'Required details';
        } else {
          custInput = String(p.customerInput);
        }
      }

      return {
        id: p.id,
        slug: p.slug || p.id,
        name: p.name,
        category: p.category || 'Digital Accounts',
        deliveryType: String(p.deliveryType || 'instant').toLowerCase(),
        stock: p.stock !== undefined && p.stock !== null ? p.stock : 10,
        customerInput: custInput,
        wholesalePrice: wholesale,
        suggestedRetailPrice: suggested,
        retailPrice: pricing.retailPrice,
        profitEtb: pricing.profitEtb,
        profitMarginPct: pricing.profitMarginPct,
        icon: p.imageUrl || p.icon || 'https://cdn.simpleicons.org/telegram/26A5E4',
        currency: this.config.currency || 'ETB'
      };
    });
  }

  /**
   * Set custom retail price for a specific product
   */
  setCustomPrice(productId, newPrice) {
    if (!this.config.pricing) this.config.pricing = {};
    if (!this.config.pricing.customPrices) this.config.pricing.customPrices = {};

    this.config.pricing.customPrices[productId] = Number(newPrice);
    this.saveConfig(this.config);
    return this.config.pricing.customPrices;
  }
}

module.exports = { PricingEngine, CATALOG_SNAPSHOT };
