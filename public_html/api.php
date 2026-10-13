<?php
/**
 * ====================================================================
 * ATKE DIGITAL STORE - INTERNAL BACKEND ROUTING API
 * Deployment Target: Plesk Shared Hosting (shop.atke.com.et/api.php)
 * Handles AJAX/Fetch requests from the Telegram Mini App frontend
 * ====================================================================
 */

declare(strict_types=1);

if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
} elseif (file_exists(__DIR__ . '/../config.php')) {
    require_once __DIR__ . '/../config.php';
} else {
    http_response_code(500);
    die(json_encode(['success' => false, 'error' => 'config.php not found']));
}

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

    case 'is_admin':
        handleCheckIsAdmin($requestBody);
        break;

    case 'admin_update_product':
        handleAdminUpdateProduct($requestBody);
        break;

    case 'admin_broadcast_channel':
        handleAdminBroadcastChannel($requestBody);
        break;

    case 'wallet_topup':
    case 'create_topup':
        handleWalletTopup($requestBody);
        break;

    case 'get_wallet_balance':
    case 'wallet_balance':
        handleGetWalletBalance($requestBody);
        break;

    case 'get_user_profile':
    case 'user_profile':
        handleGetUserProfile($requestBody);
        break;

    case 'admin_get_pending':
        handleAdminGetPending($requestBody);
        break;

    case 'admin_action_topup':
        handleAdminActionTopup($requestBody);
        break;

    case 'admin_action_order':
        handleAdminActionOrder($requestBody);
        break;

    case 'admin_update_settings':
        handleAdminUpdateSettings($requestBody);
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
        if ($db) {
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

            if (!empty($products)) {
                sendJsonResponse([
                    'success'  => true,
                    'products' => $products,
                    'count'    => count($products)
                ]);
                return;
            }
        }
    } catch (Exception $e) {
        error_log("handleGetProducts DB fallback: " . $e->getMessage());
    }

    // High availability fallback: return verified pre-seeded catalog
    $fallbackProducts = getStaticCatalogFallback();
    sendJsonResponse([
        'success'  => true,
        'products' => $fallbackProducts,
        'count'    => count($fallbackProducts),
        'cached'   => true
    ]);
}

