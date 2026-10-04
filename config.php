<?php
/**
 * ====================================================================
 * ATKE DIGITAL STORE - CENTRAL CONFIGURATION & CORE ENGINE
 * Deployment Target: Plesk Shared Hosting (shop.atke.com.et)
 * Language: PHP 8.x (No Composer or external daemons required)
 * ====================================================================
 */

declare(strict_types=1);

// Prevent direct execution output pollution if included
if (!defined('ATKE_APP_INIT')) {
    define('ATKE_APP_INIT', true);
}

// Set default timezone to East Africa Time (Ethiopia)
date_default_timezone_set('Africa/Addis_Ababa');

/**
 * --------------------------------------------------------------------
 * Simple Native .env Loader (Zero-dependency)
 * --------------------------------------------------------------------
 */
(function() {
    $envPaths = [
        __DIR__ . '/.env',
        __DIR__ . '/../.env',
        dirname(__DIR__) . '/.env'
    ];

    foreach ($envPaths as $path) {
        if (file_exists($path) && is_readable($path)) {
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines === false) continue;

            foreach ($lines as $line) {
                $line = trim($line);
                // Ignore comments
                if ($line === '' || str_starts_with($line, '#')) continue;

                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $value = trim($parts[1]);

                    // Strip surrounding quotes if present
                    if ((str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                        (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
                        $value = substr($value, 1, -1);
                    }

                    if (!array_key_exists($key, $_SERVER) && !array_key_exists($key, $_ENV)) {
                        putenv("{$key}={$value}");
                        $_ENV[$key] = $value;
                        $_SERVER[$key] = $value;
                    }
                }
            }
            break;
        }
    }
})();

/**
 * Helper to retrieve an environment variable with a fallback default.
 */
function env(string $key, mixed $default = null): mixed {
    $val = getenv($key);
    if ($val === false) {
        $val = $_ENV[$key] ?? $_SERVER[$key] ?? $default;
    }
    return $val;
}

/**
 * --------------------------------------------------------------------
 * Database Configuration (MySQL / MariaDB on Plesk)
 * --------------------------------------------------------------------
 */
define('DB_HOST', (string) env('DB_HOST', 'localhost'));
define('DB_PORT', (int) env('DB_PORT', 3306));
define('DB_NAME', (string) env('DB_NAME', 'atke_shop'));
define('DB_USER', (string) env('DB_USER', 'atke_user'));
define('DB_PASS', (string) env('DB_PASS', ''));
define('DB_CHARSET', 'utf8mb4');

/**
 * --------------------------------------------------------------------
 * Telegram Bot & Mini App Configuration
 * --------------------------------------------------------------------
 */
define('TELEGRAM_BOT_TOKEN', (string) env('BOT_TOKEN', '8849880809:AAHwlV7suX-urb47VNorbuV-CEdbXtcJZ24'));
define('TELEGRAM_BOT_USERNAME', (string) env('BOT_USERNAME', 'atke_shop_bot'));
define('WEB_APP_URL', (string) env('WEB_APP_URL', 'https://shop.atke.com.et/'));

// Admin Telegram user IDs allowed to approve orders & receive alerts
$adminIdsRaw = (string) env('ADMIN_TELEGRAM_IDS', '7608745515');
$adminIds = array_filter(array_map('trim', explode(',', $adminIdsRaw)));
define('ADMIN_TELEGRAM_IDS', $adminIds);

/**
 * --------------------------------------------------------------------
 * Ethio-Viral Premium API Credentials
 * --------------------------------------------------------------------
 */
define('ETHIO_VIRAL_API_URL', (string) env('ETHIO_VIRAL_API_URL', 'https://api.ethio-viral.com/v1/premium'));
define('ETHIO_VIRAL_API_KEY', (string) env('ETHIO_VIRAL_API_KEY', 'ethio_viral_live_token_here'));

/**
 * --------------------------------------------------------------------
 * Local Ethiopian Payment Channels Configuration
 * --------------------------------------------------------------------
 */
define('PAYMENT_CHANNELS', [
    'CBE' => [
        'id'             => 'CBE',
        'name'           => 'Commercial Bank of Ethiopia (CBE)',
        'short_name'     => 'CBE Birr / Mobile Banking',
        'account_number' => (string) env('CBE_ACCOUNT', '1000233801837'),
        'account_holder' => (string) env('CBE_HOLDER', 'Mohammed Abdirahman Ibrahim'),
        'instructions'   => 'Transfer using CBE Birr or Commercial Bank Mobile App. Copy the 10-14 digit FT transaction reference number from your SMS.',
        'badge'          => 'Instant Reconcile',
        'icon'           => '🏦'
    ],
    'EBIRR' => [
        'id'             => 'EBIRR',
        'name'           => 'Telebirr / E-Birr',
        'short_name'     => 'Telebirr / E-Birr',
        'account_number' => (string) env('EBIRR_ACCOUNT', '0906818924'),
        'account_holder' => (string) env('EBIRR_HOLDER', 'Mohammed Abdirahman Ibrahim'),
        'instructions'   => 'Send payment via Telebirr or E-Birr transfer. Enter the unique Transaction ID found on your payment confirmation SMS.',
        'badge'          => 'Fast & Popular',
        'icon'           => '📱'
    ],
    'KAAFI' => [
        'id'             => 'KAAFI',
        'name'           => 'Kaafi Payment',
        'short_name'     => 'Kaafi Bank / Wallet',
        'account_number' => (string) env('KAAFI_ACCOUNT', '0906818924'),
        'account_holder' => (string) env('KAAFI_HOLDER', 'Mohammed Abdirahman Ibrahim'),
        'instructions'   => 'Transfer via Kaafi mobile app or agent. Provide the transaction reference number provided upon successful transfer.',
        'badge'          => 'Convenient',
        'icon'           => '💳'
    ],
]);

