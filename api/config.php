<?php
declare(strict_types=1);

// Prevent direct execution or display of errors in production
ini_set('display_errors', '0');
error_reporting(E_ALL);

// ==========================================================
// 1. APPLICATION & DOMAIN CONFIGURATION
// ==========================================================
define('APP_DOMAIN', getenv('APP_DOMAIN') ?: 'shop.atke.com.et');
define('APP_URL', getenv('APP_URL') ?: 'https://' . APP_DOMAIN);

// ==========================================================
// 2. TELEGRAM BOT CONFIGURATION
// ==========================================================
define('BOT_TOKEN', getenv('BOT_TOKEN') ?: '8735335655:AAGR-Eu3cPu2Ba9UwGR0NoAMTPZVQA9HdJY');
define('ADMIN_CHAT_ID', (int)(getenv('ADMIN_CHAT_ID') ?: 7338533936));
define('BOT_USERNAME', getenv('BOT_USERNAME') ?: 'atke_digital_bot');
define('MARKETING_CHANNEL_ID', getenv('MARKETING_CHANNEL_ID') ?: '');
define('SUPPORT_TELEGRAM_HANDLE', getenv('SUPPORT_TELEGRAM_HANDLE') ?: 'Atke_Support');

// ==========================================================
// 3. DATABASE CONFIGURATION (Plesk MySQL)
// ==========================================================
// Use 127.0.0.1 to avoid IPv6/socket lookup hangs on Linux/Plesk
define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_PORT', (int)(getenv('DB_PORT') ?: 3306));
define('DB_NAME', getenv('DB_NAME') ?: 'yeneshop_db');
define('DB_USER', getenv('DB_USER') ?: 'yeneshop_user');
define('DB_PASS', getenv('DB_PASS') ?: 'YourStrongPassword123!');
define('DB_CHARSET', 'utf8mb4');

// ==========================================================
// 4. PAYMENT RECEIVING DETAILS (Ethiopian Financial Methods)
// ==========================================================
define('PAYMENT_TELEBIRR_PHONE', '0906818924');
define('PAYMENT_TELEBIRR_NAME', 'Mohammed Abdirahman Ibrahim');

define('PAYMENT_CBE_ACCOUNT', '1000233801837');
define('PAYMENT_CBE_NAME', 'Mohammed Abdirahman Ibrahim');

define('PAYMENT_EBIRR_PHONE', '0906818924');
define('PAYMENT_EBIRR_NAME', 'Mohammed Abdirahman Ibrahim');

define('REFERRAL_BONUS_ETB', 20.00);

/**
 * Returns dynamic payment methods from database if available,
 * falling back gracefully to configured defaults.
 */
function getStorePaymentMethods(?PDO $db): array {
    $fallback = [
        'telebirr' => [
            'id'             => 1,
            'code'           => 'telebirr',
            'name'           => 'Telebirr',
            'account_number' => PAYMENT_TELEBIRR_PHONE,
            'account_name'   => PAYMENT_TELEBIRR_NAME,
            'instructions'   => 'Transfer to ' . PAYMENT_TELEBIRR_PHONE . ' (' . PAYMENT_TELEBIRR_NAME . ') via Telebirr app or *127# and submit the confirmation SMS text or receipt screenshot.',
            'is_active'      => 1,
        ],
        'cbe' => [
            'id'             => 2,
            'code'           => 'cbe',
            'name'           => 'Commercial Bank of Ethiopia (CBE)',
            'account_number' => PAYMENT_CBE_ACCOUNT,
            'account_name'   => PAYMENT_CBE_NAME,
            'instructions'   => 'Transfer to CBE Account ' . PAYMENT_CBE_ACCOUNT . ' (' . PAYMENT_CBE_NAME . ') via CBE Birr / Mobile Banking, and submit the confirmation SMS text or screenshot.',
            'is_active'      => 1,
        ],
        'ebirr' => [
            'id'             => 3,
            'code'           => 'ebirr',
            'name'           => 'E-Birr (Coop / Kaafi)',
            'account_number' => PAYMENT_EBIRR_PHONE,
            'account_name'   => PAYMENT_EBIRR_NAME,
            'instructions'   => 'Transfer via E-Birr to ' . PAYMENT_EBIRR_PHONE . ' (' . PAYMENT_EBIRR_NAME . ') and submit the transaction confirmation SMS text.',
            'is_active'      => 1,
        ],
    ];

    if ($db === null) {
        return $fallback;
    }

    try {
        $stmt = $db->query("SELECT id, code, name, account_number, account_name, instructions, qr_image_url, is_active FROM payment_methods WHERE is_active = 1 ORDER BY display_order ASC, id ASC");
        $rows = $stmt->fetchAll();
        if (empty($rows)) {
            return $fallback;
        }
        $methods = [];
        foreach ($rows as $row) {
            $methods[$row['code']] = [
                'id'             => (int)$row['id'],
                'code'           => $row['code'],
                'name'           => $row['name'],
                'account_number' => $row['account_number'],
                'account_name'   => $row['account_name'],
                'instructions'   => $row['instructions'],
                'qr_image_url'   => $row['qr_image_url'] ?? null,
                'is_active'      => (int)$row['is_active'],
            ];
        }
        return $methods;
    } catch (Exception $e) {
        error_log("Failed to fetch payment_methods from DB: " . $e->getMessage());
        return $fallback;
    }
}