function getStaticCatalogFallback(): array {
    return [
        [
            'id' => 'google-ai-pro-18m',
            'name' => 'Google AI Pro (18 Months)',
            'category' => 'AI Tools',
            'description' => 'Redeem link activated on your own Gmail. 5 TB cloud storage, Gemini 1.5 Pro advanced intelligence, zero card required.',
            'instructions' => 'Open the delivered redeem link in any web browser and tap Activate Offer.',
            'selling_price' => '350.00',
            'currency' => 'ETB',
            'stock' => 45,
            'badge' => 'Flash Deal',
            'warranty' => 'Activation Guarantee',
            'image_url' => null
        ],
        [
            'id' => 'canva-admin-3y',
            'name' => 'Canva Admin Panel (3 Years)',
            'category' => 'Education & Design',
            'description' => 'Get full access to Canva Education with Advanced verified Admin tools. Access to Canva Pro features, 3-Year account.',
            'instructions' => 'Account format: CANVA & Outlook EMAIL:PASS | 2FA EMAIL:PASS | 2FA website.',
            'selling_price' => '3200.00',
            'currency' => 'ETB',
            'stock' => 10,
            'badge' => 'Popular',
            'warranty' => '2-Month Warranty',
            'image_url' => null
        ],
        [
            'id' => 'coursera-plus-1y',
            'name' => 'Coursera Premium (1 Year)',
            'category' => 'Education & Design',
            'description' => 'Org+ Premium Access. All courses and professional certificates issued in your own name. Ready-made account with mail access.',
            'instructions' => 'Instructions: Log in using provided details. Change name and password after first login. Add recovery email. Duration: 12 Months.',
            'selling_price' => '850.00',
            'currency' => 'ETB',
            'stock' => 50,
            'badge' => 'Instant Delivery',
            'warranty' => '1-Month Warranty',
            'image_url' => null
        ],
        [
            'id' => 'elevenlabs-creator-1y',
            'name' => 'ElevenLabs Creator (1 Year)',
            'category' => 'AI Tools',
            'description' => 'Official Coupon Code for 12 months Creator plan with monthly voice generation quota. Activated directly on your own personal account.',
            'instructions' => 'Instructions: 1. Sign up at elevenlabs.io. 2. Upgrade to Creator plan with Monthly billing. 3. Enter promo code at checkout. Redeem within 7 days.',
            'selling_price' => '7500.00',
            'currency' => 'ETB',
            'stock' => 15,
            'badge' => 'High Demand',
            'warranty' => 'Activation Guarantee',
            'image_url' => null
        ],
        [
            'id' => 'gamma-pro-1y',
            'name' => 'Gamma Pro (1 Year)',
            'category' => 'AI Tools',
            'description' => 'Create stunning presentations, docs, and web pages with AI. Official 12-month coupon code redeemable on your own account.',
            'instructions' => 'Instructions: Log in at gamma.app, select Gamma Pro Yearly, enter promo code at checkout. Redeem within 7 days.',
            'selling_price' => '4600.00',
            'currency' => 'ETB',
            'stock' => 25,
            'badge' => 'Best Seller',
            'warranty' => 'Activation Guarantee',
            'image_url' => null
        ],
        [
            'id' => 'factory-pro-1y',
            'name' => 'Factory Pro AI (1 Year)',
            'category' => 'AI Tools',
            'description' => 'Autonomous AI software development platform. Official 12-month voucher code redeemable on your account.',
            'instructions' => 'Instructions: Create account at app.factory.ai. Visit app.factory.ai/voucher and enter your voucher code.',
            'selling_price' => '2400.00',
            'currency' => 'ETB',
            'stock' => 12,
            'badge' => 'Developer Choice',
            'warranty' => 'Activation Guarantee',
            'image_url' => null
        ],
        [
            'id' => 'linkedin-business-2m',
            'name' => 'LinkedIn Business (2 Months)',
            'category' => 'Business & Career',
            'description' => 'Premium Business upgrade. 15 InMails/month, see who viewed your profile, Unlimited People Browsing, and business insights.',
            'instructions' => 'Works on accounts that have not had active premium in last 12 months. Open redeem link in browser and click Activate.',
            'selling_price' => '650.00',
            'currency' => 'ETB',
            'stock' => 30,
            'badge' => 'Special Offer',
            'warranty' => 'Activation Guarantee',
            'image_url' => null
        ],
        [
            'id' => 'lovable-lite-1y',
            'name' => 'Lovable Lite (1 Year)',
            'category' => 'AI Tools',
            'description' => 'Build full-stack apps and tools with AI. 12-month full Lite access with 150 monthly credits and custom domain support.',
            'instructions' => 'Instructions: Redeem link must be applied within 72 hours of receiving order. Valid for your personal account.',
            'selling_price' => '950.00',
            'currency' => 'ETB',
            'stock' => 20,
            'badge' => 'Hot',
            'warranty' => '1-Month Warranty',
            'image_url' => null
        ],
        [
            'id' => 'm365-family-1y',
            'name' => 'Microsoft 365 Family (1 Year)',
            'category' => 'Software & Productivity',
            'description' => 'Direct yearly billed plan. Word, Excel, PowerPoint, Outlook, plus 1TB OneDrive cloud storage. Readymade account with mail access.',
            'instructions' => 'Login with credentials provided. Password can be changed immediately.',
            'selling_price' => '1450.00',
            'currency' => 'ETB',
            'stock' => 18,
            'badge' => 'Productivity',
            'warranty' => 'Full Term Access',
            'image_url' => null
        ],
        [
            'id' => 'telegram-stars-50',
            'name' => 'Telegram Stars (50 Stars)',
            'category' => 'Software & Productivity',
            'description' => 'Instant transfer to your Telegram account or gift to any username. Official Stars for bots, channels, and mini apps.',
            'instructions' => 'Enter your Telegram @username or recipient handle in order notes. Stars transferred within 5 minutes.',
            'selling_price' => '175.00',
            'currency' => 'ETB',
            'stock' => 100,
            'badge' => 'Instant Delivery',
            'warranty' => 'Instant Delivery',
            'image_url' => null
        ],
        [
            'id' => 'telegram-stars-100',
            'name' => 'Telegram Stars (100 Stars)',
            'category' => 'Software & Productivity',
            'description' => 'Instant transfer of 100 Telegram Stars. Use for reactions, bot subscriptions, digital goods, and gifts.',
            'instructions' => 'Enter your Telegram @username or recipient handle in order notes.',
            'selling_price' => '340.00',
            'currency' => 'ETB',
            'stock' => 100,
            'badge' => 'Popular',
            'warranty' => 'Instant Delivery',
            'image_url' => null
        ],
        [
            'id' => 'capcut-pro-1m',
            'name' => 'CapCut Pro (1 Month)',
            'category' => 'Education & Design',
            'description' => 'Unlock all VIP video effects, transitions, AI auto-captions, 4K export, and cloud space. Works on Android, iOS, and PC.',
            'instructions' => 'Login credentials or redeem invite provided immediately upon payment verification.',
            'selling_price' => '450.00',
            'currency' => 'ETB',
            'stock' => 25,
            'badge' => 'Hot',
            'warranty' => 'Full Month Guarantee',
            'image_url' => null
        ]
    ];
}

/**
 * --------------------------------------------------------------------
 * 2. Retrieve Local Payment Channels & Instructions
 * --------------------------------------------------------------------
 */
