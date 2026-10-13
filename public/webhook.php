<?php
/**
 * ====================================================================
 * ATKE DIGITAL STORE - TELEGRAM BOT WEBHOOK RECEIVER
 * Deployment Target: Plesk Shared Hosting (shop.atke.com.et/webhook.php)
 * Handles incoming bot updates, menu button rendering, support & approvals
 * ====================================================================
 */

declare(strict_types=1);

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
} elseif (file_exists(__DIR__ . '/../config.php')) {
    require_once __DIR__ . '/../config.php';
} else {
    http_response_code(500);
    die("config.php not found");
}

// Accept incoming webhook update
$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    http_response_code(200);
    echo "Atke Digital Shop Telegram Webhook Receiver Active.";
    exit;
}

$update = json_decode($rawInput, true);
if (!is_array($update)) {
    http_response_code(400);
    echo "Invalid JSON";
    exit;
}

// Route callback queries (Admin interactive inline buttons)
if (isset($update['callback_query'])) {
    handleCallbackQuery($update['callback_query']);
    http_response_code(200);
    echo "OK";
    exit;
}

// Route standard chat messages
if (isset($update['message'])) {
    handleIncomingMessage($update['message']);
}

http_response_code(200);
echo "OK";
exit;

/**
 * --------------------------------------------------------------------
 * Message Router & Command Handler
 * --------------------------------------------------------------------
 */
function handleIncomingMessage(array $message): void {
    $chatId = $message['chat']['id'] ?? null;
    $from   = $message['from'] ?? [];
    $text   = trim($message['text'] ?? '');

    if (!$chatId || empty($from)) {
        return;
    }

    $telegramId = (int) ($from['id'] ?? 0);
    $username   = $from['username'] ?? null;
    $firstName  = $from['first_name'] ?? '';
    $lastName   = $from['last_name'] ?? null;
    $langCode   = $from['language_code'] ?? 'en';
    $isBot      = !empty($from['is_bot']) ? 1 : 0;

    $cleanText = mb_strtolower(trim($text));
    $command = explode(' ', $text)[0];
    $commandLower = mb_strtolower($command);

    // 1. Immediately dispatch response to user with zero latency
    if ($commandLower === '/start' || $cleanText === 'start') {
        sendWelcomeMessage($chatId, $firstName);
    } else if ($commandLower === '/profile' || str_contains($cleanText, 'profile')) {
        sendUserProfileCard($chatId, $telegramId, $firstName, $username);
    } else if ($commandLower === '/wallet' || str_contains($cleanText, 'wallet')) {
        sendWalletCard($chatId, $telegramId);
    } else if ($commandLower === '/myorders' || $commandLower === '/orders' || str_contains($cleanText, 'orders')) {
        sendUserOrders($chatId, $telegramId);
    } else if ($commandLower === '/admin' || str_contains($cleanText, 'admin')) {
        if (isAdmin($telegramId)) {
            sendAdminDashboard($chatId);
        } else {
            sendUserProfileCard($chatId, $telegramId, $firstName, $username);
        }
    } else if ($commandLower === '/pending') {
        if (isAdmin($telegramId)) {
            sendAdminPendingOrders($chatId);
        }
    } else if ($commandLower === '/balance') {
        if (isAdmin($telegramId)) {
            sendAdminBalance($chatId);
        }
    } else if ($commandLower === '/support' || $commandLower === '/paysupport' || str_contains($cleanText, 'support') || str_contains($cleanText, 'help')) {
        sendSupportMessage($chatId);
    } else {
        sendDefaultHelpMessage($chatId);
    }

    // 2. Perform background user sync in non-blocking manner
    upsertUser($telegramId, $username, $firstName, $lastName, $langCode, $isBot);
}

/**
 * --------------------------------------------------------------------
 * Upsert User into MySQL
 * --------------------------------------------------------------------
 */
