# 🛍️ Atke Shop - YeneShop Wholesale Reseller Configuration

Automated digital storefront and reseller profit engine for **Atke Shop**, integrating directly with the **YeneShop Reseller API** (`https://yeneshop.amixmon.com/api/reseller/v1`).

---

## 📋 Quick Start Guide

### 1. Generate Your API Keys in Telegram

From your screen recording (`Reseller.mp4`), your reseller account is active on YeneShop. To connect:

1. Open the **YeneShop** Telegram Mini App.
2. Tap the **Reseller** tab in the bottom navigation bar.
3. Tap **API keys**.
4. Tap **Generate key** under **Sandbox key** (and/or **Live key**).
5. **Copy the key immediately** (it is only shown once).

### 2. Configure Your Key

Save your key using the CLI:

```bash
# Save your Sandbox key:
node cli.js set-key YOUR_SANDBOX_KEY sandbox

# Save your Live key:
node cli.js set-key YOUR_LIVE_KEY live
```

Or switch active environment mode anytime:

```bash
node cli.js set-mode sandbox
# or
node cli.js set-mode live
```

### 3. Launch Atke Shop Storefront & Reseller Manager

Run the server command:

```bash
node server.js
```

Open **`http://localhost:3000`** in your browser to access:

- **Customer Storefront**: Displays digital accounts & licenses at your custom retail prices in Ethiopian Birr (ETB).
- **Instant Digital Delivery**: Automatically requests `POST /orders` from YeneShop and delivers license keys/account credentials to your buyer instantly.
- **Reseller Admin Panel** (Click `⚙️ Reseller Settings`): View wallet balances, inspect wholesale costs, and edit retail prices with live profit margin calculations.

---

## 💻 CLI Commands

| Command | Description |
| :--- | :--- |
| `node cli.js test` | Tests API connection and verifies your active API key |
| `node cli.js balance` | Checks current Live or Sandbox wallet balance in ETB |
| `node cli.js catalog` | Displays table of all 16 wholesale products, retail prices, and profit per item |
| `node cli.js set-price <productId> <price>` | Updates custom retail selling price (e.g. `node cli.js set-price nordvpn-3m 1250`) |
| `node cli.js set-key <KEY> [mode]` | Saves your Sandbox or Live API key |
| `node cli.js set-mode <sandbox\|live>` | Toggles between Sandbox and Live mode |
| `node cli.js test-order <productId>` | Executes a test purchase in sandbox and displays delivered digital keys |

---

## 💰 Wholesale vs Retail Profit Structure

| Product Name | Wholesale Cost (YeneShop) | Atke Retail Price | Net Profit per Sale | Margin % | Delivery Type |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Nord VPN 3m** | 650 ETB | 1,250 ETB | **+600 ETB** | **92.3%** | ⚡ Instant |
| **ElevenLabs Creator 12m** | 9,000 ETB | 10,500 ETB | **+1,500 ETB** | **16.7%** | ⚡ Instant |
| **Gamma Pro 12m** | 5,850 ETB | 8,000 ETB | **+2,150 ETB** | **36.8%** | ⚡ Instant |
| **QuillBot Premium 1m** | 700 ETB | 850 ETB | **+150 ETB** | **21.4%** | ⚡ Instant |
| **Gemini AI Pro 18m** | 400 ETB | 600 ETB | **+200 ETB** | **50.0%** | ⚡ Instant |
| **Replit Core 12m** | 7,300 ETB | 7,800 ETB | **+500 ETB** | **6.8%** | ⚡ Instant |
| **n8n Starter 12m** | 5,900 ETB | 6,500 ETB | **+600 ETB** | **10.2%** | ⚡ Instant |
| **Github Developer Pack (2y)** | 3,150 ETB | 3,800 ETB | **+650 ETB** | **20.6%** | ⚡ Instant |
| **Railway Hobby 12m** | 2,700 ETB | 3,200 ETB | **+500 ETB** | **18.5%** | ⚡ Instant |

> [!NOTE]
> Average profit per order is **~558 ETB** across the catalog.

---

## 📁 Project Architecture

- [`config.json`](config.json): Central configuration for pricing rules, default margins, API credentials, and store settings.
- [`yeneshop_client.js`](yeneshop_client.js): Production-grade REST client for YeneShop Reseller API (`GET /balance`, `GET /products`, `POST /orders`, `GET /orders/:id`).
- [`pricing_engine.js`](pricing_engine.js): Margin calculation engine, catalog synchronizer, and snapshot cache.
- [`cli.js`](cli.js): Interactive command-line management and testing suite.
- [`server.js`](server.js): Zero-dependency Node.js HTTP server and REST endpoints.
- [`public/`](public/): Modern dark-mode responsive customer storefront and reseller management UI.
