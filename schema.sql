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
    `payment_method` ENUM('Telebirr', 'CBE', 'EBirr') NOT NULL,
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

SET FOREIGN_KEY_CHECKS = 1;

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

-- Digital Keys / Accounts for testing
INSERT INTO `product_vault` (`product_id`, `item_payload`, `is_sold`) VALUES
(1, 'Account: gemini-user14@hiigsan.et | Pass: GeminiPro#2026! | Backup Code: 88492041 | Login via google.com', 0),
(1, 'Account: gemini-user15@hiigsan.et | Pass: GeminiUltra#Et77 | Backup Code: 33918472 | Login via google.com', 0),
(2, 'https://www.canva.com/brand/join?token=canva_pro_inv_et_993821048_team', 0),
(2, 'https://www.canva.com/brand/join?token=canva_pro_inv_et_447291032_team', 0),
(2, 'https://www.canva.com/brand/join?token=canva_pro_inv_et_118374920_team', 0),
(3, 'https://t.me/giftcode/TG-PREM-ETB-9923847-XKLM', 0),
(3, 'https://t.me/giftcode/TG-PREM-ETB-1184930-QPZR', 0),
(4, 'NordVPN Login -> Email: vpn-eastafrica01@atke.com.et | Pass: NordFast#2026Safe', 0),
(5, 'ChatGPT Plus -> Email: chatgpt-pro33@hiigsan.et | Pass: OpenAi#Et2026Plus | PIN: 9021', 0),
(6, 'Spotify Family Invite: https://www.spotify.com/et/family/join/invite/6628401928472/', 0);