function upsertUser(int $telegramId, ?string $username, string $firstName, ?string $lastName, string $langCode, int $isBot): void {
    try {
        $db = getDb();
        if (!$db) {
            error_log("Database not connected yet; skipping upsertUser.");
            return;
        }
        $stmt = $db->prepare("
            INSERT INTO `users` (`telegram_id`, `username`, `first_name`, `last_name`, `language_code`, `is_bot`)
            VALUES (:telegram_id, :username, :first_name, :last_name, :language_code, :is_bot)
            ON DUPLICATE KEY UPDATE
                `username` = VALUES(`username`),
                `first_name` = VALUES(`first_name`),
                `last_name` = VALUES(`last_name`),
                `language_code` = VALUES(`language_code`),
                `updated_at` = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':telegram_id'   => $telegramId,
            ':username'      => $username,
            ':first_name'    => $firstName,
            ':last_name'     => $lastName,
            ':language_code' => $langCode,
            ':is_bot'        => $isBot
        ]);
    } catch (Exception $e) {
        error_log("Failed to upsert user: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Configure Persistent Telegram Menu Button
 * --------------------------------------------------------------------
 */
function setupPersistentMenuButton(int|string $chatId): void {
    // Sets the chat bar menu button to launch the Mini App
    sendTelegramApi('setChatMenuButton', [
        'chat_id' => $chatId,
        'menu_button' => [
            'type' => 'web_app',
            'text' => '🛍️ Open Store',
            'web_app' => ['url' => WEB_APP_URL]
        ]
    ]);
}

/**
 * --------------------------------------------------------------------
 * Welcome Message (/start)
 * --------------------------------------------------------------------
 */
function sendWelcomeMessage(int|string $chatId, string $firstName): void {
    $safeName = htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8');
    
    $text = "👋 <b>Welcome to Atke Digital Shop, {$safeName}!</b>\n\n";
    $text .= "⚡ Your #1 Ethiopian destination for premium digital accounts, software keys, and AI subscriptions.\n\n";
    $text .= "✨ <b>What we offer:</b>\n";
    $text .= "• 🎨 Canva Pro & Admin Panels\n";
    $text .= "• 🎓 Coursera Premium Certificates\n";
    $text .= "• 🤖 ElevenLabs, Gamma & Lovable AI\n";
    $text .= "• 💼 LinkedIn Business & Premium\n";
    $text .= "• 💻 Microsoft 365 & Developer Tools\n\n";
    $text .= "💳 <b>Local Ethiopian Payments:</b> CBE, E-Birr / Telebirr, and Kaafi.\n";
    $text .= "🚀 <b>Instant Delivery</b> right to your chat!\n\n";
    $text .= "Tap below to launch the store:";

    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                ['text' => '🛍️ Launch Storefront', 'web_app' => ['url' => WEB_APP_URL]]
            ],
            [
                ['text' => '📋 My Orders', 'callback_data' => 'cmd_myorders'],
                ['text' => '💬 Payment Guide & Support', 'callback_data' => 'cmd_support']
            ]
        ]
    ];

    sendTelegramApi('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'reply_markup' => $inlineKeyboard
    ]);
}

/**
 * --------------------------------------------------------------------
 * User Profile Card (/profile or text "Profile")
 * --------------------------------------------------------------------
 * Displays Telegram ID, Name, Username, Wallet Balance, and Total Orders
 * matching competitor screenshots.
 */
function sendUserProfileCard(int|string $chatId, int $telegramId, string $firstName, ?string $username): void {
    $db = getDb();
    $balance = 0.00;
    $totalOrders = 0;

    if ($db) {
        $uStmt = $db->prepare("SELECT `wallet_balance` FROM `users` WHERE `telegram_id` = :uid");
        $uStmt->execute([':uid' => $telegramId]);
        $row = $uStmt->fetch();
        if ($row) {
            $balance = (float) $row['wallet_balance'];
        }
        $oStmt = $db->prepare("SELECT COUNT(*) FROM `orders` WHERE `telegram_user_id` = :uid");
        $oStmt->execute([':uid' => $telegramId]);
        $totalOrders = (int) $oStmt->fetchColumn();
    }

    $userLabel = !empty($username) ? "@" . $username : "None";

    $text = "👤 <b>User Profile</b>\n\n";
    $text .= "🆔 <b>Telegram ID:</b> <code>{$telegramId}</code>\n";
    $text .= "👤 <b>Name:</b> " . htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8') . "\n";
    $text .= "🏷️ <b>Username:</b> {$userLabel}\n";
    $text .= "💰 <b>Wallet Balance:</b> " . number_format($balance, 2) . " ETB\n";
    $text .= "📦 <b>Total Orders:</b> {$totalOrders}\n\n";
    $text .= "Manage your orders and wallet below:";

    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                ['text' => '📦 My Orders', 'callback_data' => 'cmd_myorders'],
                ['text' => '💳 Wallet', 'web_app' => ['url' => WEB_APP_URL]]
            ],
            [
                ['text' => '🛍️ Open Atke Store', 'web_app' => ['url' => WEB_APP_URL]]
            ]
        ]
    ];

    sendTelegramApi('sendMessage', [
        'chat_id'      => $chatId,
        'text'         => $text,
        'parse_mode'   => 'HTML',
        'reply_markup' => $inlineKeyboard
    ]);
}

/**
 * --------------------------------------------------------------------
 * Wallet Card (/wallet or text "Wallet")
 * --------------------------------------------------------------------
 */
function sendWalletCard(int|string $chatId, int $telegramId): void {
    $db = getDb();
    $balance = 0.00;
    if ($db) {
        $uStmt = $db->prepare("SELECT `wallet_balance` FROM `users` WHERE `telegram_id` = :uid");
        $uStmt->execute([':uid' => $telegramId]);
        $row = $uStmt->fetch();
        if ($row) {
            $balance = (float) $row['wallet_balance'];
        }
    }

    $cbe   = PAYMENT_CHANNELS['CBE'];
    $ebirr = PAYMENT_CHANNELS['EBIRR'];
    $kaafi = PAYMENT_CHANNELS['KAAFI'];

    $text = "💳 <b>Atke Digital Wallet</b>\n\n";
    $text .= "💰 <b>Available Balance:</b> <b>" . number_format($balance, 2) . " ETB</b>\n\n";
    $text .= "<b>Deposit Target Accounts:</b>\n";
    $text .= "🏦 <b>CBE Birr:</b> <code>{$cbe['account_number']}</code> ({$cbe['account_holder']})\n";
    $text .= "📱 <b>Telebirr / E-Birr:</b> <code>{$ebirr['account_number']}</code> ({$ebirr['account_holder']})\n";
    $text .= "💳 <b>Kaafi:</b> <code>{$kaafi['account_number']}</code> ({$kaafi['account_holder']})\n\n";
    $text .= "Tap below to add funds or spend balance in store:";

    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                ['text' => '💳 Add Money in Store', 'web_app' => ['url' => WEB_APP_URL]],
                ['text' => '📦 My Orders', 'callback_data' => 'cmd_myorders']
            ]
        ]
    ];

    sendTelegramApi('sendMessage', [
        'chat_id'      => $chatId,
        'text'         => $text,
        'parse_mode'   => 'HTML',
        'reply_markup' => $inlineKeyboard
    ]);
}

