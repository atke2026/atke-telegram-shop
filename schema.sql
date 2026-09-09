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
    `referred_by` BIGINT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_users_telegram_id` (`telegram_id`),
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
    `description` TEXT NULL,
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
    `extracted_txn_id` VARCHAR(100) NULL UNIQUE,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `reviewed_at` TIMESTAMP NULL,
    INDEX `idx_deposits_user_status` (`telegram_id`, `status`),
    INDEX `idx_deposits_txn_id` (`extracted_txn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------
-- 5. Table: orders (Delivered purchases)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `telegram_id` BIGINT NOT NULL,
    `product_id` INT NOT NULL,
    `price_paid` DECIMAL(10,2) NOT NULL,
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

INSERT INTO `products` (`id`, `name`, `category`, `price_etb`, `description`, `icon_url`, `badge`, `is_active`) VALUES
(1, 'Gemini Pro 1.5 Advanced (1 Month)', 'AI Tools', 350.00, 'Google Gemini Advanced account with 1M token context, Python code execution, and priority access.', 'https://img.icons8.com/color/480/google-gemini.png', 'POPULAR', 1),
(2, 'Canva Pro Premium (1 Year Invite)', 'Design', 250.00, 'Direct educational/team invite to your personal Canva email. Unlimited premium templates, magic studio, and 1TB storage.', 'https://img.icons8.com/color/480/canva.png', 'BESTSELLER', 1),
(3, 'Telegram Premium (3 Months)', 'Social', 550.00, 'Telegram Premium gift code. 4GB uploads, double limits, voice-to-text transcriptions, and animated emoji status.', 'https://img.icons8.com/color/480/telegram-app.png', 'HOT', 1),
(4, 'NordVPN Ultra (1 Year Account)', 'VPN & Security', 400.00, 'Dedicated login credentials for NordVPN. 60+ countries, bypass geo-blocks, ultra-fast servers with Obfuscation.', 'https://img.icons8.com/color/480/nordvpn.png', 'FEATURED', 1),
(5, 'ChatGPT Plus Shared Account (1 Month)', 'AI Tools', 450.00, 'GPT-4o, DALL-E 3 image generation, and custom GPT store access. Instant delivery with setup guide.', 'https://img.icons8.com/color/480/chatgpt.png', 'NEW', 1),
(6, 'Spotify Premium Individual (3 Months)', 'Entertainment', 300.00, 'Ad-free high-fidelity music streaming, offline downloads, and unlimited skips on any device.', 'https://img.icons8.com/color/480/spotify--v1.png', NULL, 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

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
