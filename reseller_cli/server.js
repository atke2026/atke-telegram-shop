/**
 * Atke Shop Reseller Web & Mini App Server
 * Lightweight, zero-dependency Node.js HTTP server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const YeneShopClient = require('./yeneshop_client');
const { PricingEngine } = require('./pricing_engine');

const PORT = process.env.PORT || 3000;
const client = new YeneShopClient();
const pricing = new PricingEngine();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  // --- API Endpoints ---
  if (pathname.startsWith('/api/')) {
    try {
      // 1. GET /api/status - Get integration status, mode, and balance
      if (pathname === '/api/status' && method === 'GET') {
        let balanceData = null;
        let connectionError = null;

        if (client.apiKey) {
          try {
            balanceData = await client.getBalance();
          } catch (err) {
            connectionError = err.message;
          }
        }

        return sendJson(res, {
          status: 'ok',
          storeName: pricing.config.storeName || 'Atke Shop',
          currency: pricing.config.currency || 'ETB',
          mode: client.mode,
          hasKey: Boolean(client.apiKey),
          keyPreview: client.apiKey ? `${client.apiKey.substring(0, 6)}...${client.apiKey.slice(-4)}` : null,
          balance: balanceData,
          connectionError
        });
      }

      // 2. POST /api/config - Update API keys or mode
      if (pathname === '/api/config' && method === 'POST') {
        const body = await parseBody(req);
        const config = pricing.config;

        if (body.mode && ['sandbox', 'live'].includes(body.mode)) {
          config.resellerApi.mode = body.mode;
          client.mode = body.mode;
        }

        if (body.sandboxApiKey !== undefined) {
          config.resellerApi.sandboxApiKey = body.sandboxApiKey.trim().replace(/^Bearer\s+/i, '');
        }

        if (body.liveApiKey !== undefined) {
          config.resellerApi.liveApiKey = body.liveApiKey.trim().replace(/^Bearer\s+/i, '');
        }

        // Re-read active key for client
        const activeKey = client.mode === 'live' ? config.resellerApi.liveApiKey : config.resellerApi.sandboxApiKey;
        client.apiKey = activeKey || '';

        pricing.saveConfig(config);
        return sendJson(res, { success: true, message: 'Configuration saved successfully', mode: client.mode, hasKey: Boolean(client.apiKey) });
      }

      // 3. GET /api/catalog - Get full catalog with Atke Shop retail pricing and profits
      if (pathname === '/api/catalog' && method === 'GET') {
        let rawProducts = null;
        let isLiveSync = false;

        if (client.apiKey) {
          try {
            const resp = await client.getProducts();
            rawProducts = resp.products || resp;
            isLiveSync = true;
          } catch (e) {
            console.warn('Could not sync live catalog from YeneShop API, using verified snapshot:', e.message);
          }
        }

        const products = pricing.processCatalog(rawProducts);
        return sendJson(res, {
          success: true,
          isLiveSync,
          mode: client.mode,
          products,
          count: products.length
        });
      }

      // 4. POST /api/price - Update custom price for a product
      if (pathname === '/api/price' && method === 'POST') {
        const body = await parseBody(req);
        const { productId, price } = body;
        if (!productId || !price || isNaN(Number(price))) {
          return sendJson(res, { error: 'productId and numeric price are required' }, 400);
        }

        pricing.setCustomPrice(productId, Number(price));
        return sendJson(res, { success: true, message: `Price for ${productId} updated to ${price} ETB` });
      }

      // 5. POST /api/buy - Order fulfillment (retail customer purchase -> YeneShop wholesale order)
      if (pathname === '/api/buy' && method === 'POST') {
        const body = await parseBody(req);
        const { productId, customerInput, customerName } = body;

        if (!productId) {
          return sendJson(res, { error: 'productId is required' }, 400);
        }

        // Locate product
        const catalog = pricing.processCatalog();
        const product = catalog.find(p => p.id === productId || String(p.id) === String(productId));

        if (!product) {
          return sendJson(res, { error: 'Product not found' }, 404);
        }

        if (product.customerInput && !customerInput) {
          return sendJson(res, { error: `Customer detail required: ${product.customerInput}` }, 400);
        }

        // If client has no API key yet, simulate a successful sandbox delivery demo!
        if (!client.apiKey) {
          const fakeOrderId = `ATKE-SIM-${Date.now()}`;
          return sendJson(res, {
            success: true,
            simulated: true,
            message: 'Order fulfilled in Demo Mode (Configure your YeneShop Sandbox key for real API fulfillment)',
            order: {
              orderId: fakeOrderId,
              externalId: `EXT-${fakeOrderId}`,
              productName: product.name,
              retailPricePaid: product.retailPrice,
              wholesaleCost: product.wholesalePrice,
              atkeProfitEtb: product.profitEtb,
              deliveredItems: [
                {
                  type: 'license_key',
                  value: `ATKE-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
                },
                {
                  type: 'account_credentials',
                  value: `user_${Math.random().toString(36).substring(2, 6)}@atkeshop.et : Pass#2026!`
                }
              ],
              instructions: `1. Log in or activate using the credentials above.\n2. In case of questions, contact ${pricing.config.contact?.telegramSupport || '@AtkeSupport'}.\nThank you for shopping with Atke Shop!`,
              status: 'completed',
              createdAt: new Date().toISOString()
            }
          });
        }

        // Live/Sandbox order through YeneShop Reseller API
        try {
          const externalId = `ATKE-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const orderResult = await client.createOrder({
            productId: product.id,
            externalId,
            customerInput
          });

          return sendJson(res, {
            success: true,
            simulated: false,
            order: {
              ...orderResult,
              productName: product.name,
              retailPricePaid: product.retailPrice,
              wholesaleCost: product.wholesalePrice,
              atkeProfitEtb: product.profitEtb
            }
          });
        } catch (apiErr) {
          console.error('YeneShop API order error:', apiErr);
          return sendJson(res, {
            error: apiErr.message,
            details: apiErr.data || null
          }, apiErr.status || 500);
        }
      }

      // Not found
      return sendJson(res, { error: 'Endpoint not found' }, 404);
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, { error: err.message }, 500);
    }
  }

  // --- Static File Serving ---
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'public', 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n===========================================================`);
  console.log(`  🛍️  ATKE SHOP RESELLER STOREFRONT & API RUNNING!`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Environment Mode: ${client.mode.toUpperCase()}`);
  console.log(`  API Key: ${client.apiKey ? 'Configured ✅' : 'Not set (Demo mode) ⚠️'}`);
  console.log(`===========================================================\n`);
});