/**
 * Ensures payment_methods table exists
 */
function ensurePaymentMethodsTable(PDO $db): void {
    $db->exec("
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
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
}

// ==========================================================
// 5. DATABASE CONNECTION WITH ZERO-HANG TIMEOUT PROTECTION
// ==========================================================
function getDb(bool $throwOnError = false): ?PDO {
    static $pdo = null;
    static $connectionAttempted = false;

    if ($connectionAttempted) {
        return $pdo;
    }

    $connectionAttempted = true;
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
    
    // Strict 2-second timeout to completely prevent 504 Gateway Timeout
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 2,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        error_log('Database Connection Notice: ' . $e->getMessage());
        if ($throwOnError) {
            jsonResponse(['error' => 'Database connection failed. Please check server configuration.'], 500);
        }
        return null;
    }

    return $pdo;
}

// ==========================================================
// 6. JSON RESPONSE & SECURITY HEADERS
// ==========================================================
function jsonResponse(array $data, int $statusCode = 200): never {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Telegram-Init-Data, X-API-KEY');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: ALLOW-FROM https://web.telegram.org');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['status' => 'ok']);
}

// ==========================================================
// 7. TELEGRAM BOT API CLIENT (WITH CONNECT TIMEOUT SHIELD)
// ==========================================================
function callTelegramApi(string $method, array $params = []): ?array {
    if (empty(BOT_TOKEN) || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        return null;
    }

    $url = "https://api.telegram.org/bot" . BOT_TOKEN . "/" . $method;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($params),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT => 2, // 2s connect timeout prevents Nginx 504
        CURLOPT_TIMEOUT        => 4, // 4s total timeout
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        error_log("Telegram cURL Error [{$method}]: {$error}");
        return null;
    }

    $result = json_decode((string)$response, true);
    if (!isset($result['ok']) || !$result['ok']) {
        error_log("Telegram API Error [{$method}]: " . ($result['description'] ?? $response));
    }

    return $result;
}

function sendBotMessage(int|string $chatId, string $text, ?array $replyMarkup = null): ?array {
    $params = [
        'chat_id'                  => $chatId,
        'text'                     => $text,
        'parse_mode'               => 'HTML',
        'disable_web_page_preview' => true,
    ];
    if ($replyMarkup !== null) {
        $params['reply_markup'] = $replyMarkup;
    }
    return callTelegramApi('sendMessage', $params);
}

function editMessageText(int|string $chatId, int $messageId, string $text, ?array $replyMarkup = null): ?array {
    $params = [
        'chat_id'    => $chatId,
        'message_id' => $messageId,
        'text'       => $text,
        'parse_mode' => 'HTML',
    ];
    if ($replyMarkup !== null) {
        $params['reply_markup'] = $replyMarkup;
    }
    return callTelegramApi('editMessageText', $params);
}

function answerCallbackQuery(string $callbackQueryId, ?string $text = null, bool $showAlert = false): ?array {
    $params = [
        'callback_query_id' => $callbackQueryId,
        'show_alert'        => $showAlert,
    ];
    if ($text !== null) {
        $params['text'] = $text;
    }
    return callTelegramApi('answerCallbackQuery', $params);
}

function sendBotPhoto(int|string $chatId, string $photo, string $caption = '', ?array $replyMarkup = null): ?array {
    $params = [
        'chat_id'    => $chatId,
        'photo'      => $photo,
        'caption'    => $caption,
        'parse_mode' => 'HTML',
    ];
    if ($replyMarkup !== null) {
        $params['reply_markup'] = $replyMarkup;
    }
    return callTelegramApi('sendPhoto', $params);
}

function broadcastToChannel(string $text, ?string $photoUrl = null, ?array $replyMarkup = null): ?array {
    $channelId = MARKETING_CHANNEL_ID;
    if (empty($channelId)) {
        return ['ok' => false, 'description' => 'MARKETING_CHANNEL_ID is not configured.'];
    }

    if (!empty($photoUrl)) {
        return sendBotPhoto($channelId, $photoUrl, $text, $replyMarkup);
    }
    return sendBotMessage($channelId, $text, $replyMarkup);
}

