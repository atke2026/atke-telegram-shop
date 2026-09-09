# YeneShop - Telegram Mini App & Bot for Digital Products

Full-stack Telegram Mini App (TMA) and pure PHP Telegram Bot built to sell digital accounts, vouchers, and licenses (Gemini Pro, Canva, VPNs, Telegram Premium) with an integrated Ethiopian Birr (ETB) in-app wallet.

Engineered specifically for **Ethio Telecom Linux Shared Hosting (Plesk Control Panel, PHP 8.3, MySQL)**.

---

## Architecture & Directory Structure

```text
├── api/
│   ├── config.php          # Central configuration, DB connection singleton & Telegram API helpers
│   ├── auth.php            # Cryptographic HMAC-SHA256 initData validation & user upsert
│   ├── store.php           # Catalog retrieval & atomic row-locked digital stock checkout
│   ├── deposit.php         # Telebirr/CBE receipt submission & Telegram admin alert
│   ├── webhook.php         # Telegram Bot webhook (/start menu, admin approve/reject buttons)
│   └── orders.php          # Customer purchase history & delivered digital keys
├── public/
│   ├── index.html          # Responsive Dark Mode Single Page App (Tailwind CSS, Lucide icons)
│   └── app.js              # Telegram WebApp SDK integration, state management, haptics
├── schema.sql              # MySQL database migration with tables and seed inventory
├── setup_webhook.php       # One-click browser utility to register/inspect Telegram webhook
├── .htaccess               # Apache/LiteSpeed security headers & iframe allowances
└── README.md               # Step-by-step setup and deployment manual
```

---

## 🚀 Step-by-Step Deployment Guide (Ethio Telecom Plesk)

### Step 1: Create Subdomain in Plesk
1. Log in to your Plesk Control Panel (`https://atke.com.et:8443` or `https://hiigsan.et:8443`).
2. Go to **Websites & Domains** > **Add Subdomain**.
3. Create a subdomain such as:
   - `shop.atke.com.et` (on Linux Bronze plan) OR
   - `app.hiigsan.et` (on Linux Gold plan)
4. Ensure **PHP version** is set to **8.3**.
5. Enable **Let's Encrypt SSL Certificate** for the subdomain so HTTPS is active.

---

### Step 2: Create MySQL Database & Import Schema
1. In Plesk, click **Databases** > **Add Database**.
   - Database name: e.g. `yeneshop_db`
   - Database user: e.g. `yeneshop_user`
   - Password: Choose a strong password.
2. Click **phpMyAdmin** next to your newly created database.
3. In phpMyAdmin, go to the **Import** tab.
4. Click **Choose File**, select [`schema.sql`](schema.sql), and click **Import**.
5. This creates the 5 core tables (`users`, `products`, `product_vault`, `deposits`, `orders`) and pre-loads sample Ethiopian digital products and keys.

---