/**
 * --------------------------------------------------------------------
 * Support & Payment Guide Message (/paysupport)
 * --------------------------------------------------------------------
 */
function sendSupportMessage(int|string $chatId): void {
    $cbe   = PAYMENT_CHANNELS['CBE'];
    $ebirr = PAYMENT_CHANNELS['EBIRR'];
    $kaafi = PAYMENT_CHANNELS['KAAFI'];

    $text = "💳 <b>Local Payment Instructions & Reconciliation:</b>\n\n";
    $text .= "To complete your purchase, transfer the exact order amount to any of our official accounts:\n\n";

    $text .= "🏦 <b>1. Commercial Bank of Ethiopia (CBE)</b>\n";
    $text .= "• Account: <code>{$cbe['account_number']}</code>\n";
    $text .= "• Name: <b>{$cbe['account_holder']}</b>\n";
    $text .= "• <i>Note: Copy the FT transaction reference from your confirmation SMS.</i>\n\n";

    $text .= "📱 <b>2. Telebirr / E-Birr</b>\n";
    $text .= "• Account: <code>{$ebirr['account_number']}</code>\n";
    $text .= "• Name: <b>{$ebirr['account_holder']}</b>\n";
    $text .= "• <i>Note: Copy the transaction ID from your Telebirr SMS.</i>\n\n";

    $text .= "💳 <b>3. Kaafi Payment</b>\n";
    $text .= "• Account: <code>{$kaafi['account_number']}</code>\n";
    $text .= "• Name: <b>{$kaafi['account_holder']}</b>\n\n";

    $text .= "ℹ️ <b>How to Reconcile & Get Your Delivery:</b>\n";
    $text .= "1. Open the Storefront via the button below.\n";
    $text .= "2. Select your product and chosen payment channel.\n";
    $text .= "3. Paste your bank Transaction Reference into the checkout box.\n";
    $text .= "4. Your order is instantly queued and verified!\n\n";
    $supportHandle = getSupportContact();
    $text .= "Need manual help? Contact support: {$supportHandle}";

    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                ['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]
            ]
        ]
    ];

    sendTelegramApi('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'reply_markup' => $inlineKeyboard
    ]);
}

/**
 * --------------------------------------------------------------------
 * Send Customer Orders Directly into Chat (/myorders)
 * --------------------------------------------------------------------
 */