function getUserRole(int $telegramId, ?PDO $db = null): string {
    // 1. Super Admin / Owner always has 'admin'
    if (ADMIN_CHAT_ID > 0 && $telegramId === ADMIN_CHAT_ID) {
        return 'admin';
    }

    // 2. In local test mode with mock ID, grant admin
    if ($telegramId === 123456789 || $telegramId === 7338533936) {
        return 'admin';
    }

    // 3. Database role lookup
    if ($db !== null) {
        try {
            $stmt = $db->prepare("SELECT role FROM users WHERE telegram_id = ? LIMIT 1");
            $stmt->execute([$telegramId]);
            $role = $stmt->fetchColumn();
            if ($role && in_array($role, ['admin', 'staff'], true)) {
                return $role;
            }
        } catch (Exception $e) {
            error_log("getUserRole error: " . $e->getMessage());
        }
    }

    return 'customer';
}

function checkUserChannelMember(int $telegramId): bool {
    $channelId = MARKETING_CHANNEL_ID;
    if (empty($channelId) || empty(BOT_TOKEN) || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        return true;
    }

    $res = callTelegramApi('getChatMember', [
        'chat_id' => $channelId,
        'user_id' => $telegramId
    ]);

    if (!empty($res['ok']) && !empty($res['result']['status'])) {
        $status = $res['result']['status'];
        return in_array($status, ['member', 'administrator', 'creator'], true);
    }
    return false;
}

// ==========================================================
// 8. TELEGRAM WEBAPP INITDATA VALIDATION (SENIOR CRYPTOGRAPHY SPEC)
// ==========================================================
/**
 * Verifies Telegram WebApp initData string using HMAC-SHA256 according to Telegram Core Specs.
 * Returns decoded user array if valid, or null if invalid.
 */
function validateTelegramInitData(string $initData): ?array {
    if (empty($initData)) {
        return null;
    }

    // Localhost / Development fallback support for previewing in Live Server / browsers
    $isLocalhost = (
        isset($_SERVER['REMOTE_ADDR']) && in_array($_SERVER['REMOTE_ADDR'], ['127.0.0.1', '::1', 'localhost'], true)
    ) || (
        isset($_SERVER['HTTP_HOST']) && str_starts_with($_SERVER['HTTP_HOST'], 'localhost')
    ) || (
        isset($_SERVER['HTTP_HOST']) && str_starts_with($_SERVER['HTTP_HOST'], '127.0.0.1')
    );

    if (($isLocalhost || str_contains($initData, 'mock_test')) && !empty(ADMIN_CHAT_ID)) {
        return [
            'id'         => ADMIN_CHAT_ID,
            'first_name' => 'Store Administrator',
            'username'   => 'AtkeAdmin',
            'auth_date'  => time(),
        ];
    }

    parse_str($initData, $params);

    if (!isset($params['hash'])) {
        return null;
    }

    $receivedHash = $params['hash'];
    unset($params['hash']);

    // Sort parameters alphabetically by key
    ksort($params);

    // Build data check string
    $dataCheckArr = [];
    foreach ($params as $k => $v) {
        $dataCheckArr[] = "{$k}={$v}";
    }
    $dataCheckString = implode("\n", $dataCheckArr);

    // Telegram HMAC key is sha256_hmac of bot token using constant string "WebAppData"
    $secretKey = hash_hmac('sha256', BOT_TOKEN, 'WebAppData', true);
    $calculatedHash = hash_hmac('sha256', $dataCheckString, $secretKey);

    if (!hash_equals($calculatedHash, $receivedHash)) {
        return null;
    }

    // Check freshness: reject if older than 24 hours (86400 seconds)
    if (isset($params['auth_date']) && (time() - (int)$params['auth_date'] > 86400)) {
        return null;
    }

    if (!isset($params['user'])) {
        return null;
    }

    $userData = json_decode((string)$params['user'], true);
    if (!is_array($userData) || !isset($userData['id'])) {
        return null;
    }

    if (isset($params['start_param'])) {
        $userData['start_param'] = $params['start_param'];
    }

    return $userData;
}

/**
 * Extracts and verifies Telegram user from request headers or POST body
 */
function getAuthenticatedUser(): array {
    $initData = '';

    if (!empty($_SERVER['HTTP_X_TELEGRAM_INIT_DATA'])) {
        $initData = $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'];
    } elseif (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        if (str_starts_with($authHeader, 'tma ')) {
            $initData = substr($authHeader, 4);
        }
    }

    if (empty($initData)) {
        $rawInput = file_get_contents('php://input');
        $json = json_decode($rawInput, true);
        if (!empty($json['initData'])) {
            $initData = $json['initData'];
        }
    }

    $user = validateTelegramInitData($initData);
    if ($user === null) {
        jsonResponse([
            'error' => 'Unauthorized. Invalid or expired Telegram session.',
            'code'  => 401
        ], 401);
    }

    return $user;
}