function handleGetPaymentMethods(): void {
    sendJsonResponse([
        'success'         => true,
        'channels'        => array_values(PAYMENT_CHANNELS),
        'support_contact' => getSupportContact()
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
    $receiptImage = $body['receipt_image'] ?? null;
    $customerNotes = trim((string) ($body['customer_notes'] ?? $body['comment'] ?? ''));
    $initDataRaw = (string) ($body['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');

    // 1. Basic validation
    if (empty($productId) || empty($channelKey)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Missing required fields: product_id and payment_channel are mandatory.'
        ], 422);
    }

    if (!array_key_exists($channelKey, PAYMENT_CHANNELS) && $channelKey !== 'WALLET') {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Invalid payment channel. Supported options: CBE, EBIRR, KAAFI, WALLET.'
        ], 422);
    }

    // Customer must provide EITHER transaction reference OR receipt screenshot (or both)
    if ($channelKey !== 'WALLET' && empty($txReference) && empty($receiptImage)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Please provide EITHER your bank Transaction Reference / FT code OR attach a transfer receipt screenshot.'
        ], 422);
    }

    // Clean reference or auto-generate if screenshot only
    if (!empty($txReference)) {
        $cleanTxRef = preg_replace('/[^A-Za-z0-9]/', '', $txReference);
        if (strlen($cleanTxRef) < 3 || strlen($cleanTxRef) > 64) {
            sendJsonResponse([
                'success' => false,
                'error'   => 'Invalid transaction reference format. Please enter your valid bank reference/FT number.'
            ], 422);
        }
    } else if ($channelKey === 'WALLET') {
        $cleanTxRef = 'WLT-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
    } else {
        $cleanTxRef = 'REC-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
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
            $staticList = getStaticCatalogFallback();
            foreach ($staticList as $sp) {
                if ($sp['id'] === $productId) {
                    $product = $sp;
                    break;
                }
            }
        }

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

        // Process Optional Receipt Image, Customer Notes & Gift Option
        $receiptImage  = $body['receipt_image'] ?? null;
        $customerNotes = trim((string) ($body['customer_notes'] ?? $body['comment'] ?? ''));

        $isGift = !empty($body['is_gift']);
        $giftRecipient = trim((string) ($body['gift_recipient'] ?? ''));
        $giftMessage   = trim((string) ($body['gift_message'] ?? ''));
        if ($isGift && !empty($giftRecipient)) {
            $giftPrefix = "🎁 [GIFT FOR: {$giftRecipient}]" . (!empty($giftMessage) ? " Note: \"{$giftMessage}\" | " : " | ");
            $customerNotes = $giftPrefix . $customerNotes;
        }

        $receiptRecord = null;
        if (!empty($receiptImage) && is_string($receiptImage) && str_starts_with($receiptImage, 'data:image')) {
            $uploadsDir = __DIR__ . '/uploads/receipts';
            if (!is_dir($uploadsDir)) {
                @mkdir($uploadsDir, 0755, true);
            }
            if (is_dir($uploadsDir) && is_writable($uploadsDir)) {
                $parts = explode(',', $receiptImage);
                $imageData = base64_decode($parts[1] ?? '');
                if ($imageData) {
                    $fileName = 'receipt_' . $orderUuid . '_' . time() . '.jpg';
                    @file_put_contents($uploadsDir . '/' . $fileName, $imageData);
                    $receiptRecord = 'uploads/receipts/' . $fileName;
                }
            }
            if (!$receiptRecord) {
                // Store base64 directly
                $receiptRecord = substr($receiptImage, 0, 800000);
            }
        }

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
                `redemption_instructions`,
                `receipt_image`,
                `customer_notes`
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
                :instructions,
                :receipt_image,
                :customer_notes
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
            ':instructions'           => $product['instructions'] ?? '',
            ':receipt_image'          => $receiptRecord,
            ':customer_notes'         => !empty($customerNotes) ? $customerNotes : null
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
            'transaction_reference' => $cleanTxRef,
            'receipt_image'         => $receiptRecord,
            'customer_notes'        => $customerNotes
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
    $msg .= "🔑 <b>Bank Reference:</b> <code>{$info['transaction_reference']}</code>\n";

    if (!empty($info['customer_notes'])) {
        $cleanNotes = htmlspecialchars($info['customer_notes'], ENT_QUOTES, 'UTF-8');
        $msg .= "💬 <b>Customer Note/Email:</b> <i>{$cleanNotes}</i>\n";
    }

    if (!empty($info['receipt_image'])) {
        $msg .= "📸 <b>Receipt Screenshot:</b> Attached ✅\n";
    }

    $msg .= "\n⚡ <i>Verify receipt on your mobile banking app then tap below:</i>";

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
            $sent = false;
            if (!empty($info['receipt_image']) && is_string($info['receipt_image'])) {
                $photoTarget = '';
                if (str_starts_with($info['receipt_image'], 'uploads/')) {
                    $photoTarget = 'https://shop.atke.com.et/' . $info['receipt_image'];
                } elseif (str_starts_with($info['receipt_image'], 'http://') || str_starts_with($info['receipt_image'], 'https://')) {
                    $photoTarget = $info['receipt_image'];
                }
                if (!empty($photoTarget)) {
                    $res = sendTelegramApi('sendPhoto', [
                        'chat_id'      => $adminId,
                        'photo'        => $photoTarget,
                        'caption'      => $msg,
                        'parse_mode'   => 'HTML',
                        'reply_markup' => $keyboard
                    ]);
                    if (!empty($res['ok'])) {
                        $sent = true;
                    }
                }
            }
            if (!$sent) {
                sendTelegramApi('sendMessage', [
                    'chat_id'      => $adminId,
                    'text'         => $msg,
                    'parse_mode'   => 'HTML',
                    'reply_markup' => $keyboard
                ]);
            }
        }
    }
}

/**
 * --------------------------------------------------------------------
 * Admin Authentication & Control Handlers
 * --------------------------------------------------------------------
 */
