-- ==========================================================
-- TELEGRAM MINI APP & BOT DATABASE SCHEMA (YeneShop Clone)
-- Target: MySQL 8.0+ / MariaDB 10.4+ on Plesk PHP 8.3 Hosting
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------
-- 1. Table: users
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `telegram_id` BIGINT UNIQUE NOT NULL,
    `first_name` VARCHAR(255) NOT NULL DEFAULT '',
    `username` VARCHAR(255) NULL,
    `wallet_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `role` ENUM('customer', 'staff', 'admin') NOT NULL DEFAULT 'customer',
    `referred_by` BIGINT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_users_telegram_id` (`telegram_id`),
    INDEX `idx_users_role` (`role`),
    INDEX `idx_users_referred_by` (`referred_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 2. Table: products
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `products` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT 'Services',
    `price_etb` DECIMAL(10,2) NOT NULL,
    `cost_price_etb` DECIMAL(10,2) NOT NULL DEFAULT 0.00, -- Wholesale / acquisition cost for profit tracking
    `variants_json` TEXT NULL, -- JSON array for multi-tiered items (e.g. 3m, 6m, 12m) triggers "Choose" button
    `description` TEXT NULL,
    `how_to_use` TEXT NULL, -- Bullet points/guide shown under "Show my item" in Orders
    `icon_url` VARCHAR(500) NULL,
    `badge` VARCHAR(50) NULL, -- e.g. 'HOT', 'POPULAR', '1 YEAR', 'LIMITED'
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_products_active_cat` (`is_active`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 3. Table: product_vault (Digital stock inventory)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `product_vault` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `product_id` INT NOT NULL,
    `variant_name` VARCHAR(100) NULL, -- Optional link to variant (e.g. '3 months', '12 months')
    `item_payload` TEXT NOT NULL, -- Activation link, serial key, license code, or account credentials
    `is_sold` TINYINT(1) NOT NULL DEFAULT 0,
    `sold_to_user` BIGINT NULL,
    `sold_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_vault_product_sold` (`product_id`, `is_sold`),
    INDEX `idx_vault_sold_user` (`sold_to_user`),
    CONSTRAINT `fk_vault_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 4. Table: deposits (Telebirr, CBE, EBirr pending review)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `deposits` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `telegram_id` BIGINT NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `payment_method` VARCHAR(100) NOT NULL DEFAULT 'Telebirr',
    `receipt_raw` TEXT NOT NULL,
    `receipt_image_url` VARCHAR(500) NULL, -- Uploaded screenshot path
    `extracted_txn_id` VARCHAR(100) NULL UNIQUE,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `reviewed_at` TIMESTAMP NULL,
    INDEX `idx_deposits_user_status` (`telegram_id`, `status`),
    INDEX `idx_deposits_txn_id` (`extracted_txn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 5. Table: orders (Delivered purchases with profit tracking)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `telegram_id` BIGINT NOT NULL,
    `product_id` INT NOT NULL,
    `selected_variant` VARCHAR(100) NULL,
    `price_paid` DECIMAL(10,2) NOT NULL,
    `cost_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `profit` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `delivered_payload` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_orders_user` (`telegram_id`),
    INDEX `idx_orders_product` (`product_id`),
    CONSTRAINT `fk_orders_product` FOREIGN KEY (`product_id`) 
        REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 6. Table: payment_methods (Dynamically managed in Admin Panel)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payment_methods` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) UNIQUE NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `account_number` VARCHAR(100) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `instructions` TEXT NULL,
    `qr_image_url` VARCHAR(500) NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `display_order` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_pm_active_order` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- SEED PAYMENT RECEIVING ACCOUNTS (Admin Customizable)
-- ==========================================================
INSERT INTO `payment_methods` (`code`, `name`, `account_number`, `account_name`, `instructions`, `is_active`, `display_order`) VALUES
('telebirr', 'Telebirr', '0906818924', 'Mohammed Abdirahman Ibrahim', 'Transfer to 0906818924 (Mohammed Abdirahman Ibrahim) via Telebirr app or *127# and submit the confirmation SMS text or Transaction ID.', 1, 1),
('cbe', 'Commercial Bank of Ethiopia (CBE)', '1000233801837', 'Mohammed Abdirahman Ibrahim', 'Transfer to CBE Account 1000233801837 (Mohammed Abdirahman Ibrahim) via CBE Birr or Mobile Banking, and submit the confirmation SMS or Txn ID.', 1, 2),
('ebirr', 'E-Birr (Coop / Kaafi)', '0906818924', 'Mohammed Abdirahman Ibrahim', 'Transfer via E-Birr to 0906818924 (Mohammed Abdirahman Ibrahim) and submit the transaction confirmation SMS text.', 1, 3)
ON DUPLICATE KEY UPDATE 
    `account_number` = VALUES(`account_number`),
    `account_name` = VALUES(`account_name`),
    `instructions` = VALUES(`instructions`);

-- ==========================================================
-- SEED INITIAL DIGITAL PRODUCTS & INVENTORY VAULT
-- ==========================================================

INSERT INTO `products` (`id`, `name`, `category`, `price_etb`, `cost_price_etb`, `variants_json`, `description`, `how_to_use`, `icon_url`, `badge`, `is_active`) VALUES
(1, 'Telegram Premium', 'Social', 2500.00, 1900.00, '[{"name":"3 months","price":2500.00,"cost":1900.00,"status":"Available"},{"name":"6 months","price":3400.00,"cost":2600.00,"status":"Available"},{"name":"12 months","price":6200.00,"cost":4800.00,"status":"Available"}]', 'Official Telegram Premium subscription gift. 4GB uploads, faster downloads, voice-to-text, and exclusive badge.', '⚡ Direct Gift Link or Activation\n⚡ 4GB file uploads\n⚡ Voice-to-text audio transcriptions\n⚡ Animated profile badges & emoji status\n⚡ Zero ads across all channels', 'https://img.icons8.com/color/480/telegram-app.png', 'POPULAR', 1),
(2, 'SoundCloud Artist Pro', 'Services', 400.00, 250.00, NULL, 'Unlimited track uploads, advanced audience analytics, and spotlight profile styling for musicians and creators.', '⚡ Unlimited Track Uploads\n⚡ Advanced Listener Demographics\n⚡ Monetization Ready\n⚡ Custom Spotlight Header & Bio', 'https://img.icons8.com/color/480/soundcloud.png', NULL, 1),
(3, 'Railway Hobby 12m', 'Services', 3850.00, 3000.00, NULL, '1-Year Railway Hobby plan for hosting cloud applications, background workers, Postgres, and Redis databases.', '⚡ 1 Year Railway Hobby Plan\n⚡ $5/mo usage credits included\n⚡ 8GB RAM per container\n⚡ Custom Domains & Auto SSL', 'https://img.icons8.com/ios-filled/500/train.png', 'POPULAR', 1),
(4, 'Replit Core 12m', 'Services', 45000.00, 38000.00, NULL, 'Full Replit Core membership for 12 months with AI Agent code completion, unlimited private cloud Repls.', '⚡ 1 Year Replit Core Plan\n⚡ Advanced AI Code Generator\n⚡ Unlimited Private Repls\n⚡ Persistent Background Cloud VMs', 'https://img.icons8.com/color/480/replit.png', 'POPULAR', 1),
(5, 'Gemini AI Pro 18m', 'AI Tools', 385.00, 200.00, NULL, 'Full Google Gemini Advanced plan with 5TB Google One cloud storage and priority access.', '⚡ 18 Months Plan\n⚡ 5TB cloud storage included\n⚡ You can add 5 users\n⚡ No sharing — 100% private\n⚡ No card needed\n⚡ Works in any country, no verification\n⚡ Non-warranty\n⚡ May last before 18 Months sometimes', 'https://img.icons8.com/color/480/google-gemini.png', 'POPULAR', 1),
(6, 'Canva Pro 3 Year', 'Design', 300.00, 150.00, NULL, 'Direct educational/team upgrade to your personal Canva email. Unlimited premium assets and Magic Studio.', '⚡ 3-Year Canva Pro Access\n⚡ Connects directly to your email\n⚡ Magic Studio & AI tools included\n⚡ 1TB Cloud Storage\n⚡ Millions of premium fonts & templates', 'https://img.icons8.com/color/480/canva.png', 'POPULAR', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `price_etb` = VALUES(`price_etb`), `cost_price_etb` = VALUES(`cost_price_etb`), `variants_json` = VALUES(`variants_json`), `how_to_use` = VALUES(`how_to_use`);

-- Digital Keys / Accounts for testing (Placeholders)
INSERT INTO `product_vault` (`product_id`, `item_payload`, `is_sold`) VALUES
(1, 'DEMO-KEY: Gemini Advanced License #001', 0),
(1, 'DEMO-KEY: Gemini Advanced License #002', 0),
(2, 'DEMO-INVITE: Canva Pro 1-Year Team Access Link #001', 0),
(2, 'DEMO-INVITE: Canva Pro 1-Year Team Access Link #002', 0),
(3, 'DEMO-GIFT: Telegram Premium 3-Month Gift Code #001', 0),
(3, 'DEMO-GIFT: Telegram Premium 3-Month Gift Code #002', 0),
(4, 'DEMO-CREDENTIALS: NordVPN Dedicated Account #001', 0),
(5, 'DEMO-CREDENTIALS: ChatGPT Plus Account Access #001', 0),
(6, 'DEMO-INVITE: Spotify Premium Invite Link #001', 0);
