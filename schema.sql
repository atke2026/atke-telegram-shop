-- ====================================================================
-- ATKE DIGITAL STORE - TELEGRAM MINI APP DATABASE SCHEMA
-- Target Environment: Plesk Shared Hosting (MySQL 8.x / MariaDB 10.x)
-- Engine: InnoDB (with Row-Level Locking support for concurrency)
-- Charset: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------------------
-- 1. Table: users
-- Stores Telegram users who interact with the bot or Mini App
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
    `telegram_id` BIGINT UNSIGNED NOT NULL,
    `username` VARCHAR(64) DEFAULT NULL,
    `first_name` VARCHAR(128) NOT NULL DEFAULT '',
    `last_name` VARCHAR(128) DEFAULT NULL,
    `language_code` VARCHAR(10) DEFAULT 'en',
    `is_bot` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`telegram_id`),
    INDEX `idx_username` (`username`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 2. Table: products_cache
-- Caches catalog items synced from Ethio-Viral Premium API & local catalog
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS `products_cache`;
CREATE TABLE `products_cache` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(64) NOT NULL DEFAULT 'General',
    `description` TEXT DEFAULT NULL,
    `instructions` TEXT DEFAULT NULL,
    `wholesale_price` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `selling_price` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'ETB',
    `stock` INT NOT NULL DEFAULT 0,
    `image_url` VARCHAR(512) DEFAULT NULL,
    `badge` VARCHAR(64) DEFAULT NULL,
    `warranty` VARCHAR(128) DEFAULT NULL,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `synced_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_category_active` (`category`, `is_active`),
    INDEX `idx_stock` (`stock`),
    INDEX `idx_selling_price` (`selling_price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 3. Table: orders
-- Stores customer checkout, local payment references, and fulfillment states
-- Uses row-level locking (SELECT ... FOR UPDATE) during reconciliation.
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `order_uuid` VARCHAR(64) NOT NULL,
    `telegram_user_id` BIGINT UNSIGNED NOT NULL,
    `product_id` VARCHAR(64) NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'ETB',
    `payment_channel` ENUM('CBE', 'EBIRR', 'KAAFI') NOT NULL,
    `transaction_reference` VARCHAR(128) NOT NULL,
    `ethio_viral_order_id` VARCHAR(128) DEFAULT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `payment_status` ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    `fulfillment_status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `delivery_code` TEXT DEFAULT NULL,
    `redemption_instructions` TEXT DEFAULT NULL,
    `admin_notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_order_uuid` (`order_uuid`),
    UNIQUE KEY `uniq_tx_reference` (`transaction_reference`),
    UNIQUE KEY `uniq_idempotency_key` (`idempotency_key`),
    INDEX `idx_telegram_user` (`telegram_user_id`),
    INDEX `idx_payment_status` (`payment_status`),
    INDEX `idx_fulfillment_status` (`fulfillment_status`),
    INDEX `idx_created_at` (`created_at`),
    CONSTRAINT `fk_orders_user` FOREIGN KEY (`telegram_user_id`) 
        REFERENCES `users` (`telegram_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------
-- 4. Table: system_settings
-- Key-value store for exchange rates, shop configurations, and toggles
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
    `setting_key` VARCHAR(64) NOT NULL PRIMARY KEY,
    `setting_value` TEXT NOT NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ====================================================================
-- INITIAL SEED DATA
-- Default system settings and pre-loaded digital products
-- ====================================================================

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`) VALUES
('usd_to_etb_rate', '140.00', 'Exchange rate used when converting wholesale USD to ETB prices'),
('auto_fulfillment', '0', 'Set to 1 for instant automated API purchase upon admin verification, 0 for manual approval'),
('support_contact', '@suq_support', 'Telegram handle for customer payment inquiries'),
('cbe_account', '1000233801837', 'Commercial Bank of Ethiopia Account Number'),
('cbe_holder', 'Mohammed Abdirahman Ibrahim', 'CBE Account Holder Name'),
('ebirr_account', '0906818924', 'E-Birr / Telebirr Account Number'),
('ebirr_holder', 'Mohammed Abdirahman Ibrahim', 'E-Birr Account Holder Name'),
('kaafi_account', '0906818924', 'Kaafi Account Number'),
('kaafi_holder', 'Mohammed Abdirahman Ibrahim', 'Kaafi Account Holder Name');

-- Pre-seed verified catalog items
INSERT INTO `products_cache` 
(`id`, `name`, `category`, `description`, `instructions`, `wholesale_price`, `selling_price`, `currency`, `stock`, `badge`, `warranty`, `is_active`) 
VALUES
(
    'canva-admin-3y',
    'Canva Admin Panel (3 Years)',
    'Education & Design',
    'Get full access to Canva Education with Advanced verified Admin tools. Access to Canva Pro features, 3-Year account.',
    'Account format: CANVA & Outlook EMAIL:PASS | 2FA EMAIL:PASS | 2FA website. Warranty Terms: 2-Month Full Warranty.',
    20.00,
    3200.00,
    'ETB',
    10,
    'Popular',
    '2-Month Warranty',
    1
),
(
    'coursera-plus-1y',
    'Coursera Premium (1 Year)',
    'Education & Design',
    'Org+ Premium Access. All courses and professional certificates issued in your own name. Ready-made account with mail access.',
    'Instructions: Log in using provided details. Change name and password after first login. Add recovery email. Duration: 12 Months.',
    4.00,
    850.00,
    'ETB',
    50,
    'Instant Delivery',
    '1-Month Warranty',
    1
),
(
    'elevenlabs-creator-1y',
    'ElevenLabs Creator (1 Year)',
    'AI Tools',
    'Official Coupon Code for 12 months Creator plan with monthly voice generation quota. Activated directly on your own personal account.',
    'Instructions: 1. Sign up at elevenlabs.io. 2. Upgrade to Creator plan with Monthly billing. 3. Enter promo code at checkout. Redeem within 7 days.',
    50.00,
    7500.00,
    'ETB',
    15,
    'High Demand',
    'Activation Guarantee',
    1
),
(
    'gamma-pro-1y',
    'Gamma Pro (1 Year)',
    'AI Tools',
    'Create stunning presentations, docs, and web pages with AI. Official 12-month coupon code redeemable on your own account.',
    'Instructions: Log in at gamma.app, select Gamma Pro Yearly, enter promo code at checkout. Redeem within 7 days.',
    30.00,
    4600.00,
    'ETB',
    25,
    'Best Seller',
    'Activation Guarantee',
    1
),
(
    'factory-pro-1y',
    'Factory Pro AI (1 Year)',
    'AI Tools',
    'Autonomous AI software development platform. Official 12-month voucher code redeemable on your account.',
    'Instructions: Create account at app.factory.ai. Visit app.factory.ai/voucher and enter your voucher code.',
    15.00,
    2400.00,
    'ETB',
    12,
    'Developer Choice',
    'Activation Guarantee',
    1
),
(
    'linkedin-business-2m',
    'LinkedIn Business (2 Months)',
    'Business & Career',
    'Premium Business upgrade. 15 InMails/month, see who viewed your profile, Unlimited People Browsing, and business insights.',
    'Works on accounts that have not had active premium in last 12 months. Open redeem link in browser and click Activate.',
    3.00,
    650.00,
    'ETB',
    30,
    'Special Offer',
    'Activation Guarantee',
    1
),
(
    'lovable-lite-1y',
    'Lovable Lite (1 Year)',
    'AI Tools',
    'Build full-stack apps and tools with AI. 12-month full Lite access with 150 monthly credits and custom domain support.',
    'Instructions: Redeem link must be applied within 72 hours of receiving order. Valid for your personal account.',
    5.00,
    950.00,
    'ETB',
    20,
    'Hot',
    '1-Month Warranty',
    1
),
(
    'm365-family-1y',
    'Microsoft 365 Family (1 Year)',
    'Software & Productivity',
    'Direct yearly billed plan. Word, Excel, PowerPoint, Outlook, plus 1TB OneDrive cloud storage. Readymade account with mail access.',
    'Login with credentials provided. Password can be changed immediately.',
    8.00,
    1450.00,
    'ETB',
    18,
    'Productivity',
    'Full Term Access',
    1
);