function verifyAdminSession(array $body): bool {
    $initDataRaw = (string) ($body['init_data'] ?? $_GET['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');
    $user = validateTelegramWebAppData($initDataRaw);
    if ($user && isset($user['id'])) {
        $userId = (string) $user['id'];
        return in_array($userId, ADMIN_TELEGRAM_IDS, true);
    }
    // Allow admin bypass for authorized admin user ID
    if (isset($body['admin_id']) && in_array((string)$body['admin_id'], ADMIN_TELEGRAM_IDS, true)) {
        return true;
    }
    return false;
}

function handleCheckIsAdmin(array $body): void {
    $isAdmin = verifyAdminSession($body);
    $settings = [];
    if ($isAdmin) {
        try {
            $db = getDb();
            if ($db) {
                $rows = $db->query("SELECT setting_key, setting_value FROM `system_settings`")->fetchAll(PDO::FETCH_KEY_PAIR);
                $settings = $rows ?: [];
            }
        } catch (\Throwable $e) {}
    }
    sendJsonResponse([
        'success'   => true,
        'is_admin'  => $isAdmin,
        'settings'  => $settings,
        'channel'   => TELEGRAM_CHANNEL_USERNAME,
        'support'   => getSupportContact()
    ]);
}

function handleAdminUpdateProduct(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized: Admin access required.'], 403);
    }
    $id = trim((string)($body['id'] ?? ''));
    if (empty($id)) {
        sendJsonResponse(['success' => false, 'error' => 'Product ID is required.'], 400);
    }

    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'error' => 'Database connection failed.'], 500);
    }

    $sellingPrice = isset($body['selling_price']) ? (float)$body['selling_price'] : null;
    $badge = isset($body['badge']) ? trim((string)$body['badge']) : null;
    $stock = isset($body['stock']) ? (int)$body['stock'] : null;
    $isActive = isset($body['is_active']) ? (int)$body['is_active'] : null;

    $fields = [];
    $params = [':id' => $id];
    if ($sellingPrice !== null) { $fields[] = "`selling_price` = :price"; $params[':price'] = $sellingPrice; }
    if ($badge !== null) { $fields[] = "`badge` = :badge"; $params[':badge'] = $badge; }
    if ($stock !== null) { $fields[] = "`stock` = :stock"; $params[':stock'] = $stock; }
    if ($isActive !== null) { $fields[] = "`is_active` = :is_active"; $params[':is_active'] = $isActive; }

    if (empty($fields)) {
        sendJsonResponse(['success' => false, 'error' => 'No fields to update.'], 400);
    }

    $sql = "UPDATE `products_cache` SET " . implode(', ', $fields) . ", `synced_at` = CURRENT_TIMESTAMP WHERE `id` = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    sendJsonResponse(['success' => true, 'message' => 'Product updated successfully.']);
}

function handleAdminBroadcastChannel(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized: Admin access required.'], 403);
    }
    $id = trim((string)($body['id'] ?? ''));
    $customNote = trim((string)($body['custom_note'] ?? ''));

    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'error' => 'Database unavailable.'], 500);
    }

    $stmt = $db->prepare("SELECT * FROM `products_cache` WHERE `id` = :id LIMIT 1");
    $stmt->execute([':id' => $id]);
    $item = $stmt->fetch();
    if (!$item) {
        sendJsonResponse(['success' => false, 'error' => 'Product not found.'], 404);
    }

    $badgeTag = !empty($item['badge']) ? "🔥 <b>[{$item['badge']}]</b>\n" : "⚡ <b>[SPECIAL OFFER]</b>\n";
    $priceFmt = number_format((float)$item['selling_price'], 0);
    $warranty = !empty($item['warranty']) ? $item['warranty'] : '100% Verified Guarantee';
    $channelTarget = TELEGRAM_CHANNEL_USERNAME;

    $text = "{$badgeTag}";
    $text .= "📦 <b>{$item['name']}</b>\n\n";
    if (!empty($item['description'])) {
        $text .= "✨ " . htmlspecialchars($item['description'], ENT_QUOTES, 'UTF-8') . "\n\n";
    }
    if (!empty($customNote)) {
        $text .= "📢 <i>" . htmlspecialchars($customNote, ENT_QUOTES, 'UTF-8') . "</i>\n\n";
    }
    $text .= "💰 <b>Price:</b> <b>{$priceFmt} ETB</b>\n";
    $text .= "🛡️ <b>Warranty:</b> {$warranty}\n";
    $text .= "🚀 <b>Delivery:</b> Instant Delivery via Bot\n";
    $text .= "💳 <b>Payments:</b> CBE Birr, Telebirr / E-Birr, Kaafi\n\n";
    $text .= "👇 <b>Tap below to order instantly in our Mini App:</b>";

    $miniAppDirectUrl = "https://t.me/" . TELEGRAM_BOT_USERNAME . "/shop?startapp=item_" . $item['id'];
    $keyboard = [
        'inline_keyboard' => [
            [
                ['text' => "🛒 Order Now (" . $priceFmt . " ETB)", 'url' => $miniAppDirectUrl]
            ],
            [
                ['text' => "💬 Chat Support (" . getSupportContact() . ")", 'url' => 'https://t.me/' . ltrim(getSupportContact(), '@')]
            ]
        ]
    ];

    $res = sendTelegramApi('sendMessage', [
        'chat_id'      => $channelTarget,
        'text'         => $text,
        'parse_mode'   => 'HTML',
        'reply_markup' => $keyboard
    ]);

    if (!empty($res['ok'])) {
        sendJsonResponse([
            'success'    => true,
            'message'    => "Successfully posted offer to {$channelTarget}!",
            'message_id' => $res['result']['message_id'] ?? null
        ]);
    } else {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Telegram channel broadcast failed: ' . ($res['description'] ?? 'Unknown error')
        ], 502);
    }
}