### Step 3: Create Telegram Bot via @BotFather
1. Open Telegram and search for [@BotFather](https://t.me/BotFather).
2. Send `/newbot`.
3. Choose a display name (e.g. `YeneShop Digital Store`) and a username ending in `bot` (e.g. `atke_shop_bot`).
4. Copy the HTTP API token provided by BotFather (e.g., `7182938491:AAH...`).
5. Set the Bot Menu Button to open your Mini App:
   - Send `/setmenubutton` to BotFather.
   - Select your bot.
   - Enter your Mini App URL: `https://shop.atke.com.et/public/index.html` (or `https://app.hiigsan.et/public/index.html`).
   - Enter button label: `🛍️ Open Store`.

---

### Step 4: Find Your Personal Telegram Admin ID
1. Search for [@userinfobot](https://t.me/userinfobot) in Telegram and tap **Start**.
2. Note your numerical **Id** (e.g., `123456789`). This is your `ADMIN_CHAT_ID`.

---

### Step 5: Configure `api/config.php`
Open [`api/config.php`](api/config.php) on your server (via Plesk File Manager or FTP) and update the following settings:

```php
// 1. Primary Domain
define('APP_DOMAIN', 'shop.atke.com.et'); // or 'app.hiigsan.et'
define('APP_URL', 'https://' . APP_DOMAIN);

// 2. Telegram Bot
define('BOT_TOKEN', '7182938491:AAH...'); // Your BotFather token
define('ADMIN_CHAT_ID', 123456789);         // Your personal Telegram ID
define('BOT_USERNAME', 'atke_shop_bot');    // Your bot username without @

// 3. MySQL Database Credentials
define('DB_HOST', 'localhost');
define('DB_NAME', 'yeneshop_db');
define('DB_USER', 'yeneshop_user');
define('DB_PASS', 'YourStrongPassword123!');

// 4. Payment Receiving Details
define('PAYMENT_TELEBIRR_PHONE', '0911223344');
define('PAYMENT_TELEBIRR_NAME', 'Atke Tech / Digital Store');
define('PAYMENT_CBE_ACCOUNT', '1000234567891');
define('PAYMENT_CBE_NAME', 'Atke Tech Solutions');
```

---

### Step 6: Upload Files to Plesk
Upload all project files directly to your subdomain's `httpdocs` directory using Plesk File Manager or SFTP:
```text
/var/www/vhosts/atke.com.et/shop.atke.com.et/httpdocs/
├── api/
├── public/
├── setup_webhook.php
├── .htaccess
└── schema.sql
```

---

### Step 7: Register Telegram Webhook
1. Open your browser and navigate to:
   `https://shop.atke.com.et/setup_webhook.php`
2. Click the green button: **🚀 Register Webhook**.
3. You will see a confirmation message from Telegram API:
   ```json
   {
       "ok": true,
       "result": true,
       "description": "Webhook was set"
   }
   ```
4. *(Optional for extra security)*: Delete or rename `setup_webhook.php` after confirmation.

---

## 🛒 How the System Operates

### 1. Customer Experience
1. Customer opens [@atke_shop_bot](https://t.me/atke_shop_bot) on Telegram.
2. Bot welcomes user and provides the `🛍️ Open Store (Mini App)` button.
3. Customer browses Gemini Pro, Canva, and VPN subscriptions with live ETB prices and stock.
4. **Depositing ETB**:
   - In the **Wallet** tab, the customer selects **Telebirr** or **CBE Bank**.
   - Taps "Copy Account", opens their banking app, and completes the transfer.
   - Pastes the SMS receipt confirmation text into the submission form.
5. **Instant Purchases**:
   - Customer taps "Buy Now" on any available item.
   - System verifies balance, locks 1 unsold key via atomic MySQL row-locking (`FOR UPDATE`), deducts ETB, and delivers the key immediately on screen and via bot DM.

### 2. Admin Deposit Verification
1. When a user submits a deposit receipt, the backend immediately sends a high-priority alert to your personal Telegram chat:
   ```text
   ⚡ NEW DEPOSIT REQUEST (#14)
   👤 Customer: Abel (@abel_t)
   🆔 Telegram ID: 55492810
   💰 Claimed Amount: 350.00 ETB
   🏦 Payment Method: Telebirr
   🔖 Extracted Txn: 9AA04K19

   📄 Receipt Text:
   "Your account 09... transferred 350.00 ETB to Atke Tech. Txn ID: 9AA04K19..."
   ```
2. You check your Telebirr/CBE app for the incoming transfer.
3. Tap **[ ✅ Approve 350 ETB ]** directly inside Telegram.
4. The system:
   - Updates the deposit to `approved` inside a database transaction.
   - Credits 350.00 ETB to the user's wallet.
   - Updates your Telegram message to show `APPROVED by Admin`.
   - Sends a celebration message to the customer with a button to open the store.

---

---

## 👑 In-App Admin Panel & Stock Management

No phpMyAdmin SQL queries are needed! You can manage everything directly inside Telegram.

### 1. Accessing the Admin Panel
- **Method 1**: In the Mini App, an exclusive **👑 Admin** button appears in the top header and bottom navigation bar when logged in with your `ADMIN_CHAT_ID`.
- **Method 2**: Send `/admin` to your bot on Telegram and tap **[ 👑 Launch Admin Dashboard ]**.
- **Method 3**: Direct URL: `https://shop.atke.com.et/public/index.html?tab=admin`

### 2. Managing Prices & Product Images
1. Open the **👑 Admin** tab > **📦 Products & Stock**.
2. Tap **Edit** on any product.
3. Update the **Price (ETB)**, paste a new **Icon Image URL** (with live preview!), update the title or badge, and tap **Save Product**.
4. The main customer store catalog updates immediately!

### 3. Bulk Uploading Stock to the Digital Vault
1. In the Admin tab, tap **+ Keys** on any product.
2. Paste multiple license keys, accounts, or invite links into the text box (one key per line):
   ```text
   DEMO-ACCOUNT-LICENSE-KEY-001
   DEMO-ACCOUNT-LICENSE-KEY-002
   https://example.com/invite-link-003
   ```
3. Tap **Upload to Vault**.
4. The system adds each line as an unsold stock item in `product_vault` and immediately updates the live in-stock badge.

### 4. Inspecting & Cleaning Vault Keys
- Tap **Inspect** on any product to view all unsold keys currently in the vault.
- Tap **Delete** next to any item if entered mistakenly.

### 5. Reviewing & Approving Deposits
- Tap the **💳 Deposits Queue** sub-tab to see pending customer payments.
- Each card shows the customer's Telegram ID, name, payment method, claimed ETB amount, and raw SMS confirmation receipt.
- Tap **[ Approve & Credit ]** to credit their ETB balance and send a celebration notification DM via the bot.
- Tap **[ Reject ]** to mark invalid attempts and notify the user.

---

## 🌐 Ethio Telecom DNS Setup (`myportal.ethiotelecom.et`)

In the Ethio Telecom Hosting Portal (**Edit Domain DNS** for `atke.com.et`):

| Field | Value to Enter | Notes |
|---|---|---|
| **Host** | `shop` | Subdomain prefix for `shop.atke.com.et` |
| **Type** | `A` | IPv4 Address record |
| **Value** | `213.55.96.152` | Your Ethio Telecom Plesk Bronze server IP |
| **Priority** | *(Leave Blank or 0)* | Only needed for MX records |
| **TTL** | `3600` | 1 hour cache expiration |

Once saved in Ethio Telecom's portal, the DNS record propagates, Plesk's resolution warning clears, and your Telegram webhook will connect seamlessly!

