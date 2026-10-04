<?php
/**
 * ====================================================================
 * ATKE DIGITAL STORE - INTERNAL BACKEND ROUTING API
 * Deployment Target: Plesk Shared Hosting (shop.atke.com.et/api.php)
 * Handles AJAX/Fetch requests from the Telegram Mini App frontend
 * ====================================================================
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Set CORS headers for Mini App requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Determine action from query string or JSON payload
$action = $_GET['action'] ?? '';
$requestBody = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $requestBody = $decoded;
            if (empty($action) && isset($requestBody['action'])) {
                $action = (string) $requestBody['action'];
            }
        }
    }
}

// Router
switch ($action) {
    case 'products':
    case 'get_products':
        handleGetProducts();
        break;

    case 'payment_methods':
    case 'get_payment_methods':
        handleGetPaymentMethods();
        break;

    case 'create_order':
        handleCreateOrder($requestBody);
        break;

    case 'order_status':
    case 'get_order_status':
        handleGetOrderStatus();
        break;

    case 'my_orders':
    case 'get_my_orders':
        handleGetMyOrders($requestBody);
        break;

    case 'sync_catalog':
        handleSyncCatalog();
        break;

    case 'balance':
    case 'get_balance':
        handleGetBalance();
        break;

    default:
        sendJsonResponse([
            'success' => false,
            'error'   => 'Unknown or unspecified API action'
        ], 400);
        break;
}

/**
 * --------------------------------------------------------------------
 * 1. Retrieve Active Product Catalog
 * --------------------------------------------------------------------
 */