function sendUserOrders(int|string $chatId, int $telegramId): void {
    try {
        $db = getDb();
        if (!$db) {
            sendTelegramApi('sendMessage', [
                'chat_id' => $chatId,
                'text' => "📦 Please check your orders in the store:\n",
                'reply_markup' => ['inline_keyboard' => [[['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]]]]
            ]);
            return;
        }
        $stmt = $db->prepare("
            SELECT * FROM `orders` 
            WHERE `telegram_user_id` = :uid 
            ORDER BY `id` DESC LIMIT 5
        ");
        $stmt->execute([':uid' => $telegramId]);
        $orders = $stmt->fetchAll();

        if (empty($orders)) {
            sendTelegramApi('sendMessage', [
                'chat_id' => $chatId,
                'text' => "📦 <b>You have not placed any orders yet.</b>\nTap below to explore our products:",
                'parse_mode' => 'HTML',
                'reply_markup' => [
                    'inline_keyboard' => [
                        [['text' => '🛍️ Browse Catalog', 'web_app' => ['url' => WEB_APP_URL]]]
                    ]
                ]
            ]);
            return;
        }

        $text = "📋 <b>Your Recent Orders:</b>\n\n";
        foreach ($orders as $o) {
            $statusEmoji = match($o['fulfillment_status']) {
                'completed'  => '✅ Completed',
                'processing' => '⏳ Processing',
                'failed'     => '❌ Failed',
                default      => '🕒 Pending Verification'
            };

            $text .= "📦 <b>{$o['product_name']}</b>\n";
            $text .= "• Order ID: <code>{$o['order_uuid']}</code>\n";
            $text .= "• Amount: <b>" . number_format((float)$o['amount'], 2) . " {$o['currency']}</b>\n";
            $text .= "• Payment: {$o['payment_channel']} (Ref: <code>{$o['transaction_reference']}</code>)\n";
            $text .= "• Status: {$statusEmoji}\n";

            if ($o['fulfillment_status'] === 'completed' && !empty($o['delivery_code'])) {
                $text .= "🔑 <b>Delivery Code / Credentials:</b>\n<code>" . htmlspecialchars($o['delivery_code'], ENT_QUOTES, 'UTF-8') . "</code>\n";
                if (!empty($o['redemption_instructions'])) {
                    $text .= "📖 <i>" . htmlspecialchars($o['redemption_instructions'], ENT_QUOTES, 'UTF-8') . "</i>\n";
                }
            }
            $text .= "-----------------------------------\n";
        }

        sendTelegramApi('sendMessage', [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'HTML',
            'reply_markup' => [
                'inline_keyboard' => [
                    [['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]]
                ]
            ]
        ]);
    } catch (Exception $e) {
        error_log("Failed to fetch user orders: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Admin Command: Query Ethio-Viral Balance (/balance)
 * --------------------------------------------------------------------
 */
function sendAdminBalance(int|string $chatId): void {
    $res = callEthioViralApi('/balance', 'GET');
    if ($res['success'] && isset($res['data'])) {
        $balance = $res['data']['balance'] ?? $res['data']['amount'] ?? 'N/A';
        $currency = $res['data']['currency'] ?? 'USD';
        $text = "💰 <b>Ethio-Viral Reseller Wallet Status:</b>\n\n";
        $text .= "• Live Balance: <b>{$balance} {$currency}</b>\n";
        $text .= "• API Endpoint: <code>" . ETHIO_VIRAL_API_URL . "</code>\n";
        $text .= "• Status: 🟢 Connected & Healthy";
    } else {
        $text = "⚠️ <b>Ethio-Viral API Check:</b>\n" . htmlspecialchars($res['error'] ?? 'API response code: ' . $res['status']);
    }

    sendTelegramApi('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML'
    ]);
}

/**
 * --------------------------------------------------------------------
 * Admin Command: List Pending Orders (/pending)
 * --------------------------------------------------------------------
 */
function sendAdminPendingOrders(int|string $chatId): void {
    try {
        $db = getDb();
        $stmt = $db->query("
            SELECT o.*, u.username, u.first_name 
            FROM `orders` o
            LEFT JOIN `users` u ON o.telegram_user_id = u.telegram_id
            WHERE o.payment_status = 'pending'
            ORDER BY o.id ASC LIMIT 10
        ");
        $pending = $stmt->fetchAll();

        if (empty($pending)) {
            sendTelegramApi('sendMessage', [
                'chat_id' => $chatId,
                'text' => "✅ No pending orders awaiting payment verification.",
                'parse_mode' => 'HTML'
            ]);
            return;
        }

        foreach ($pending as $order) {
            $userLabel = !empty($order['username']) ? "@" . $order['username'] : $order['first_name'];
            $text = "🔔 <b>PENDING RECONCILIATION</b>\n\n";
            $text .= "• Order ID: <code>{$order['order_uuid']}</code>\n";
            $text .= "• Customer: {$userLabel} (ID: <code>{$order['telegram_user_id']}</code>)\n";
            $text .= "• Item: <b>{$order['product_name']}</b>\n";
            $text .= "• Amount: <b>" . number_format((float)$order['amount'], 2) . " {$order['currency']}</b>\n";
            $text .= "• Channel: <b>{$order['payment_channel']}</b>\n";
            $text .= "• Bank Tx Reference: <code>{$order['transaction_reference']}</code>\n";
            $text .= "• Date: {$order['created_at']}";

            $inlineKeyboard = [
                'inline_keyboard' => [
                    [
                        ['text' => '✅ Approve & Fulfill', 'callback_data' => 'approve_' . $order['id']],
                        ['text' => '❌ Reject', 'callback_data' => 'reject_' . $order['id']]
                    ]
                ]
            ];

            sendTelegramApi('sendMessage', [
                'chat_id' => $chatId,
                'text' => $text,
                'parse_mode' => 'HTML',
                'reply_markup' => $inlineKeyboard
            ]);
        }
    } catch (Exception $e) {
        error_log("Failed to list pending orders: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Interactive Callback Query Handler (Admin Approvals / User Buttons)
 * --------------------------------------------------------------------
 */
function handleCallbackQuery(array $callbackQuery): void {
    $callbackId = $callbackQuery['id'];
    $data       = $callbackQuery['data'] ?? '';
    $from       = $callbackQuery['from'] ?? [];
    $userId     = (int) ($from['id'] ?? 0);
    $message    = $callbackQuery['message'] ?? null;
    $chatId     = $message['chat']['id'] ?? $userId;
    $messageId  = $message['message_id'] ?? null;

    // Handle user quick buttons
    if ($data === 'cmd_support') {
        sendSupportMessage($chatId);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }
    if ($data === 'cmd_myorders') {
        sendUserOrders($chatId, $userId);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }
    if ($data === 'cmd_wallet') {
        sendWalletCard($chatId, $userId);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }
    if ($data === 'cmd_profile') {
        sendUserProfileCard($chatId, $userId, $from['first_name'] ?? 'Customer', $from['username'] ?? null);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }

    // Admin commands via inline buttons
    if ($data === 'cmd_admin_pending_orders') {
        if (isAdmin($userId)) sendAdminPendingOrders($chatId);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }
    if ($data === 'cmd_admin_pending_topups') {
        if (isAdmin($userId)) sendAdminPendingTopups($chatId);
        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
        return;
    }

    // Admin wallet top-up approvals
    if (str_starts_with($data, 'topup_appr_')) {
        if (!isAdmin($userId)) {
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => '⛔ Unauthorized. Admin permissions required.',
                'show_alert' => true
            ]);
            return;
        }
        $topupId = (int) substr($data, strlen('topup_appr_'));
        processTopupApproval($topupId, $chatId, $messageId, $from['username'] ?? 'Admin', $callbackId);
        return;
    }

    if (str_starts_with($data, 'topup_rej_')) {
        if (!isAdmin($userId)) {
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => '⛔ Unauthorized.',
                'show_alert' => true
            ]);
            return;
        }
        $topupId = (int) substr($data, strlen('topup_rej_'));
        processTopupRejection($topupId, $chatId, $messageId, $from['username'] ?? 'Admin', $callbackId);
        return;
    }

    // Admin order approval / rejection actions
    if (str_starts_with($data, 'approve_')) {
        if (!isAdmin($userId)) {
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => '⛔ Unauthorized. Admin permissions required.',
                'show_alert' => true
            ]);
            return;
        }

        $orderDbId = (int) substr($data, strlen('approve_'));
        processOrderApproval($orderDbId, $chatId, $messageId, $from['username'] ?? $from['first_name'] ?? 'Admin', $callbackId);
        return;
    }

    if (str_starts_with($data, 'reject_')) {
        if (!isAdmin($userId)) {
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => '⛔ Unauthorized.',
                'show_alert' => true
            ]);
            return;
        }

        $orderDbId = (int) substr($data, strlen('reject_'));
        processOrderRejection($orderDbId, $chatId, $messageId, $from['username'] ?? 'Admin', $callbackId);
        return;
    }

    sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId]);
}

/**
 * --------------------------------------------------------------------
 * Approve Order & Fulfill via Ethio-Viral Premium API
 * --------------------------------------------------------------------
 * Uses Row-Level Locking (SELECT ... FOR UPDATE) to prevent race conditions.
 */
function processOrderApproval(int $orderDbId, int|string $adminChatId, ?int $adminMsgId, string $adminName, string $callbackId): void {
    $db = getDb();

    try {
        $db->beginTransaction();

        // Row-level lock to ensure order is not concurrently fulfilled
        $stmt = $db->prepare("SELECT * FROM `orders` WHERE `id` = :id FOR UPDATE");
        $stmt->execute([':id' => $orderDbId]);
        $order = $stmt->fetch();

        if (!$order) {
            $db->rollBack();
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => 'Order not found.',
                'show_alert' => true
            ]);
            return;
        }

        if ($order['payment_status'] === 'verified' && $order['fulfillment_status'] === 'completed') {
            $db->rollBack();
            sendTelegramApi('answerCallbackQuery', [
                'callback_query_id' => $callbackId,
                'text' => 'Order has already been fulfilled.',
                'show_alert' => true
            ]);
            return;
        }

        // 1. Call Ethio-Viral API to purchase product with Idempotency-Key
        $idempotencyKey = $order['idempotency_key'];
        $apiPayload = [
            'product_id' => $order['product_id'],
            'quantity'   => 1
        ];

        $ethioResponse = callEthioViralApi('/orders', 'POST', $apiPayload, $idempotencyKey);

        $ethioOrderId = null;
        $deliveryCode = null;
        $instructions = $order['redemption_instructions'] ?? '';

        if ($ethioResponse['success'] && isset($ethioResponse['data'])) {
            $responseData = $ethioResponse['data'];
            $ethioOrderId = (string) ($responseData['order_id'] ?? $responseData['id'] ?? 'EV-' . time());
            
            // If delivery is returned immediately in the purchase response
            if (!empty($responseData['delivery'])) {
                $deliveryCode = is_array($responseData['delivery']) 
                    ? json_encode($responseData['delivery']) 
                    : (string) $responseData['delivery'];
            } else {
                // Otherwise fetch from GET /orders/:id/delivery
                $deliveryRes = callEthioViralApi("/orders/{$ethioOrderId}/delivery", 'GET');
                if ($deliveryRes['success'] && isset($deliveryRes['data'])) {
                    $d = $deliveryRes['data'];
                    $deliveryCode = $d['code'] ?? $d['delivery'] ?? $d['voucher'] ?? json_encode($d);
                    if (!empty($d['instructions'])) {
                        $instructions = $d['instructions'];
                    }
                }
            }
        } else {
            // If the provider returned a specific error or test mock is needed
            error_log("Ethio-Viral API returned non-200: " . json_encode($ethioResponse));
            // Check if mock delivery code can be generated for testing if API key is not yet set
            if (empty(ETHIO_VIRAL_API_KEY) || ETHIO_VIRAL_API_KEY === 'ethio_viral_live_token_here') {
                $ethioOrderId = "SIM-" . strtoupper(bin2hex(random_bytes(4)));
                $deliveryCode = "KEY-" . strtoupper(bin2hex(random_bytes(8)));
                $instructions = "Simulated delivery: Product voucher generated successfully.";
            } else {
                $db->rollBack();
                sendTelegramApi('answerCallbackQuery', [
                    'callback_query_id' => $callbackId,
                    'text' => 'Ethio-Viral API Error: ' . ($ethioResponse['data']['message'] ?? 'Fulfillment failed'),
                    'show_alert' => true
                ]);
                return;
            }
        }

        // 2. Update order record in MySQL
        $updateStmt = $db->prepare("
            UPDATE `orders` SET
                `payment_status` = 'verified',
                `fulfillment_status` = 'completed',
                `ethio_viral_order_id` = :ethio_id,
                `delivery_code` = :delivery,
                `redemption_instructions` = :instructions,
                `admin_notes` = :notes,
                `updated_at` = CURRENT_TIMESTAMP
            WHERE `id` = :id
        ");
        $updateStmt->execute([
            ':ethio_id'     => $ethioOrderId,
            ':delivery'     => $deliveryCode,
            ':instructions' => $instructions,
            ':notes'        => "Approved by @{$adminName} at " . date('Y-m-d H:i:s'),
            ':id'           => $orderDbId
        ]);

        $db->commit();

        sendTelegramApi('answerCallbackQuery', [
            'callback_query_id' => $callbackId,
            'text' => '✅ Order approved and fulfilled!'
        ]);

        // 3. Edit Admin Message in Telegram
        if ($adminMsgId) {
            $updatedText = "✅ <b>ORDER APPROVED & FULFILLED</b>\n\n";
            $updatedText .= "• Order ID: <code>{$order['order_uuid']}</code>\n";
            $updatedText .= "• Item: <b>{$order['product_name']}</b>\n";
            $updatedText .= "• Bank Ref: <code>{$order['transaction_reference']}</code>\n";
            $updatedText .= "• Ethio-Viral ID: <code>{$ethioOrderId}</code>\n";
            $updatedText .= "• Approved by: @{$adminName}\n";
            $updatedText .= "• Time: " . date('Y-m-d H:i:s');

            sendTelegramApi('editMessageText', [
                'chat_id'    => $adminChatId,
                'message_id' => $adminMsgId,
                'text'       => $updatedText,
                'parse_mode' => 'HTML'
            ]);
        }

        // 4. Send Instant Delivery Notification to Customer with Social Proof Cashback Prompt
        $custText = "🎉 <b>Payment Verified & Your Order is Ready!</b>\n\n";
        $custText .= "📦 <b>Product:</b> {$order['product_name']}\n";
        $custText .= "🧾 <b>Order ID:</b> <code>{$order['order_uuid']}</code>\n\n";
        $custText .= "🔑 <b>Delivery Code / Access Details:</b>\n";
        $custText .= "<pre>" . htmlspecialchars((string)$deliveryCode, ENT_QUOTES, 'UTF-8') . "</pre>\n\n";

        if (!empty($instructions)) {
            $custText .= "💡 <b>Instructions:</b>\n" . htmlspecialchars($instructions, ENT_QUOTES, 'UTF-8') . "\n\n";
        }

        $custText .= "🎁 <b>50 ETB Wallet Cashback Incentive:</b>\n";
        $custText .= "Post a screenshot of your active subscription in our community chat @AtkeStore to receive <b>50 ETB</b> cashback directly to your wallet!\n\n";
        $custText .= "Thank you for shopping with Atke Digital! Enjoy your subscription.";

        sendTelegramApi('sendMessage', [
            'chat_id'      => $order['telegram_user_id'],
            'text'         => $custText,
            'parse_mode'   => 'HTML',
            'reply_markup' => [
                'inline_keyboard' => [
                    [['text' => '🛍️ View in Mini App', 'web_app' => ['url' => WEB_APP_URL]]],
                    [['text' => '💬 Post Review for 50 ETB Bonus', 'url' => 'https://t.me/AtkeStore']]
                ]
            ]
        ]);

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log("Order approval error: " . $e->getMessage());
        sendTelegramApi('answerCallbackQuery', [
            'callback_query_id' => $callbackId,
            'text' => 'Internal error: ' . $e->getMessage(),
            'show_alert' => true
        ]);
    }
}

/**
 * --------------------------------------------------------------------
 * Reject Order (Invalid Reference or Fraud)
 * --------------------------------------------------------------------
 */
function processOrderRejection(int $orderDbId, int|string $adminChatId, ?int $adminMsgId, string $adminName, string $callbackId): void {
    $db = getDb();

    try {
        $stmt = $db->prepare("SELECT * FROM `orders` WHERE `id` = :id");
        $stmt->execute([':id' => $orderDbId]);
        $order = $stmt->fetch();

        if (!$order) {
            sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => 'Order not found']);
            return;
        }

        $stmt = $db->prepare("
            UPDATE `orders` SET 
                `payment_status` = 'rejected',
                `fulfillment_status` = 'failed',
                `admin_notes` = :notes,
                `updated_at` = CURRENT_TIMESTAMP
            WHERE `id` = :id
        ");
        $stmt->execute([
            ':notes' => "Rejected by @{$adminName} at " . date('Y-m-d H:i:s'),
            ':id'    => $orderDbId
        ]);

        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => 'Order rejected.']);

        // Update Admin message
        if ($adminMsgId) {
            $updatedText = "❌ <b>ORDER REJECTED</b>\n\n";
            $updatedText .= "• Order ID: <code>{$order['order_uuid']}</code>\n";
            $updatedText .= "• Bank Ref: <code>{$order['transaction_reference']}</code>\n";
            $updatedText .= "• Rejected by: @{$adminName}\n";
            $updatedText .= "• Time: " . date('Y-m-d H:i:s');

            sendTelegramApi('editMessageText', [
                'chat_id'    => $adminChatId,
                'message_id' => $adminMsgId,
                'text'       => $updatedText,
                'parse_mode' => 'HTML'
            ]);
        }

        // Notify customer
        $custText = "⚠️ <b>Order Payment Notice</b>\n\n";
        $custText .= "We were unable to verify your payment reference (<code>{$order['transaction_reference']}</code>) for order <code>{$order['order_uuid']}</code>.\n\n";
        $custText .= "If this was an error, please reach out to our support team with your payment receipt:\n";
        $supportHandle = getSupportContact();
        $custText .= "💬 Support: {$supportHandle}";

        sendTelegramApi('sendMessage', [
            'chat_id'    => $order['telegram_user_id'],
            'text'       => $custText,
            'parse_mode' => 'HTML'
        ]);

    } catch (Exception $e) {
        error_log("Order rejection error: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Default Help Message
 * --------------------------------------------------------------------
 */
function sendDefaultHelpMessage(int|string $chatId): void {
    sendTelegramApi('sendMessage', [
        'chat_id' => $chatId,
        'text' => "🛍️ Use the button below to browse products and place an order:\n\nCommands:\n/start - Open Store\n/myorders - View your purchases\n/paysupport - Payment accounts and instructions",
        'reply_markup' => [
            'inline_keyboard' => [
                [['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]]
            ]
        ]
    ]);
}

/**
 * --------------------------------------------------------------------
 * Admin Check Helper
 * --------------------------------------------------------------------
 */
function isAdmin(int $telegramId): bool {
    return in_array((string)$telegramId, ADMIN_TELEGRAM_IDS, true);
}

/**
 * --------------------------------------------------------------------
 * Admin Dashboard View (/admin)
 * --------------------------------------------------------------------
 */
function sendAdminDashboard(int|string $chatId): void {
    $db = getDb();
    $pendingOrders = 0;
    $pendingTopups = 0;
    $totalProducts = 8;

    if ($db) {
        $pendingOrders = (int) $db->query("SELECT COUNT(*) FROM `orders` WHERE `payment_status` = 'pending'")->fetchColumn();
        $pendingTopups = (int) $db->query("SELECT COUNT(*) FROM `wallet_transactions` WHERE `status` = 'pending' AND `type` = 'deposit'")->fetchColumn();
        $totalProducts = (int) $db->query("SELECT COUNT(*) FROM `products_cache` WHERE `is_active` = 1")->fetchColumn();
    }

    $text = "⚙️ <b>Atke Store Admin Hub</b>\n\n";
    $text .= "📊 <b>Pending Orders:</b> <b>{$pendingOrders}</b> awaiting review\n";
    $text .= "💳 <b>Pending Top-ups:</b> <b>{$pendingTopups}</b> awaiting credit\n";
    $text .= "📦 <b>Active Products:</b> <b>{$totalProducts}</b> in catalog\n";
    $text .= "📢 <b>Channel:</b> " . TELEGRAM_CHANNEL_USERNAME . "\n\n";
    $text .= "Select an action:";

    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                ['text' => "📋 Orders ({$pendingOrders})", 'callback_data' => 'cmd_admin_pending_orders'],
                ['text' => "💳 Top-ups ({$pendingTopups})", 'callback_data' => 'cmd_admin_pending_topups']
            ],
            [
                ['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]
            ]
        ]
    ];

    sendTelegramApi('sendMessage', [
        'chat_id'      => $chatId,
        'text'         => $text,
        'parse_mode'   => 'HTML',
        'reply_markup' => $inlineKeyboard
    ]);
}

/**
 * --------------------------------------------------------------------
 * Admin: List Pending Wallet Top-ups
 * --------------------------------------------------------------------
 */
function sendAdminPendingTopups(int|string $chatId): void {
    $db = getDb();
    if (!$db) return;

    try {
        $stmt = $db->query("
            SELECT t.*, u.username, u.first_name 
            FROM `wallet_transactions` t 
            LEFT JOIN `users` u ON t.telegram_user_id = u.telegram_id 
            WHERE t.status = 'pending' AND t.type = 'deposit' 
            ORDER BY t.id ASC LIMIT 10
        ");
        $pending = $stmt->fetchAll();

        if (empty($pending)) {
            sendTelegramApi('sendMessage', [
                'chat_id' => $chatId,
                'text'    => "✅ No pending wallet deposits awaiting credit.",
                'parse_mode' => 'HTML'
            ]);
            return;
        }

        foreach ($pending as $topup) {
            $userTag = !empty($topup['username']) ? "@" . $topup['username'] : $topup['first_name'];
            $text = "💳 <b>PENDING WALLET DEPOSIT</b>\n\n";
            $text .= "• Request ID: #<code>{$topup['id']}</code>\n";
            $text .= "• Customer: {$userTag} (ID: <code>{$topup['telegram_user_id']}</code>)\n";
            $text .= "• Amount: <b>" . number_format((float)$topup['amount'], 2) . " ETB</b>\n";
            $text .= "• Channel: <b>{$topup['payment_channel']}</b>\n";
            $text .= "• Bank Tx Ref: <code>{$topup['transaction_reference']}</code>\n";
            if (!empty($topup['receipt_image'])) {
                $text .= "• Screenshot: Attached ✅\n";
            }
            $text .= "• Date: {$topup['created_at']}";

            $inlineKeyboard = [
                'inline_keyboard' => [
                    [
                        ['text' => '✅ Credit Wallet (' . number_format((float)$topup['amount'], 0) . ' ETB)', 'callback_data' => 'topup_appr_' . $topup['id']],
                        ['text' => '❌ Reject', 'callback_data' => 'topup_rej_' . $topup['id']]
                    ]
                ]
            ];

            sendTelegramApi('sendMessage', [
                'chat_id'      => $chatId,
                'text'         => $text,
                'parse_mode'   => 'HTML',
                'reply_markup' => $inlineKeyboard
            ]);
        }
    } catch (Exception $e) {
        error_log("Failed to list pending topups: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Approve Wallet Top-up & Credit User Balance
 * --------------------------------------------------------------------
 */
function processTopupApproval(int $topupId, int|string $adminChatId, ?int $adminMsgId, string $adminName, string $callbackId): void {
    $db = getDb();
    if (!$db) return;

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("SELECT * FROM `wallet_transactions` WHERE `id` = :id FOR UPDATE");
        $stmt->execute([':id' => $topupId]);
        $tx = $stmt->fetch();

        if (!$tx) {
            $db->rollBack();
            sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => 'Top-up record not found.', 'show_alert' => true]);
            return;
        }

        if ($tx['status'] !== 'pending') {
            $db->rollBack();
            sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => "Already {$tx['status']}.", 'show_alert' => true]);
            return;
        }

        $db->prepare("UPDATE `wallet_transactions` SET `status` = 'completed' WHERE `id` = :id")
           ->execute([':id' => $topupId]);
        $db->prepare("UPDATE `users` SET `wallet_balance` = `wallet_balance` + :amt WHERE `telegram_id` = :uid")
           ->execute([':amt' => $tx['amount'], ':uid' => $tx['telegram_user_id']]);

        $db->commit();

        sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => "✅ Top-up #{$topupId} credited successfully!"]);

        if ($adminMsgId) {
            sendTelegramApi('editMessageText', [
                'chat_id'    => $adminChatId,
                'message_id' => $adminMsgId,
                'text'       => "✅ <b>TOP-UP CREDITED & COMPLETED</b>\n\n• Amount: <b>" . number_format((float)$tx['amount'], 2) . " ETB</b>\n• User ID: <code>{$tx['telegram_user_id']}</code>\n• Ref: <code>{$tx['transaction_reference']}</code>\n• Approved by: @{$adminName}",
                'parse_mode' => 'HTML'
            ]);
        }

        sendTelegramApi('sendMessage', [
            'chat_id'    => $tx['telegram_user_id'],
            'text'       => "🎉 <b>Wallet Credited!</b>\n\nYour top-up of <b>" . number_format((float)$tx['amount'], 2) . " ETB</b> has been verified and added to your balance. Tap below to shop!",
            'parse_mode' => 'HTML',
            'reply_markup' => ['inline_keyboard' => [[['text' => '🛍️ Browse Store', 'web_app' => ['url' => WEB_APP_URL]]]]]
        ]);
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log("Topup approval error: " . $e->getMessage());
    }
}

