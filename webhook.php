<?php
/**
 * ====================================================================
 * ATKE DIGITAL STORE - TELEGRAM BOT WEBHOOK RECEIVER
 * Deployment Target: Plesk Shared Hosting (shop.atke.com.et/webhook.php)
 * Handles incoming bot updates, menu button rendering, support & approvals
 * ====================================================================
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

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

    // Upsert user into database
    upsertUser($telegramId, $username, $firstName, $lastName, $langCode, $isBot);

    // Register persistent Web App Menu Button
    setupPersistentMenuButton($chatId);

    $command = explode(' ', $text)[0];

    switch ($command) {
        case '/start':
            sendWelcomeMessage($chatId, $firstName);
            break;

        case '/paysupport':
        case '/support':
            sendSupportMessage($chatId);
            break;

        case '/myorders':
        case '/orders':
            sendUserOrders($chatId, $telegramId);
            break;

        case '/balance':
            if (isAdmin($telegramId)) {
                sendAdminBalance($chatId);
            } else {
                sendWelcomeMessage($chatId, $firstName);
            }
            break;

        case '/pending':
            if (isAdmin($telegramId)) {
                sendAdminPendingOrders($chatId);
            }
            break;

        default:
            sendDefaultHelpMessage($chatId);
            break;
    }
}

/**
 * --------------------------------------------------------------------
 * Upsert User into MySQL
 * --------------------------------------------------------------------
 */
function upsertUser(int $telegramId, ?string $username, string $firstName, ?string $lastName, string $langCode, int $isBot): void {
    try {
        $db = getDb();
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
                ['text' => '📋 My Orders', 'callback_query' => 'cmd_myorders'],
                ['text' => '💬 Payment Guide & Support', 'callback_query' => 'cmd_support']
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
    $text .= "Need manual help? Contact support: @suq_support";

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

        // 4. Send Instant Delivery Notification to Customer
        $custText = "🎉 <b>Payment Verified & Your Order is Ready!</b>\n\n";
        $custText .= "📦 <b>Product:</b> {$order['product_name']}\n";
        $custText .= "🧾 <b>Order ID:</b> <code>{$order['order_uuid']}</code>\n\n";
        $custText .= "🔑 <b>Delivery Code / Access Details:</b>\n";
        $custText .= "<pre>" . htmlspecialchars((string)$deliveryCode, ENT_QUOTES, 'UTF-8') . "</pre>\n\n";

        if (!empty($instructions)) {
            $custText .= "💡 <b>Instructions:</b>\n" . htmlspecialchars($instructions, ENT_QUOTES, 'UTF-8') . "\n\n";
        }

        $custText .= "Thank you for shopping with Atke Digital! Enjoy your subscription.";

        sendTelegramApi('sendMessage', [
            'chat_id'      => $order['telegram_user_id'],
            'text'         => $custText,
            'parse_mode'   => 'HTML',
            'reply_markup' => [
                'inline_keyboard' => [
                    [['text' => '🛍️ View in Mini App', 'web_app' => ['url' => WEB_APP_URL]]]
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
        $custText .= "💬 Support: @suq_support";

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