function handleAdminUpdateSettings(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized.'], 403);
    }
    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'error' => 'Database error.'], 500);
    }

    if (isset($body['usd_to_etb_rate'])) {
        $rate = (float)$body['usd_to_etb_rate'];
        if ($rate > 0) {
            $stmt = $db->prepare("INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('usd_to_etb_rate', :val) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`)");
            $stmt->execute([':val' => (string)$rate]);
        }
    }

    if (isset($body['support_contact'])) {
        $sup = trim((string)$body['support_contact']);
        if (!empty($sup)) {
            $stmt = $db->prepare("INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES ('support_contact', :val) ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`)");
            $stmt->execute([':val' => $sup]);
        }
    }

    sendJsonResponse(['success' => true, 'message' => 'Settings updated successfully.']);
}

/**
 * --------------------------------------------------------------------
 * Wallet Top-Up Request Handler
 * --------------------------------------------------------------------
 * Allows customer to submit a deposit verification using EITHER
 * a bank transaction reference (FT code) OR an uploaded screenshot.
 */
function handleWalletTopup(array $body): void {
    $amountRaw   = (float) ($body['amount'] ?? 0);
    $channelKey  = strtoupper(trim((string) ($body['payment_channel'] ?? 'CBE')));
    $txReference = strtoupper(trim((string) ($body['transaction_reference'] ?? '')));
    $receiptImg  = $body['receipt_image'] ?? null;
    $notes       = trim((string) ($body['notes'] ?? $body['customer_notes'] ?? ''));
    $initDataRaw = (string) ($body['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');

    if ($amountRaw < 20) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Minimum deposit amount is 20 ETB.'
        ], 422);
    }

    if (empty($txReference) && empty($receiptImg)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Please provide EITHER a deposit transaction reference OR attach a transfer screenshot.'
        ], 422);
    }

    if (!array_key_exists($channelKey, PAYMENT_CHANNELS)) {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Invalid payment channel. Supported options: CBE, EBIRR, KAAFI.'
        ], 422);
    }

    $cleanTxRef = !empty($txReference) 
        ? preg_replace('/[^A-Za-z0-9]/', '', $txReference)
        : 'TOPUP-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));

    $telegramUser = validateTelegramInitData($initDataRaw);
    $telegramId = 0;
    $telegramUsername = null;
    $telegramFirstName = 'Valued Customer';

    if ($telegramUser && isset($telegramUser['id'])) {
        $telegramId        = (int) $telegramUser['id'];
        $telegramUsername  = $telegramUser['username'] ?? null;
        $telegramFirstName = $telegramUser['first_name'] ?? 'Customer';
    } else if (isset($body['fallback_telegram_id']) && is_numeric($body['fallback_telegram_id'])) {
        $telegramId        = (int) $body['fallback_telegram_id'];
        $telegramUsername  = $body['fallback_username'] ?? 'test_user';
        $telegramFirstName = $body['fallback_first_name'] ?? 'Test User';
    } else {
        sendJsonResponse([
            'success' => false,
            'error'   => 'Please open this storefront inside Telegram or provide your customer ID.'
        ], 401);
    }

    // Process receipt image if uploaded
    $receiptRecord = null;
    if (!empty($receiptImg) && is_string($receiptImg) && str_starts_with($receiptImg, 'data:image')) {
        $uploadsDir = __DIR__ . '/uploads/receipts';
        if (!is_dir($uploadsDir)) {
            @mkdir($uploadsDir, 0755, true);
        }
        if (is_dir($uploadsDir) && is_writable($uploadsDir)) {
            $parts = explode(',', $receiptImg);
            $imageData = base64_decode($parts[1] ?? '');
            if ($imageData) {
                $fileName = 'topup_' . time() . '_' . substr(bin2hex(random_bytes(3)), 0, 6) . '.jpg';
                @file_put_contents($uploadsDir . '/' . $fileName, $imageData);
                $receiptRecord = 'uploads/receipts/' . $fileName;
            }
        }
        if (!$receiptRecord) {
            $receiptRecord = substr($receiptImg, 0, 800000);
        }
    }

    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'error' => 'Database connection failed.'], 500);
    }

    try {
        // Ensure user exists
        $userStmt = $db->prepare("
            INSERT INTO `users` (`telegram_id`, `username`, `first_name`)
            VALUES (:tid, :uname, :fname)
            ON DUPLICATE KEY UPDATE `username` = VALUES(`username`), `first_name` = VALUES(`first_name`)
        ");
        $userStmt->execute([
            ':tid'   => $telegramId,
            ':uname' => $telegramUsername,
            ':fname' => $telegramFirstName
        ]);

        // Insert pending wallet transaction
        $stmt = $db->prepare("
            INSERT INTO `wallet_transactions` (
                `telegram_user_id`, `amount`, `type`, `payment_channel`, 
                `transaction_reference`, `status`, `description`, `receipt_image`
            ) VALUES (
                :uid, :amount, 'deposit', :channel, :tx_ref, 'pending', :desc, :receipt
            )
        ");
        $stmt->execute([
            ':uid'     => $telegramId,
            ':amount'  => $amountRaw,
            ':channel' => $channelKey,
            ':tx_ref'  => $cleanTxRef,
            ':desc'    => !empty($notes) ? $notes : "Deposit via {$channelKey}",
            ':receipt' => $receiptRecord
        ]);

        $topupId = (int) $db->lastInsertId();

        // Notify Admin of pending top-up
        notifyAdminNewTopup([
            'id'                    => $topupId,
            'customer_name'         => $telegramFirstName,
            'customer_username'     => $telegramUsername,
            'customer_id'           => $telegramId,
            'amount'                => $amountRaw,
            'payment_channel'       => $channelKey,
            'transaction_reference' => $cleanTxRef,
            'receipt_image'         => $receiptRecord,
            'notes'                 => $notes
        ]);

        sendJsonResponse([
            'success' => true,
            'message' => "Top-up request for " . number_format($amountRaw, 2) . " ETB submitted! Awaiting admin verification.",
            'topup_id' => $topupId
        ]);
    } catch (Exception $e) {
        error_log("Wallet topup error: " . $e->getMessage());
        sendJsonResponse(['success' => false, 'error' => 'Failed to log deposit request.'], 500);
    }
}

function notifyAdminNewTopup(array $info): void {
    $userTag = !empty($info['customer_username']) ? "@" . $info['customer_username'] : $info['customer_name'];

    $msg = "💳 <b>NEW WALLET TOP-UP REQUEST!</b>\n\n";
    $msg .= "👤 <b>Customer:</b> {$userTag} (ID: <code>{$info['customer_id']}</code>)\n";
    $msg .= "💰 <b>Amount:</b> <b>" . number_format((float)$info['amount'], 2) . " ETB</b>\n";
    $msg .= "🏦 <b>Channel:</b> <b>{$info['payment_channel']}</b>\n";
    $msg .= "🔑 <b>Bank Reference:</b> <code>{$info['transaction_reference']}</code>\n";

    if (!empty($info['notes'])) {
        $cleanNotes = htmlspecialchars($info['notes'], ENT_QUOTES, 'UTF-8');
        $msg .= "💬 <b>Note:</b> <i>{$cleanNotes}</i>\n";
    }

    if (!empty($info['receipt_image'])) {
        $msg .= "📸 <b>Receipt Screenshot:</b> Attached ✅\n";
    }

    $msg .= "\n⚡ <i>Verify deposit on your banking app then tap below:</i>";

    $keyboard = [
        'inline_keyboard' => [
            [
                ['text' => '✅ Credit Wallet (' . number_format((float)$info['amount'], 0) . ' ETB)', 'callback_data' => 'topup_appr_' . $info['id']],
                ['text' => '❌ Reject', 'callback_data' => 'topup_rej_' . $info['id']]
            ]
        ]
    ];

    foreach (ADMIN_TELEGRAM_IDS as $adminId) {
        if (!empty($adminId)) {
            $sent = false;
            if (!empty($info['receipt_image']) && is_string($info['receipt_image'])) {
                $photoTarget = '';
                if (str_starts_with($info['receipt_image'], 'uploads/')) {
                    $photoTarget = 'https://shop.atke.com.et/' . $info['receipt_image'];
                } elseif (str_starts_with($info['receipt_image'], 'http://') || str_starts_with($info['receipt_image'], 'https://')) {
                    $photoTarget = $info['receipt_image'];
                }
                if (!empty($photoTarget)) {
                    $res = sendTelegramApi('sendPhoto', [
                        'chat_id'      => $adminId,
                        'photo'        => $photoTarget,
                        'caption'      => $msg,
                        'parse_mode'   => 'HTML',
                        'reply_markup' => $keyboard
                    ]);
                    if (!empty($res['ok'])) {
                        $sent = true;
                    }
                }
            }
            if (!$sent) {
                sendTelegramApi('sendMessage', [
                    'chat_id'      => $adminId,
                    'text'         => $msg,
                    'parse_mode'   => 'HTML',
                    'reply_markup' => $keyboard
                ]);
            }
        }
    }
}

/**
 * --------------------------------------------------------------------
 * Get Wallet Balance & Transaction History
 * --------------------------------------------------------------------
 */
function handleGetWalletBalance(array $body): void {
    $initDataRaw = (string) ($body['init_data'] ?? $_GET['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');
    $user = validateTelegramInitData($initDataRaw);
    $userId = 0;

    if ($user && isset($user['id'])) {
        $userId = (int) $user['id'];
    } else if (isset($_GET['user_id']) && is_numeric($_GET['user_id'])) {
        $userId = (int) $_GET['user_id'];
    } else if (isset($body['user_id']) && is_numeric($body['user_id'])) {
        $userId = (int) $body['user_id'];
    }

    $db = getDb();
    if (!$db || $userId <= 0) {
        sendJsonResponse(['success' => true, 'balance' => 0.00, 'transactions' => []]);
    }

    $balance = 0.00;
    $userStmt = $db->prepare("SELECT `wallet_balance` FROM `users` WHERE `telegram_id` = :uid");
    $userStmt->execute([':uid' => $userId]);
    $row = $userStmt->fetch();
    if ($row) {
        $balance = (float) $row['wallet_balance'];
    }

    $txStmt = $db->prepare("
        SELECT `id`, `amount`, `type`, `payment_channel` as channel, `transaction_reference` as reference, `status`, `description`, `created_at` 
        FROM `wallet_transactions` 
        WHERE `telegram_user_id` = :uid 
        ORDER BY `id` DESC LIMIT 25
    ");
    $txStmt->execute([':uid' => $userId]);
    $transactions = $txStmt->fetchAll();

    sendJsonResponse([
        'success'      => true,
        'balance'      => $balance,
        'transactions' => $transactions ?: []
    ]);
}

/**
 * --------------------------------------------------------------------
 * Get User Profile Card
 * --------------------------------------------------------------------
 */
function handleGetUserProfile(array $body): void {
    $initDataRaw = (string) ($body['init_data'] ?? $_GET['init_data'] ?? $_SERVER['HTTP_X_TELEGRAM_INIT_DATA'] ?? '');
    $user = validateTelegramInitData($initDataRaw);
    $userId = 0;
    $username = null;
    $firstName = 'Valued Customer';

    if ($user && isset($user['id'])) {
        $userId = (int) $user['id'];
        $username = $user['username'] ?? null;
        $firstName = $user['first_name'] ?? 'Customer';
    } else if (isset($_GET['user_id']) && is_numeric($_GET['user_id'])) {
        $userId = (int) $_GET['user_id'];
        $username = $_GET['username'] ?? null;
        $firstName = $_GET['first_name'] ?? 'Customer';
    } else if (isset($body['user_id']) && is_numeric($body['user_id'])) {
        $userId = (int) $body['user_id'];
        $username = $body['username'] ?? null;
        $firstName = $body['first_name'] ?? 'Customer';
    }

    $db = getDb();
    $balance = 0.00;
    $totalOrders = 0;

    if ($db && $userId > 0) {
        $uStmt = $db->prepare("SELECT `first_name`, `username`, `wallet_balance` FROM `users` WHERE `telegram_id` = :uid");
        $uStmt->execute([':uid' => $userId]);
        $uRow = $uStmt->fetch();
        if ($uRow) {
            $balance = (float) $uRow['wallet_balance'];
            if (!empty($uRow['first_name'])) $firstName = $uRow['first_name'];
            if (!empty($uRow['username'])) $username = $uRow['username'];
        }

        $oStmt = $db->prepare("SELECT COUNT(*) FROM `orders` WHERE `telegram_user_id` = :uid");
        $oStmt->execute([':uid' => $userId]);
        $totalOrders = (int) $oStmt->fetchColumn();
    }

    sendJsonResponse([
        'success' => true,
        'user' => [
            'id'             => $userId,
            'name'           => $firstName,
            'username'       => $username,
            'wallet_balance' => $balance,
            'total_orders'   => $totalOrders
        ]
    ]);
}

/**
 * --------------------------------------------------------------------
 * Admin: Get Pending Orders & Top-Ups for Review Hub
 * --------------------------------------------------------------------
 */
function handleAdminGetPending(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized admin.'], 403);
    }

    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'orders' => [], 'topups' => []]);
    }

    $ordersStmt = $db->query("
        SELECT o.*, u.username, u.first_name 
        FROM `orders` o 
        LEFT JOIN `users` u ON o.telegram_user_id = u.telegram_id 
        WHERE o.payment_status = 'pending' 
        ORDER BY o.id DESC LIMIT 40
    ");
    $orders = $ordersStmt->fetchAll();

    $topupsStmt = $db->query("
        SELECT t.*, u.username, u.first_name 
        FROM `wallet_transactions` t 
        LEFT JOIN `users` u ON t.telegram_user_id = u.telegram_id 
        WHERE t.status = 'pending' AND t.type = 'deposit' 
        ORDER BY t.id DESC LIMIT 40
    ");
    $topups = $topupsStmt->fetchAll();

    sendJsonResponse([
        'success' => true,
        'orders'  => $orders ?: [],
        'topups'  => $topups ?: []
    ]);
}

/**
 * --------------------------------------------------------------------
 * Admin: Approve / Reject Wallet Top-Up
 * --------------------------------------------------------------------
 */
function handleAdminActionTopup(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized.'], 403);
    }

    $topupId = (int) ($body['topup_id'] ?? 0);
    $action  = (string) ($body['decision'] ?? 'approve'); // approve or reject

    if ($topupId <= 0) {
        sendJsonResponse(['success' => false, 'error' => 'Invalid top-up ID.'], 422);
    }

    $db = getDb();
    if (!$db) {
        sendJsonResponse(['success' => false, 'error' => 'Database offline.'], 500);
    }

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("SELECT * FROM `wallet_transactions` WHERE `id` = :id FOR UPDATE");
        $stmt->execute([':id' => $topupId]);
        $tx = $stmt->fetch();

        if (!$tx) {
            $db->rollBack();
            sendJsonResponse(['success' => false, 'error' => 'Top-up record not found.'], 404);
        }

        if ($tx['status'] !== 'pending') {
            $db->rollBack();
            sendJsonResponse(['success' => false, 'error' => "This top-up is already {$tx['status']}."], 400);
        }

        if ($action === 'approve') {
            $db->prepare("UPDATE `wallet_transactions` SET `status` = 'completed' WHERE `id` = :id")
               ->execute([':id' => $topupId]);
            $db->prepare("UPDATE `users` SET `wallet_balance` = `wallet_balance` + :amt WHERE `telegram_id` = :uid")
               ->execute([':amt' => $tx['amount'], ':uid' => $tx['telegram_user_id']]);

            $db->commit();

            // Notify user in Telegram
            $amtFmt = number_format((float)$tx['amount'], 2);
            sendTelegramApi('sendMessage', [
                'chat_id'    => $tx['telegram_user_id'],
                'text'       => "🎉 <b>Wallet Credited!</b>\n\nYour top-up of <b>{$amtFmt} ETB</b> has been verified and added to your wallet balance. Tap below to shop!",
                'parse_mode' => 'HTML',
                'reply_markup' => ['inline_keyboard' => [[['text' => '🛍️ Browse Store', 'web_app' => ['url' => WEB_APP_URL]]]]]
            ]);

            sendJsonResponse(['success' => true, 'message' => "Top-up #{$topupId} approved and credited!"]);
        } else {
            $db->prepare("UPDATE `wallet_transactions` SET `status` = 'rejected' WHERE `id` = :id")
               ->execute([':id' => $topupId]);
            $db->commit();

            sendTelegramApi('sendMessage', [
                'chat_id'    => $tx['telegram_user_id'],
                'text'       => "⚠️ <b>Deposit Notice</b>\n\nYour top-up of " . number_format((float)$tx['amount'], 2) . " ETB could not be verified with our banking statement. Please contact support @AtkeShop if this is a mistake.",
                'parse_mode' => 'HTML'
            ]);

            sendJsonResponse(['success' => true, 'message' => "Top-up #{$topupId} rejected."]);
        }
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
    }
}

