<?php
declare(strict_types=1);

/**
 * Health Check & Diagnostic Endpoint
 * Accessible at /api/health.php to verify server, database, and Telegram API status.
 */

$startTime = microtime(true);
require_once __DIR__ . '/config.php';

$report = [
    'status'       => 'healthy',
    'timestamp'    => date('Y-m-d H:i:s T'),
    'environment'  => [
        'php_version'  => PHP_VERSION,
        'os'           => PHP_OS,
        'server_ip'    => $_SERVER['SERVER_ADDR'] ?? '127.0.0.1',
        'http_host'    => $_SERVER['HTTP_HOST'] ?? 'unknown',
    ],
    'checks'       => []
];

// 1. Check Required PHP Extensions
$extensions = ['pdo', 'pdo_mysql', 'curl', 'openssl', 'mbstring', 'json', 'fileinfo'];
$missingExts = [];
foreach ($extensions as $ext) {
    if (!extension_loaded($ext)) {
        $missingExts[] = $ext;
    }
}
$report['checks']['extensions'] = [
    'ok'      => empty($missingExts),
    'missing' => $missingExts
];

// 2. Database Connectivity Check
$dbStart = microtime(true);
$db = getDb(false);
$dbDuration = round((microtime(true) - $dbStart) * 1000, 2);

if ($db !== null) {
    try {
        $dbTest = $db->query("SELECT 1 AS ping")->fetch();
        $report['checks']['database'] = [
            'ok'          => true,
            'latency_ms'  => $dbDuration,
            'driver'      => $db->getAttribute(PDO::ATTR_DRIVER_NAME),
            'server_info' => $db->getAttribute(PDO::ATTR_SERVER_VERSION),
        ];
    } catch (Exception $e) {
        $report['checks']['database'] = [
            'ok'    => false,
            'error' => $e->getMessage()
        ];
        $report['status'] = 'degraded';
    }
} else {
    $report['checks']['database'] = [
        'ok'      => false,
        'latency_ms' => $dbDuration,
        'note'    => 'MySQL not reachable or credentials unconfigured. Running in resilient demo/fallback mode.'
    ];
    // We don't fail completely so frontend still renders
}

// 3. Telegram Bot Token Check
$tgStart = microtime(true);
$tgRes = callTelegramApi('getMe');
$tgDuration = round((microtime(true) - $tgStart) * 1000, 2);

if (!empty($tgRes['ok'])) {
    $report['checks']['telegram_bot'] = [
        'ok'          => true,
        'bot_name'    => $tgRes['result']['first_name'] ?? '',
        'username'    => '@' . ($tgRes['result']['username'] ?? ''),
        'latency_ms'  => $tgDuration,
    ];
} else {
    $report['checks']['telegram_bot'] = [
        'ok'          => false,
        'latency_ms'  => $tgDuration,
        'note'        => 'Telegram API connection failed or BOT_TOKEN invalid.'
    ];
    $report['status'] = 'degraded';
}

// 4. File Permissions Check
$uploadDir = __DIR__ . '/../public/uploads/receipts';
$writable = is_dir($uploadDir) ? is_writable($uploadDir) : @mkdir($uploadDir, 0755, true);
$report['checks']['storage_write'] = [
    'ok'   => (bool)$writable,
    'path' => 'public/uploads/receipts'
];

$report['execution_time_ms'] = round((microtime(true) - $startTime) * 1000, 2);

jsonResponse($report, $report['status'] === 'healthy' ? 200 : 200);
