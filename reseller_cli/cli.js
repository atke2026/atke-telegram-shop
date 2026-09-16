#!/usr/bin/env node

/**
 * Atke Shop Reseller CLI Management Tool
 * Inspect balances, configure retail margins, and test instant fulfillments
 */

const YeneShopClient = require('./yeneshop_client');
const { PricingEngine } = require('./pricing_engine');

const client = new YeneShopClient();
const pricing = new PricingEngine();

async function main() {
  const args = process.argv.slice(2);
  const command = (args[0] || 'help').toLowerCase();

  console.log(`\n======================================================`);
  console.log(`  🛍️  ATKE SHOP - YENESHOP RESELLER MANAGEMENT CLI`);
  console.log(`  Mode: [${client.mode.toUpperCase()}] | Currency: ETB`);
  console.log(`======================================================\n`);

  switch (command) {
    case 'test':
    case 'ping':
      await testConnection();
      break;

    case 'balance':
      await showBalance();
      break;

    case 'catalog':
    case 'products':
      await showCatalog();
      break;

    case 'set-key':
      setKey(args[1], args[2]);
      break;

    case 'set-mode':
      setMode(args[1]);
      break;

    case 'set-price':
      setPrice(args[1], args[2]);
      break;

    case 'test-order':
    case 'buy':
      await testOrder(args[1], args[2]);
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

async function testConnection() {
  console.log(`Testing connection to YeneShop API (${client.baseUrl})...`);
  console.log(`Active Mode: ${client.mode}`);
  console.log(`API Key set: ${client.apiKey ? 'YES (' + client.apiKey.substring(0, 8) + '...)' : 'NO (Missing)'}\n`);

  if (!client.apiKey) {
    console.log(`❌ No API key configured for ${client.mode} mode.`);
    console.log(`👉 In YeneShop TMA, go to 'Reseller' -> 'API keys' -> Generate Key.`);
    console.log(`👉 Then run: node cli.js set-key <YOUR_KEY> ${client.mode}\n`);
    return;
  }

  try {
    const balance = await client.getBalance();
    console.log(`✅ Success! Authenticated with YeneShop Reseller API.`);
    console.log(`Wallet Balance: ${JSON.stringify(balance, null, 2)}\n`);
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
    if (err.data) console.error(`Response details:`, err.data);
    console.log(`\nCheck if your key was copied correctly or if it is active.`);
  }
}

async function showBalance() {
  try {
    console.log(`Fetching balance for [${client.mode.toUpperCase()}] mode...`);
    const balance = await client.getBalance();
    console.log(`\n💰 Current Wallet Balance:`, balance);
    if (client.mode === 'sandbox') {
      console.log(`💡 Note: Sandbox wallet can be reset to 100,000 ETB in YeneShop TMA -> Reseller -> Orders -> Reset.`);
    }
  } catch (err) {
    console.error(`❌ Could not fetch balance: ${err.message}`);
    if (!client.apiKey) {
      console.log(`Tip: Configure your key with: node cli.js set-key <YOUR_KEY>`);
    }
  }
}

async function showCatalog() {
  console.log(`Loading reseller catalog and computing Atke Shop profit margins...\n`);
  let rawProducts = null;

  if (client.apiKey) {
    try {
      const resp = await client.getProducts();
      rawProducts = resp.products || resp;
      console.log(`📡 Synced live catalog from YeneShop API (${rawProducts.length} products).`);
    } catch (err) {
      console.warn(`⚠️ Live sync failed (${err.message}). Using verified snapshot from screen recording.`);
    }
  } else {
    console.log(`ℹ️ No API key set yet. Displaying verified snapshot catalog from Reseller.mp4:`);
  }

  const catalog = pricing.processCatalog(rawProducts);

  console.log(`\n---------------------------------------------------------------------------------------------------------`);
  console.log(`| #  | Product Name                             | Wholesale | Atke Retail | Profit (ETB) | Margin % | Type   |`);
  console.log(`---------------------------------------------------------------------------------------------------------`);

  let totalPotentialProfit = 0;
  catalog.forEach((p, idx) => {
    const num = String(idx + 1).padEnd(2);
    const name = p.name.length > 40 ? p.name.substring(0, 37) + '...' : p.name.padEnd(40);
    const wholesale = `${p.wholesalePrice.toLocaleString()} ETB`.padStart(10);
    const retail = `${p.retailPrice.toLocaleString()} ETB`.padStart(11);
    const profit = `+${p.profitEtb.toLocaleString()} ETB`.padStart(12);
    const margin = `${p.profitMarginPct}%`.padStart(8);
    const type = (p.deliveryType === 'instant' ? '⚡ Instant' : '📝 Manual').padEnd(8);

    totalPotentialProfit += p.profitEtb;
    console.log(`| ${num} | ${name} | ${wholesale} | ${retail} | ${profit} | ${margin} | ${type} |`);
  });

  console.log(`---------------------------------------------------------------------------------------------------------`);
  console.log(`Average Profit per Sale: ~${Math.round(totalPotentialProfit / catalog.length).toLocaleString()} ETB`);
  console.log(`\n💡 To adjust retail price: node cli.js set-price <productId> <newPrice>\n`);
}

function setKey(apiKey, mode = 'sandbox') {
  if (!apiKey) {
    console.log(`Usage: node cli.js set-key <YOUR_KEY> [sandbox|live]`);
    return;
  }
  const config = pricing.config;
  if (!config.resellerApi) config.resellerApi = {};

  const cleanKey = apiKey.trim().replace(/^Bearer\s+/i, '');
  if (mode.toLowerCase() === 'live') {
    config.resellerApi.liveApiKey = cleanKey;
    console.log(`✅ LIVE API Key saved!`);
  } else {
    config.resellerApi.sandboxApiKey = cleanKey;
    console.log(`✅ SANDBOX API Key saved!`);
  }
  pricing.saveConfig(config);
}

function setMode(mode) {
  if (!mode || !['sandbox', 'live'].includes(mode.toLowerCase())) {
    console.log(`Usage: node cli.js set-mode <sandbox|live>`);
    return;
  }
  const config = pricing.config;
  config.resellerApi.mode = mode.toLowerCase();
  pricing.saveConfig(config);
  console.log(`✅ Active environment switched to: [${mode.toUpperCase()}]`);
}

function setPrice(productId, newPrice) {
  if (!productId || !newPrice || isNaN(Number(newPrice))) {
    console.log(`Usage: node cli.js set-price <productId> <newPriceInETB>`);
    console.log(`Example: node cli.js set-price nordvpn-3m 1290`);
    return;
  }
  pricing.setCustomPrice(productId, Number(newPrice));
  console.log(`✅ Price updated! Product '${productId}' will now retail for ${Number(newPrice).toLocaleString()} ETB on Atke Shop.`);
}

async function testOrder(productId, customerInput) {
  if (!productId) {
    console.log(`Usage: node cli.js test-order <productId> [customerInput]`);
    console.log(`Example: node cli.js test-order nordvpn-3m`);
    return;
  }

  console.log(`Initiating automated fulfillment test for: ${productId}...`);
  console.log(`Mode: ${client.mode.toUpperCase()}`);

  try {
    const externalId = `ATKE-TEST-${Date.now()}`;
    console.log(`Generated idempotency externalId: ${externalId}`);

    const result = await client.createOrder({
      productId,
      externalId,
      customerInput
    });

    console.log(`\n🎉 Order Successfully Created & Fulfilled!`);
    console.log(`-------------------------------------------`);
    console.log(`Order ID:`, result.orderId || result.id);
    console.log(`Status:`, result.status);
    console.log(`Delivered Items (Credentials/Keys):`);
    console.dir(result.deliveredItems || result.items, { depth: null });
    console.log(`Instructions:`, result.instructions || 'N/A');
    console.log(`Remaining Wallet Balance:`, result.balance);
    console.log(`-------------------------------------------\n`);
  } catch (err) {
    console.error(`❌ Order placement failed: ${err.message}`);
    if (err.data) console.error(`Response details:`, err.data);
  }
}

function showHelp() {
  console.log(`Available commands:`);
  console.log(`  node cli.js test                    - Test connectivity & validate active API key`);
  console.log(`  node cli.js balance                 - Check current Live or Sandbox wallet balance`);
  console.log(`  node cli.js catalog                 - View wholesale prices, retail prices & profit margins`);
  console.log(`  node cli.js set-key <KEY> [mode]    - Save your Sandbox or Live API key`);
  console.log(`  node cli.js set-mode <sandbox|live> - Toggle between Sandbox and Live mode`);
  console.log(`  node cli.js set-price <id> <price>  - Customize retail selling price for any product`);
  console.log(`  node cli.js test-order <id> [input] - Place test order in sandbox & verify digital delivery`);
  console.log(`\n  node server.js                      - Launch the interactive Atke Shop Web & Mini App Store`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
});