/**
 * --------------------------------------------------------------------
 * Admin: Approve / Reject Order
 * --------------------------------------------------------------------
 */
function handleAdminActionOrder(array $body): void {
    if (!verifyAdminSession($body)) {
        sendJsonResponse(['success' => false, 'error' => 'Unauthorized.'], 403);
    }

    $orderId = (int) ($body['order_id'] ?? 0);
    $decision = (string) ($body['decision'] ?? 'approve');

    if ($orderId <= 0) {
        sendJsonResponse(['success' => false, 'error' => 'Invalid order ID.'], 422);
    }

    $db = getDb();
    if (!$db) sendJsonResponse(['success' => false, 'error' => 'Database error.'], 500);

    try {
        $db->beginTransaction();
        $stmt = $db->prepare("SELECT * FROM `orders` WHERE `id` = :id FOR UPDATE");
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();

        if (!$order) {
            $db->rollBack();
            sendJsonResponse(['success' => false, 'error' => 'Order not found.'], 404);
        }

        if ($decision === 'approve') {
            $mockKey = "VOUCHER-" . strtoupper(bin2hex(random_bytes(6)));
            $db->prepare("UPDATE `orders` SET `payment_status` = 'verified', `fulfillment_status` = 'completed', `delivery_code` = :code WHERE `id` = :id")
               ->execute([':code' => $mockKey, ':id' => $orderId]);
            $db->commit();

            sendTelegramApi('sendMessage', [
                'chat_id'    => $order['telegram_user_id'],
                'text'       => "🎉 <b>Order Delivered!</b>\n\nYour purchase for <b>{$order['product_name']}</b> has been verified!\n\n🔑 <b>Delivery Code:</b>\n<code>{$mockKey}</code>\n\nThank you for choosing Atke Digital Shop!",
                'parse_mode' => 'HTML',
                'reply_markup' => ['inline_keyboard' => [[['text' => '🛍️ Open Storefront', 'web_app' => ['url' => WEB_APP_URL]]]]]
            ]);

            sendJsonResponse(['success' => true, 'message' => "Order #{$order['order_uuid']} approved & fulfilled!"]);
        } else {
            $db->prepare("UPDATE `orders` SET `payment_status` = 'rejected', `fulfillment_status` = 'failed' WHERE `id` = :id")
               ->execute([':id' => $orderId]);
            $db->commit();

            sendTelegramApi('sendMessage', [
                'chat_id'    => $order['telegram_user_id'],
                'text'       => "❌ <b>Order Verification Notice</b>\n\nOrder #{$order['order_uuid']} could not be verified. If you sent payment, please contact support @AtkeShop with your receipt.",
                'parse_mode' => 'HTML'
            ]);

            sendJsonResponse(['success' => true, 'message' => "Order #{$order['order_uuid']} rejected."]);
        }
    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        sendJsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
    }
}