/**
 * --------------------------------------------------------------------
 * PDO Database Connection Provider (Singleton with Row-Locking Ready)
 * --------------------------------------------------------------------
 */
function getDb(): PDO {
    static $pdoInstance = null;

    if ($pdoInstance === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_CHARSET
        );

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false, // Native prepared statements for safety and row-level locking
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET . " COLLATE utf8mb4_unicode_ci"
        ];

        try {
            $pdoInstance = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log("Database connection failed: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed. Please verify Plesk DB settings in config.php']);
            exit;
        }
    }

    return $pdoInstance;
}

/**
 * --------------------------------------------------------------------
 * Telegram Bot API Caller (cURL)
 * --------------------------------------------------------------------
 */
function sendTelegramApi(string $method, array $params = []): array {
    $token = TELEGRAM_BOT_TOKEN;
    if (empty($token) || str_contains($token, 'your-token')) {
        error_log("Telegram Bot Token is not configured.");
        return ['ok' => false, 'description' => 'Bot token not configured'];
    }

    $url = "https://api.telegram.org/bot{$token}/{$method}";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        error_log("Telegram API cURL error: " . $curlErr);
        return ['ok' => false, 'description' => $curlErr];
    }

    $decoded = json_decode((string)$response, true);
    return is_array($decoded) ? $decoded : ['ok' => false, 'raw' => $response, 'code' => $httpCode];
}

/**
 * --------------------------------------------------------------------
 * Ethio-Viral Premium API Client (cURL with Idempotency Support)
 * --------------------------------------------------------------------
 * Supported endpoints:
 *   - GET  /products             (catalog cache)
 *   - GET  /balance              (reseller wallet balance)
 *   - POST /orders               (purchase, requires Idempotency-Key & quantity: 1)
 *   - GET  /orders/:id/delivery  (fulfillment retrieval)
 */
function callEthioViralApi(string $endpoint, string $method = 'GET', ?array $data = null, ?string $idempotencyKey = null): array {
    $baseUrl = rtrim(ETHIO_VIRAL_API_URL, '/');
    $url = $baseUrl . '/' . ltrim($endpoint, '/');

    $headers = [
        'Authorization: Bearer ' . ETHIO_VIRAL_API_KEY,
        'Accept: application/json',
        'User-Agent: AtkeDigitalShop/1.0 (Plesk/PHP8)'
    ];

    if ($idempotencyKey !== null && $idempotencyKey !== '') {
        $headers[] = 'Idempotency-Key: ' . $idempotencyKey;
    }

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    $upperMethod = strtoupper($method);
    if ($upperMethod === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        $headers[] = 'Content-Type: application/json';
        $payload = json_encode($data ?? []);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    } elseif ($upperMethod !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $upperMethod);
        if ($data !== null) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    }

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        error_log("Ethio-Viral API cURL error ({$endpoint}): " . $curlErr);
        return [
            'success' => false,
            'status'  => 0,
            'error'   => 'Network communication error: ' . $curlErr,
            'data'    => null
        ];
    }

    $decoded = json_decode((string)$response, true);

    return [
        'success' => ($httpCode >= 200 && $httpCode < 300),
        'status'  => $httpCode,
        'data'    => $decoded,
        'raw'     => $response
    ];
}

/**
 * --------------------------------------------------------------------
 * Telegram WebApp initData Signature Validation (HMAC-SHA256)
 * Validates that requests received from the Mini App are genuinely from Telegram.
 * --------------------------------------------------------------------
 */
function validateTelegramInitData(string $initData): ?array {
    if (empty($initData)) {
        return null;
    }

    parse_str($initData, $params);
    if (!isset($params['hash'])) {
        return null;
    }

    $hash = $params['hash'];
    unset($params['hash']);

    // Check expiration (24 hours = 86400 seconds)
    if (isset($params['auth_date'])) {
        $authDate = (int) $params['auth_date'];
        if (time() - $authDate > 86400) {
            error_log("Telegram initData expired (auth_date: {$authDate})");
            return null;
        }
    }

    // Sort parameters alphabetically by key
    ksort($params);

    $dataCheckArr = [];
    foreach ($params as $key => $val) {
        $dataCheckArr[] = "{$key}={$val}";
    }
    $dataCheckString = implode("\n", $dataCheckArr);

    // Compute HMAC-SHA256 secret key using 'WebAppData'
    $botToken = TELEGRAM_BOT_TOKEN;
    $secretKey = hash_hmac('sha256', $botToken, 'WebAppData', true);
    $calculatedHash = hash_hmac('sha256', $dataCheckString, $secretKey);

    if (!hash_equals($calculatedHash, $hash)) {
        error_log("Telegram initData signature mismatch.");
        return null;
    }

    // Extract decoded user object
    if (isset($params['user'])) {
        $user = json_decode($params['user'], true);
        if (is_array($user)) {
            return $user;
        }
    }

    return $params;
}

/**
 * --------------------------------------------------------------------
 * JSON Output Helper
 * --------------------------------------------------------------------
 */
function sendJsonResponse(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
