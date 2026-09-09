<?php
declare(strict_types=1);

// Prevent direct execution or display of errors in production
ini_set('display_errors', '0');
error_reporting(E_ALL);

// ==========================================================
// 1. APPLICATION & DOMAIN CONFIGURATION
// ==========================================================
// Primary domain: easily switch between shop.atke.com.et or app.hiigsan.et
define('APP_DOMAIN', getenv('APP_DOMAIN') ?: 'shop.atke.com.et');
define('APP_URL', getenv('APP_URL') ?: 'https://' . APP_DOMAIN);

// ==========================================================
// 2. TELEGRAM BOT CONFIGURATION
// ==========================================================
// Replace with your Bot Token from @BotFather
define('BOT_TOKEN', getenv('BOT_TOKEN') ?: '8735335655:AAGR-Eu3cPu2Ba9UwGR0NoAMTPZVQA9HdJY');

// Replace with your personal Telegram ID (use @userinfobot to find it)
define('ADMIN_CHAT_ID', (int)(getenv('ADMIN_CHAT_ID') ?: 7338533936));

// Bot Username without '@' (used for generating referral links)
define('BOT_USERNAME', getenv('BOT_USERNAME') ?: 'atke_digital_bot');

// ==========================================================
// 3. DATABASE CONFIGURATION (Plesk MySQL)
// ==========================================================
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
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

// Referral bonus awarded in ETB when a referred user makes their first deposit/order (optional)
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
            'instructions'   => 'Transfer to ' . PAYMENT_TELEBIRR_PHONE . ' (' . PAYMENT_TELEBIRR_NAME . ') via Telebirr app or *127# and submit the confirmation SMS text or Txn ID.',
            'is_active'      => 1,
        ],
        'cbe' => [
            'id'             => 2,
            'code'           => 'cbe',
            'name'           => 'Commercial Bank of Ethiopia (CBE)',
            'account_number' => PAYMENT_CBE_ACCOUNT,
            'account_name'   => PAYMENT_CBE_NAME,
            'instructions'   => 'Transfer to CBE Account ' . PAYMENT_CBE_ACCOUNT . ' (' . PAYMENT_CBE_NAME . ') via Mobile Banking, and submit the confirmation SMS text or Txn ID.',
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

// ==========================================================
// 5. DATABASE CONNECTION SINGLETON
// ==========================================================
function getDb(bool $throwOnError = false): ?PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', DB_HOST, DB_NAME, DB_CHARSET);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_TIMEOUT            => 5,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log('Database Connection Error: ' . $e->getMessage());
            if ($throwOnError) {
                jsonResponse(['error' => 'Database connection failed. Please check server configuration.'], 500);
            }
            return null;
        }
    }
    return $pdo;
}

// ==========================================================
// 6. JSON RESPONSE & CORS HELPER
// ==========================================================
function jsonResponse(array $data, int $statusCode = 200): never {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Telegram-Init-Data');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    jsonResponse(['status' => 'ok']);
}

// ==========================================================
// 7. TELEGRAM BOT API CLIENT
// ==========================================================
function callTelegramApi(string $method, array $params = []): ?array {
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        error_log("Telegram API Error: BOT_TOKEN is not configured.");
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
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        error_log("Telegram cURL Error [{$method}]: {$error}");
        return null;
    }

    $result = json_decode($response, true);
    if (!isset($result['ok']) || !$result['ok']) {
        error_log("Telegram API Error [{$method}]: " . ($result['description'] ?? $response));
    }

    return $result;
}

function sendBotMessage(int|string $chatId, string $text, ?array $replyMarkup = null): ?array {
    $params = [
        'chat_id'    => $chatId,
        'text'       => $text,
        'parse_mode' => 'HTML',
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

// ==========================================================
// 8. TELEGRAM WEBAPP INITDATA VALIDATION
// ==========================================================
/**
 * Verifies Telegram WebApp initData string using HMAC-SHA256 according to Telegram Specs.
 * Returns decoded user array if valid, or null if invalid.
 */
function validateTelegramInitData(string $initData): ?array {
    if (empty($initData)) {
        return null;
    }

    // In local / development mode with dummy token, allow test user
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE' && str_contains($initData, 'mock_test')) {
        return [
            'id'         => 123456789,
            'first_name' => 'Demo User',
            'username'   => 'demouser',
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

    $userData = json_decode($params['user'], true);
    if (!is_array($userData) || !isset($userData['id'])) {
        return null;
    }

    if (isset($params['start_param'])) {
        $userData['start_param'] = $params['start_param'];
    }

    return $userData;
}

/**
 * Extracts and verifies Telegram user from either request headers or POST body
 */
function getAuthenticatedUser(): array {
    $initData = '';

    // Check custom header
    if (!empty($_SERVER['HTTP_X_TELEGRAM_INIT_DATA'])) {
        $initData = $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'];
    } elseif (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        if (str_starts_with($authHeader, 'tma ')) {
            $initData = substr($authHeader, 4);
        }
    }

    // Fallback: check POST body
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
            'code' => 401
        ], 401);
    }

    return $user;
}