function handleGetProducts(): void {
    try {
        $db = getDb();
        $stmt = $db->query("
            SELECT 
                `id`, 
                `name`, 
                `category`, 
                `description`, 
                `instructions`, 
                `selling_price`, 
                `currency`, 
                `stock`, 
                `badge`, 
                `warranty`, 
                `image_url`
            FROM `products_cache`
            WHERE `is_active` = 1
            ORDER BY `stock` DESC, `selling_price` ASC
        ");
        $products = $stmt->fetchAll();

        // If products cache is completely empty, attempt on-the-fly sync from Ethio-Viral
        if (empty($products)) {
            syncEthioViralCatalog();
            $stmt = $db->query("SELECT * FROM `products_cache` WHERE `is_active` = 1");
            $products = $stmt->fetchAll();
        }

        sendJsonResponse([
            'success'  => true,
            'products' => $products,
            'count'    => count($products)
        ]);
    } catch (Exception $e) {
        error_log("handleGetProducts error: " . $e->getMessage());
        sendJsonResponse(['success' => false, 'error' => 'Failed to load catalog'], 500);
    }
}

/**
 * --------------------------------------------------------------------
 * 2. Retrieve Local Payment Channels & Instructions
 * --------------------------------------------------------------------
 */
function handleGetPaymentMethods(): void {
    sendJsonResponse([
        'success'  => true,
        'channels' => array_values(PAYMENT_CHANNELS)
    ]);
}

/**
 * --------------------------------------------------------------------
 * 3. Process Mini App Checkout Order
 * --------------------------------------------------------------------
 * Validates Telegram initData, checks for duplicate bank transaction reference
 * with MySQL InnoDB row-level locking, generates unique Idempotency Key,
 * stores order, and alerts admin.
 */
function handleCreateOrder(array $body): void {
    $productId   = trim((string) ($body['product_id'] ?? ''));
    $channelKey  = strtoupper(trim((string) ($body['payment_channel'] ?? '')));
    $txReference = strtoupper(trim((string) ($body['transaction_reference'] ?? '')));
    $initDataRaw = (string) ($body['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');

    // 1. Basic validation
    if (empty($productId) || empty($channelKey) || empty($txReference)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Missing required fields: product_id, payment_channel, and transaction_reference are mandatory.'
        ], 422);
    }

    if (!array_key_exists($channelKey, PAYMENT_CHANNELS)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Invalid payment channel. Supported options: CBE, EBIRR, KAAFI.'
        ], 422);
    }

    // Strip whitespaces, dashes from reference
    $cleanTxRef = preg_replace('/[^A-Za-z0-9]/', '', $txReference);
    if (strlen($cleanTxRef) < 4 || strlen($cleanTxRef) > 64) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Invalid transaction reference format. Please enter your valid bank reference/FT number.'
        ], 422);
    }

    // 2. Validate Telegram user credentials
    $telegramUser = validateTelegramInitData($initDataRaw);
    $telegramId = 0;
    $telegramUsername = null;
    $telegramFirstName = 'Valued Customer';

    if ($telegramUser && isset($telegramUser['id'])) {
        $telegramId        = (int) $telegramUser['id'];
        $telegramUsername  = $telegramUser['username'] ?? null;
        $telegramFirstName = $telegramUser['first_name'] ?? 'Customer';
    } else {
        // Fallback for direct browser testing if specified in body
        if (isset($body['fallback_telegram_id']) && is_numeric($body['fallback_telegram_id'])) {
            $telegramId = (int) $body['fallback_telegram_id'];
            $telegramUsername = $body['fallback_username'] ?? 'test_user';
            $telegramFirstName = $body['fallback_first_name'] ?? 'Test User';
        } else {
            sendJsonResponse([
                'success' => false,
                'error'   => 'Unauthorized: Invalid Telegram Mini App session signature.'
            ], 401);
        }
    }

    $db = getDb();

    try {
        $db->beginTransaction();

        // Ensure user exists in database
        $userStmt = $db->prepare("
            INSERT INTO `users` (`telegram_id`, `username`, `first_name`)
            VALUES (:tid, :uname, :fname)
            ON DUPLICATE KEY UPDATE 
                `username` = VALUES(`username`),
                `first_name` = VALUES(`first_name`),
                `updated_at` = CURRENT_TIMESTAMP
        ");
        $userStmt->execute([
            ':tid'   => $telegramId,
            ':uname' => $telegramUsername,
            ':fname' => $telegramFirstName
        ]);

        // 3. Concurrency Protection & Duplicate Reference Check with Row Lock
        $dupStmt = $db->prepare("
            SELECT `id`, `order_uuid`, `payment_status` 
            FROM `orders` 
            WHERE `transaction_reference` = :tx_ref 
            FOR UPDATE
        ");
        $dupStmt->execute([':tx_ref' => $cleanTxRef]);
        $existingOrder = $dupStmt->fetch();

        if ($existingOrder) {
            $db->rollBack();
            sendJsonResponse([
                'success' => false,
                'error'   => "Transaction reference '{$cleanTxRef}' has already been submitted for order #{$existingOrder['order_uuid']}."
            ], 409);
        }

        // 4. Retrieve Product Information
        $prodStmt = $db->prepare("
            SELECT `id`, `name`, `selling_price`, `currency`, `stock`, `instructions`
            FROM `products_cache`
            WHERE `id` = :pid AND `is_active` = 1
            FOR UPDATE
        ");
        $prodStmt->execute([':pid' => $productId]);
        $product = $prodStmt->fetch();

        if (!$product) {
            $db->rollBack();
            sendJsonResponse([
                'success' => false,
                'error'   => 'The requested product is no longer available or was not found.'
            ], 404);
        }

        if ((int)$product['stock'] <= 0) {
            $db->rollBack();
            sendJsonResponse([
                'success' => false,
                'error'   => 'This item is currently out of stock. Please check back shortly.'
            ], 400);
        }

        // 5. Generate unique Order UUID and Idempotency Key
        $orderUuid = 'ATKE-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        $idempotencyKey = 'ev_ord_' . md5($orderUuid . '_' . $cleanTxRef . '_' . time());

        // 6. Insert Order into MySQL
        $insertStmt = $db->prepare("
            INSERT INTO `orders` (
                `order_uuid`,
                `telegram_user_id`,
                `product_id`,
                `product_name`,
                `amount`,
                `currency`,
                `payment_channel`,
                `transaction_reference`,
                `idempotency_key`,
                `payment_status`,
                `fulfillment_status`,
                `redemption_instructions`
            ) VALUES (
                :order_uuid,
                :telegram_user_id,
                :product_id,
                :product_name,
                :amount,
                :currency,
                :payment_channel,
                :transaction_reference,
                :idempotency_key,
                'pending',
                'pending',
                :instructions
            )
        ");

        $insertStmt->execute([
            ':order_uuid'             => $orderUuid,
            ':telegram_user_id'       => $telegramId,
            ':product_id'             => $product['id'],
            ':product_name'           => $product['name'],
            ':amount'                 => $product['selling_price'],
            ':currency'               => $product['currency'],
            ':payment_channel'        => $channelKey,
            ':transaction_reference'  => $cleanTxRef,
            ':idempotency_key'        => $idempotencyKey,
            ':instructions'           => $product['instructions'] ?? ''
        ]);

        $orderInsertId = (int) $db->lastInsertId();

        // 7. Check if Auto-Fulfillment is enabled in system_settings
        $settingStmt = $db->query("SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'auto_fulfillment'");
        $autoFulfill = (int) ($settingStmt->fetchColumn() ?: 0);

        $db->commit();

        // 8. Send Telegram Alert to Admin for Reconciliation
        notifyAdminNewOrder([
            'id'                    => $orderInsertId,
            'order_uuid'            => $orderUuid,
            'customer_name'         => $telegramFirstName,
            'customer_username'     => $telegramUsername,
            'customer_id'           => $telegramId,
            'product_name'          => $product['name'],
            'amount'                => $product['selling_price'],
            'currency'              => $product['currency'],
            'payment_channel'       => $channelKey,
            'transaction_reference' => $cleanTxRef
        ]);

        sendJsonResponse([
            'success' => true,
            'message' => 'Order submitted successfully! Our team is verifying your payment reference.',
            'order'   => [
                'order_uuid'            => $orderUuid,
                'product_name'          => $product['name'],
                'amount'                => (float) $product['selling_price'],
                'currency'              => $product['currency'],
                'payment_channel'       => $channelKey,
                'transaction_reference' => $cleanTxRef,
                'status'                => 'pending',
                'fulfillment_status'    => 'pending'
            ]
        ], 201);

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log("Order creation exception: " . $e->getMessage());
        sendJsonResponse([
            'success' => false,
            'error'   => 'Database error while registering order: ' . $e->getMessage()
        ], 500);
    }
}

/**
 * --------------------------------------------------------------------
 * 4. Get Status of a Specific Order (Used for live polling)
 * --------------------------------------------------------------------
 */
function handleGetOrderStatus(): void {
    $orderUuid = trim((string) ($_GET['order_uuid'] ?? ''));

    if (empty($orderUuid)) {
        sendJsonResponse(['success' => false, 'error' => 'Missing order_uuid parameter'], 400);
    }

    try {
        $db = getDb();
        $stmt = $db->prepare("
            SELECT 
                `order_uuid`,
                `product_name`,
                `amount`,
                `currency`,
                `payment_channel`,
                `transaction_reference`,
                `payment_status`,
                `fulfillment_status`,
                `delivery_code`,
                `redemption_instructions`,
                `created_at`,
                `updated_at`
            FROM `orders`
            WHERE `order_uuid` = :uuid
        ");
        $stmt->execute([':uuid' => $orderUuid]);
        $order = $stmt->fetch();

        if (!$order) {
            sendJsonResponse(['success' => false, 'error' => 'Order not found'], 404);
        }

        sendJsonResponse([
            'success' => true,
            'order'   => $order
        ]);
    } catch (Exception $e) {
        error_log("handleGetOrderStatus error: " . $e->getMessage());
        sendJsonResponse(['success' => false, 'error' => 'Failed to query order status'], 500);
    }
}

/**
 * --------------------------------------------------------------------
 * 5. Retrieve Order History for the Current Telegram User
 * --------------------------------------------------------------------
 */
function handleGetMyOrders(array $body): void {
    $initDataRaw = (string) ($body['init_data'] ?? $_GET['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');
    $telegramUser = validateTelegramInitData($initDataRaw);

    $telegramId = null;
    if ($telegramUser && isset($telegramUser['id'])) {
        $telegramId = (int) $telegramUser['id'];
    } elseif (isset($_GET['user_id']) && is_numeric($_GET['user_id'])) {
        // Fallback for testing
        $telegramId = (int) $_GET['user_id'];
    }

    if (!$telegramId) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized user session'], 401);
    }

    try {
        $db = getDb();
        $stmt = $db->prepare("
            SELECT 
                `order_uuid`,
                `product_name`,
                `amount`,
                `currency`,
                `payment_channel`,
                `payment_status`,
                `fulfillment_status`,
                `delivery_code`,
                `redemption_instructions`,
                `created_at`
            FROM `orders`
            WHERE `telegram_user_id` = :uid
            ORDER BY `id` DESC
            LIMIT 20
        ");
        $stmt->execute([':uid' => $telegramId]);
        $orders = $stmt->fetchAll();

        sendJsonResponse([
            'success' => true,
            'orders'  => $orders
        ]);
    } catch (Exception $e) {
        error_log("handleGetMyOrders error: " . $e->getMessage());
        sendJsonResponse(['success' => false, 'error' => 'Failed to load order history'], 500);
    }
}

/**
 * --------------------------------------------------------------------
 * 6. Sync Catalog from Ethio-Viral Premium API (GET /products)
 * --------------------------------------------------------------------
 */
function handleSyncCatalog(): void {
    $result = syncEthioViralCatalog();
    sendJsonResponse($result);
}

function syncEthioViralCatalog(): array {
    $apiRes = callEthioViralApi('/products', 'GET');

    if (!$apiRes['success'] || !isset($apiRes['data'])) {
        return [
            'success' => false,
            'error'   => 'Ethio-Viral API unreachable or returned error: ' . ($apiRes['error'] ?? 'HTTP ' . $apiRes['status'])
        ];
    }

    $rawProducts = $apiRes['data']['products'] ?? $apiRes['data']['data'] ?? $apiRes['data'];
    if (!is_array($rawProducts)) {
        return ['success' => false, 'error' => 'Unexpected response format from Ethio-Viral API'];
    }

    $db = getDb();
    $rateStmt = $db->query("SELECT `setting_value` FROM `system_settings` WHERE `setting_key` = 'usd_to_etb_rate'");
    $usdRate = (float) ($rateStmt->fetchColumn() ?: 140.00);

    $upsertStmt = $db->prepare("
        INSERT INTO `products_cache` (
            `id`,
            `name`,
            `category`,
            `description`,
            `instructions`,
            `wholesale_price`,
            `selling_price`,
            `currency`,
            `stock`,
            `is_active`
        ) VALUES (
            :id,
            :name,
            :category,
            :description,
            :instructions,
            :wholesale_price,
            :selling_price,
            'ETB',
            :stock,
            1
        ) ON DUPLICATE KEY UPDATE
            `name` = VALUES(`name`),
            `category` = VALUES(`category`),
            `description` = VALUES(`description`),
            `instructions` = VALUES(`instructions`),
            `wholesale_price` = VALUES(`wholesale_price`),
            `selling_price` = VALUES(`selling_price`),
            `stock` = VALUES(`stock`),
            `is_active` = 1,
            `synced_at` = CURRENT_TIMESTAMP
    ");

    $count = 0;
    foreach ($rawProducts as $p) {
        $id = (string) ($p['id'] ?? $p['product_id'] ?? '');
        $name = (string) ($p['name'] ?? 'Premium Product');
        if (empty($id)) continue;

        $costUsd = (float) ($p['price'] ?? $p['wholesale_price'] ?? 5.00);
        $sellingPriceEtb = round($costUsd * $usdRate * 1.15, -1); // 15% margin rounded to nearest 10 ETB

        $upsertStmt->execute([
            ':id'              => $id,
            ':name'            => $name,
            ':category'        => (string) ($p['category'] ?? 'General'),
            ':description'     => (string) ($p['description'] ?? ''),
            ':instructions'    => (string) ($p['instructions'] ?? ''),
            ':wholesale_price' => $costUsd,
            ':selling_price'   => $sellingPriceEtb,
            ':stock'           => (int) ($p['stock'] ?? 10)
        ]);
        $count++;
    }

    return [
        'success' => true,
        'synced'  => $count,
        'message' => "Successfully synced {$count} products from Ethio-Viral."
    ];
}

/**
 * --------------------------------------------------------------------
 * 7. Query Reseller Wallet Balance (GET /balance)
 * --------------------------------------------------------------------
 */
function handleGetBalance(): void {
    $res = callEthioViralApi('/balance', 'GET');
    if ($res['success']) {
        sendJsonResponse([
            'success' => true,
            'balance' => $res['data']
        ]);
    } else {
        sendJsonResponse([
            'success' => false,
            'error'   => $res['error'] ?? 'Failed to retrieve balance from Ethio-Viral'
        ], 502);
    }
}

/**
 * --------------------------------------------------------------------
 * Helper: Notify Admins via Telegram on New Mini App Orders
 * --------------------------------------------------------------------
 */
function notifyAdminNewOrder(array $info): void {
    $userTag = !empty($info['customer_username']) ? "@" . $info['customer_username'] : $info['customer_name'];

    $msg = "🔔 <b>NEW ORDER RECEIVED!</b>\n\n";
    $msg .= "🧾 <b>Order UUID:</b> <code>{$info['order_uuid']}</code>\n";
    $msg .= "👤 <b>Customer:</b> {$userTag} (ID: <code>{$info['customer_id']}</code>)\n";
    $msg .= "📦 <b>Item:</b> <b>{$info['product_name']}</b>\n";
    $msg .= "💰 <b>Amount:</b> <b>" . number_format((float)$info['amount'], 2) . " {$info['currency']}</b>\n";
    $msg .= "💳 <b>Channel:</b> <b>{$info['payment_channel']}</b>\n";
    $msg .= "🔑 <b>Bank Reference:</b> <code>{$info['transaction_reference']}</code>\n\n";
    $msg .= "⚡ <i>Verify receipt on your mobile banking app then tap below:</i>";

    $keyboard = [
        'inline_keyboard' => [
            [
                ['text' => '✅ Approve & Deliver', 'callback_data' => 'approve_' . $info['id']],
                ['text' => '❌ Reject', 'callback_data' => 'reject_' . $info['id']]
            ]
        ]
    ];

    foreach (ADMIN_TELEGRAM_IDS as $adminId) {
        if (!empty($adminId)) {
            sendTelegramApi('sendMessage', [
                'chat_id'      => $adminId,
                'text'         => $msg,
                'parse_mode'   => 'HTML',
                'reply_markup' => $keyboard
            ]);
        }
    }
}