/**
 * --------------------------------------------------------------------
 * Reject Wallet Top-up
 * --------------------------------------------------------------------
 */
function processTopupRejection(int $topupId, int|string $adminChatId, ?int $adminMsgId, string $adminName, string $callbackId): void {
    $db = getDb();
    if (!$db) return;

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("SELECT * FROM `wallet_transactions` WHERE `id` = :id FOR UPDATE");
        $stmt->execute([':id' => $topupId]);
        $tx = $stmt->fetch();

        if ($tx && $tx['status'] === 'pending') {
            $db->prepare("UPDATE `wallet_transactions` SET `status` = 'rejected' WHERE `id` = :id")
               ->execute([':id' => $topupId]);
            $db->commit();

            sendTelegramApi('answerCallbackQuery', ['callback_query_id' => $callbackId, 'text' => "❌ Top-up #{$topupId} rejected."]);

            if ($adminMsgId) {
                sendTelegramApi('editMessageText', [
                    'chat_id'    => $adminChatId,
                    'message_id' => $adminMsgId,
                    'text'       => "❌ <b>TOP-UP REJECTED</b>\n\n• Amount: <b>" . number_format((float)$tx['amount'], 2) . " ETB</b>\n• User ID: <code>{$tx['telegram_user_id']}</code>\n• Rejected by: @{$adminName}",
                    'parse_mode' => 'HTML'
                ]);
            }

            sendTelegramApi('sendMessage', [
                'chat_id'    => $tx['telegram_user_id'],
                'text'       => "⚠️ <b>Deposit Notice</b>\n\nYour top-up of " . number_format((float)$tx['amount'], 2) . " ETB could not be verified on our banking statement. Contact support @AtkeShop for assistance.",
                'parse_mode' => 'HTML'
            ]);
        } else {
            $db->rollBack();
        }
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log("Topup rejection error: " . $e->getMessage());
    }
}
