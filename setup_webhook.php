<?php
declare(strict_types=1);

/**
 * Telegram Webhook Setup & Health Check Utility
 * Run via browser (e.g. https://shop.atke.com.et/setup_webhook.php) or CLI
 */

require_once __DIR__ . '/api/config.php';

header('Content-Type: text/html; charset=utf-8');

$action = $_GET['action'] ?? 'info';
$webhookUrl = rtrim(APP_URL, '/') . '/api/webhook.php';

$output = null;
$error = null;

if ($action === 'set') {
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        $error = "Please edit <code>api/config.php</code> and provide your actual <code>BOT_TOKEN</code> before setting the webhook.";
    } else {
        $result = callTelegramApi('setWebhook', [
            'url'                  => $webhookUrl,
            'drop_pending_updates' => false,
            'allowed_updates'      => ['message', 'callback_query']
        ]);
        $output = $result;
    }
} elseif ($action === 'delete') {
    $result = callTelegramApi('deleteWebhook', [
        'drop_pending_updates' => true
    ]);
    $output = $result;
} else {
    $result = callTelegramApi('getWebhookInfo');
    $output = $result;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Webhook Manager</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0b0f19;
            color: #e5e7eb;
            padding: 30px 20px;
            margin: 0;
            display: flex;
            justify-content: center;
        }
        .card {
            background: #111827;
            border: 1px solid #1f2937;
            border-radius: 16px;
            max-width: 650px;
            width: 100%;
            padding: 24px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        h1 { font-size: 20px; margin-top: 0; color: #22c55e; display: flex; align-items: center; gap: 8px; }
        .badge { background: #1f2937; color: #9ca3af; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
        .info-box { background: #1e293b; padding: 14px; border-radius: 10px; font-size: 13px; line-height: 1.6; margin: 16px 0; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-family: monospace; font-size: 13px; }
        .btn-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
        .btn {
            background: #22c55e;
            color: #052e16;
            font-weight: bold;
            padding: 10px 18px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 13px;
            display: inline-block;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        .btn-danger { background: #ef4444; color: #fff; }
        .btn-secondary { background: #374151; color: #fff; }
        pre {
            background: #030712;
            border: 1px solid #1f2937;
            padding: 14px;
            border-radius: 8px;
            overflow-x: auto;
            color: #a7f3d0;
            font-size: 12px;
        }
        .error { background: #450a0a; border: 1px solid #dc2626; color: #fca5a5; padding: 12px; border-radius: 8px; font-size: 13px; }
    </style>
</head>
<body>

<div class="card">
    <h1>⚡ Telegram Webhook Setup</h1>
    <span class="badge">Target Environment: Plesk Linux Hosting (Ethio Telecom)</span>

    <div class="info-box">
        <strong>Application URL:</strong> <code><?= htmlspecialchars(APP_URL) ?></code><br>
        <strong>Target Webhook:</strong> <code><?= htmlspecialchars($webhookUrl) ?></code><br>
        <strong>Bot Username:</strong> <code>@<?= htmlspecialchars(BOT_USERNAME) ?></code><br>
        <strong>Admin Chat ID:</strong> <code><?= htmlspecialchars((string)ADMIN_CHAT_ID) ?></code>
    </div>

    <?php if ($error): ?>
        <div class="error">
            <strong>Configuration Warning:</strong><br>
            <?= $error ?>
        </div>
    <?php endif; ?>

    <div class="btn-group">
        <a href="?action=set" class="btn">🚀 Register Webhook</a>
        <a href="?action=info" class="btn btn-secondary">🔍 Check Current Status</a>
        <a href="?action=delete" class="btn btn-danger" onclick="return confirm('Drop pending updates and delete webhook?');">🗑️ Delete Webhook</a>
        <a href="public/index.html" class="btn btn-secondary" target="_blank">🛍️ Open Mini App UI</a>
    </div>

    <h3 style="margin-top: 24px; font-size: 14px; color: #9ca3af;">Telegram API Response:</h3>
    <pre><?= htmlspecialchars(json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) ?></pre>

    <div style="font-size: 11px; color: #6b7280; margin-top: 20px;">
        💡 <em>Security Note: After setting up your webhook, you may restrict access or remove <code>setup_webhook.php</code> from your public server.</em>
    </div>
</div>

</body>
</html>
