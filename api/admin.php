<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// 1. Authenticate user via Telegram initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];

// 2. Strict Role-Based Authorization Check (Super Admin / Staff)
$db = getDb(false);
$userRole = getUserRole($telegramId, $db);

if ($userRole === 'customer') {
    jsonResponse([
        'error' => 'Unauthorized. Admin or staff privileges required.',
        'code'  => 403
    ], 403);
}

$isOwner = ($userRole === 'admin');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Parse JSON body for POST/PUT requests
$payload = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $payload = json_decode($raw, true) ?? [];
    }
    if (empty($action) && isset($payload['action'])) {
        $action = $payload['action'];
    }
}

// ==========================================================
// 1. ACTION: stats (Live Store Performance Dashboard)
// ==========================================================
if ($action === 'stats') {
    if ($db === null) {
        jsonResponse([
            'status' => 'success',
            'stats'  => [
                'users_count'      => 1,
                'orders_count'     => 0,
                'total_revenue'    => 0.00,
                'pending_deposits' => 0,
                'pending_amount'   => 0.00,
                'available_keys'   => 0,
                'delivered_keys'   => 0,
                'active_products'  => 6,
            ]
        ]);
    }
    try {
        // Total registered users
        $usersCount = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();

        // Total orders, gross revenue & net profit
        $orderStats = $db->query("
            SELECT 
                COUNT(*) AS total_orders, 
                COALESCE(SUM(price_paid), 0) AS total_revenue,
                COALESCE(SUM(cost_price), 0) AS total_cost,
                COALESCE(SUM(profit), 0) AS total_profit
            FROM orders
        ")->fetch();

        // Pending deposits count & total pending ETB
        $depStats = $db->query("
            SELECT COUNT(*) AS pending_count, COALESCE(SUM(amount), 0) AS pending_amount 
            FROM deposits WHERE status = 'pending'
        ")->fetch();

        // Total unsold stock keys across all products
        $stockStats = $db->query("
            SELECT 
                COUNT(CASE WHEN is_sold = 0 THEN 1 END) AS available_keys,
                COUNT(CASE WHEN is_sold = 1 THEN 1 END) AS delivered_keys
            FROM product_vault
        ")->fetch();

        // Total active products
        $prodCount = (int)$db->query("SELECT COUNT(*) FROM products WHERE is_active = 1")->fetchColumn();

        $gross = (float)($orderStats['total_revenue'] ?? 0.00);
        $profit = (float)($orderStats['total_profit'] ?? 0.00);
        $margin = $gross > 0 ? round(($profit / $gross) * 100, 1) : 0.0;

        jsonResponse([
            'status' => 'success',
            'stats'  => [
                'users_count'      => $usersCount,
                'orders_count'     => (int)($orderStats['total_orders'] ?? 0),
                'total_revenue'    => $isOwner ? $gross : 0.00,
                'total_cost'       => $isOwner ? (float)($orderStats['total_cost'] ?? 0.00) : 0.00,
                'total_profit'     => $isOwner ? $profit : 0.00,
                'profit_margin'    => $isOwner ? $margin : 0.0,
                'pending_deposits' => (int)($depStats['pending_count'] ?? 0),
                'pending_amount'   => (float)($depStats['pending_amount'] ?? 0.00),
                'available_keys'   => (int)($stockStats['available_keys'] ?? 0),
                'delivered_keys'   => (int)($stockStats['delivered_keys'] ?? 0),
                'active_products'  => $prodCount,
                'is_owner'         => $isOwner,
            ]
        ]);
    } catch (Exception $e) {
        error_log('Admin Stats Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to calculate stats.'], 500);
    }
}

// ==========================================================
// 2. ACTION: products (Manage Product Catalog & Stock)
// ==========================================================
if ($action === 'products') {
    if ($db === null) {
        jsonResponse([
            'status' => 'success',
            'products' => [
                [
                    'id' => 1,
                    'name' => 'Gemini AI Pro 18m',
                    'category' => 'AI Tools',
                    'price_etb' => 385.00,
                    'description' => 'Full Gemini Advanced access with 5TB storage.',
                    'how_to_use' => "⚡ 18 Months Plan\n⚡ 5TB cloud storage included\n⚡ You can add 5 users",
                    'icon_url' => 'https://img.icons8.com/color/480/google-gemini.png',
                    'badge' => 'POPULAR',
                    'is_active' => 1,
                    'unsold_keys' => 2,
                    'sold_keys' => 0
                ]
            ]
        ]);
    }
    try {
        $stmt = $db->query("
            SELECT 
                p.id,
                p.name,
                p.category,
                p.price_etb,
                p.description,
                p.how_to_use,
                p.icon_url,
                p.badge,
                p.is_active,
                p.created_at,
                COUNT(CASE WHEN v.is_sold = 0 THEN 1 END) AS unsold_keys,
                COUNT(CASE WHEN v.is_sold = 1 THEN 1 END) AS sold_keys
            FROM products p
            LEFT JOIN product_vault v ON p.id = v.product_id
            GROUP BY p.id, p.name, p.category, p.price_etb, p.description, p.how_to_use, p.icon_url, p.badge, p.is_active, p.created_at
            ORDER BY p.id ASC
        ");
        $products = $stmt->fetchAll();

        foreach ($products as &$p) {
            $p['id']          = (int)$p['id'];
            $p['price_etb']   = (float)$p['price_etb'];
            $p['is_active']   = (int)$p['is_active'];
            $p['unsold_keys'] = (int)$p['unsold_keys'];
            $p['sold_keys']   = (int)$p['sold_keys'];
        }
        unset($p);

        jsonResponse([
            'status'   => 'success',
            'products' => $products
        ]);
    } catch (Exception $e) {
        error_log('Admin Products Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to fetch admin product list.'], 500);
    }
}

// ==========================================================
// 3. ACTION: save_product (Create or Edit Product)
// ==========================================================
if ($action === 'save_product' && $method === 'POST') {
    $id = isset($payload['id']) ? (int)$payload['id'] : 0;
    $name = trim((string)($payload['name'] ?? ''));
    $category = trim((string)($payload['category'] ?? 'Services'));
    $price = isset($payload['price_etb']) ? (float)$payload['price_etb'] : 0.00;
    $costPrice = isset($payload['cost_price_etb']) ? (float)$payload['cost_price_etb'] : 0.00;
    $variantsJson = !empty($payload['variants_json']) ? (string)$payload['variants_json'] : null;
    $description = trim((string)($payload['description'] ?? ''));
    $howToUse = trim((string)($payload['how_to_use'] ?? ''));
    $iconUrl = trim((string)($payload['icon_url'] ?? ''));
    $badge = trim((string)($payload['badge'] ?? ''));
    $badge = $badge === '' ? null : $badge;
    $isActive = isset($payload['is_active']) ? (int)$payload['is_active'] : 1;
    $broadcast = !empty($payload['broadcast_to_channel']);

    if (empty($name)) {
        jsonResponse(['error' => 'Product title/name is required.'], 400);
    }
    if ($price <= 0) {
        jsonResponse(['error' => 'Price must be greater than 0 ETB.'], 400);
    }

    try {
        $savedId = $id;
        if ($id > 0) {
            // Update existing product
            $stmt = $db->prepare("
                UPDATE products 
                SET name = ?, category = ?, price_etb = ?, cost_price_etb = ?, variants_json = ?, description = ?, how_to_use = ?, icon_url = ?, badge = ?, is_active = ?
                WHERE id = ?
            ");
            $stmt->execute([$name, $category, $price, $costPrice, $variantsJson, $description, $howToUse, $iconUrl, $badge, $isActive, $id]);
            $msg = 'Product updated successfully!';
        } else {
            // Insert new product
            $stmt = $db->prepare("
                INSERT INTO products (name, category, price_etb, cost_price_etb, variants_json, description, how_to_use, icon_url, badge, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$name, $category, $price, $costPrice, $variantsJson, $description, $howToUse, $iconUrl, $badge, $isActive]);
            $savedId = (int)$db->lastInsertId();
            $msg = 'New product created successfully!';
        }

        // Automatic Marketing Broadcast to Telegram Channel/Group
        $broadcastResult = null;
        if ($broadcast && $isActive === 1 && !empty(MARKETING_CHANNEL_ID)) {
            $channelMsg = "🔥 <b>NEW PRODUCT AVAILABLE IN STORE!</b>\n\n"
                . "📦 <b>" . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . "</b>\n"
                . "💰 <b>Price:</b> <b>" . number_format($price, 2) . " ETB</b>\n"
                . "🏷️ <b>Category:</b> " . htmlspecialchars($category, ENT_QUOTES, 'UTF-8') . "\n\n"
                . (!empty($description) ? "📝 <i>" . htmlspecialchars($description, ENT_QUOTES, 'UTF-8') . "</i>\n\n" : "")
                . "⚡ <b>Instant Bot Delivery & Zero Fees!</b>\n\n"
                . "👇 Tap the button below to buy instantly in our Mini App:";

            $productAppUrl = rtrim(APP_URL, '/') . '/public/index.html';
            $channelMarkup = [
                'inline_keyboard' => [
                    [
                        ['text' => '🛍️ Buy Now in Mini App', 'web_app' => ['url' => $productAppUrl]]
                    ]
                ]
            ];

            $broadcastResult = broadcastToChannel($channelMsg, !empty($iconUrl) ? $iconUrl : null, $channelMarkup);
            if (!empty($broadcastResult['ok'])) {
                $msg .= ' 📢 Broadcasted to channel!';
            }
        }

        jsonResponse([
            'status'           => 'success',
            'message'          => $msg,
            'id'               => $savedId,
            'broadcast_result' => $broadcastResult
        ]);
    } catch (Exception $e) {
        error_log('Admin Save Product Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Database error while saving product.'], 500);
    }
}

// ==========================================================
// 4. ACTION: toggle_product (Enable / Disable Product)
// ==========================================================
if ($action === 'toggle_product' && $method === 'POST') {
    $id = (int)($payload['id'] ?? 0);
    if ($id <= 0) {
        jsonResponse(['error' => 'Invalid product ID.'], 400);
    }

    try {
        $stmt = $db->prepare("UPDATE products SET is_active = IF(is_active = 1, 0, 1) WHERE id = ?");
        $stmt->execute([$id]);

        $statusStmt = $db->prepare("SELECT is_active FROM products WHERE id = ?");
        $statusStmt->execute([$id]);
        $newStatus = (int)$statusStmt->fetchColumn();

        jsonResponse([
            'status'    => 'success',
            'is_active' => $newStatus,
            'message'   => $newStatus === 1 ? 'Product activated.' : 'Product hidden from catalog.'
        ]);
    } catch (Exception $e) {
        error_log('Admin Toggle Product Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to toggle product status.'], 500);
    }
}

// ==========================================================
// 5. ACTION: add_keys (Bulk Upload Digital Stock into Vault)
// ==========================================================
if ($action === 'add_keys' && $method === 'POST') {
    $productId = (int)($payload['product_id'] ?? 0);
    $rawKeys = trim((string)($payload['keys'] ?? ''));

    if ($productId <= 0) {
        jsonResponse(['error' => 'Please select a valid product.'], 400);
    }

    // Check product exists
    $chk = $db->prepare("SELECT id, name FROM products WHERE id = ?");
    $chk->execute([$productId]);
    $prod = $chk->fetch();
    if (!$prod) {
        jsonResponse(['error' => 'Product not found.'], 404);
    }

    if (empty($rawKeys)) {
        jsonResponse(['error' => 'Please enter at least one key, account, or voucher link.'], 400);
    }

    // Split lines
    $lines = preg_split("/\r\n|\n|\r/", $rawKeys);
    $cleanKeys = [];
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed !== '') {
            $cleanKeys[] = $trimmed;
        }
    }

    if (empty($cleanKeys)) {
        jsonResponse(['error' => 'No non-empty keys found.'], 400);
    }

    try {
        $db->beginTransaction();
        $ins = $db->prepare("
            INSERT INTO product_vault (product_id, item_payload, is_sold, created_at)
            VALUES (?, ?, 0, NOW())
        ");

        $insertedCount = 0;
        foreach ($cleanKeys as $keyItem) {
            $ins->execute([$productId, $keyItem]);
            $insertedCount++;
        }

        $db->commit();

        // Get updated unsold count
        $cntStmt = $db->prepare("SELECT COUNT(*) FROM product_vault WHERE product_id = ? AND is_sold = 0");
        $cntStmt->execute([$productId]);
        $unsoldCount = (int)$cntStmt->fetchColumn();

        jsonResponse([
            'status'         => 'success',
            'message'        => "Successfully added {$insertedCount} key(s) to {$prod['name']}!",
            'added_count'    => $insertedCount,
            'unsold_count'   => $unsoldCount,
            'product_name'   => $prod['name']
        ]);
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Admin Add Keys Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to add vault keys.'], 500);
    }
}

// ==========================================================
// 6. ACTION: vault_keys (Inspect Stock Inventory for a Product)
// ==========================================================
if ($action === 'vault_keys') {
    $productId = (int)($_GET['product_id'] ?? 0);
    if ($productId <= 0) {
        jsonResponse(['error' => 'Invalid product ID.'], 400);
    }

    try {
        $stmt = $db->prepare("
            SELECT id, product_id, item_payload, is_sold, sold_to_user, sold_at, created_at
            FROM product_vault
            WHERE product_id = ?
            ORDER BY is_sold ASC, id DESC
            LIMIT 100
        ");
        $stmt->execute([$productId]);
        $keys = $stmt->fetchAll();

        foreach ($keys as &$k) {
            $k['id']      = (int)$k['id'];
            $k['is_sold'] = (int)$k['is_sold'];
        }
        unset($k);

        jsonResponse([
            'status' => 'success',
            'keys'   => $keys
        ]);
    } catch (Exception $e) {
        error_log('Admin Vault Keys Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to inspect vault keys.'], 500);
    }
}

// ==========================================================
// 7. ACTION: delete_key (Remove an Unsold Key)
// ==========================================================
if ($action === 'delete_key' && $method === 'POST') {
    $keyId = (int)($payload['key_id'] ?? 0);
    if ($keyId <= 0) {
        jsonResponse(['error' => 'Invalid key ID.'], 400);
    }

    try {
        $del = $db->prepare("DELETE FROM product_vault WHERE id = ? AND is_sold = 0");
        $del->execute([$keyId]);

        if ($del->rowCount() > 0) {
            jsonResponse(['status' => 'success', 'message' => 'Key removed from vault.']);
        } else {
            jsonResponse(['error' => 'Key not found or already sold.'], 400);
        }
    } catch (Exception $e) {
        error_log('Admin Delete Key Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to delete key.'], 500);
    }
}

// ==========================================================
// 8. ACTION: deposits (List Pending & Recent Deposits)
// ==========================================================
if ($action === 'deposits') {
    try {
        $filter = $_GET['filter'] ?? 'all'; // 'pending' or 'all'
        $sql = "
            SELECT 
                d.id,
                d.telegram_id,
                d.amount,
                d.payment_method,
                d.receipt_raw,
                d.receipt_image_url,
                d.extracted_txn_id,
                d.status,
                d.created_at,
                d.reviewed_at,
                u.first_name,
                u.username,
                u.wallet_balance
            FROM deposits d
            LEFT JOIN users u ON d.telegram_id = u.telegram_id
        ";
        if ($filter === 'pending') {
            $sql .= " WHERE d.status = 'pending' ";
        }
        $sql .= " ORDER BY (d.status = 'pending') DESC, d.id DESC LIMIT 50";

        $stmt = $db->query($sql);
        $deposits = $stmt->fetchAll();

        foreach ($deposits as &$d) {
            $d['id']             = (int)$d['id'];
            $d['telegram_id']    = (int)$d['telegram_id'];
            $d['amount']         = (float)$d['amount'];
            $d['wallet_balance'] = (float)($d['wallet_balance'] ?? 0.00);
        }
        unset($d);

        jsonResponse([
            'status'   => 'success',
            'deposits' => $deposits
        ]);
    } catch (Exception $e) {
        error_log('Admin Deposits Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to fetch deposits.'], 500);
    }
}

// ==========================================================
// 9. ACTION: review_deposit (Approve or Reject Deposit in App)
// ==========================================================
if ($action === 'review_deposit' && $method === 'POST') {
    $depositId = (int)($payload['deposit_id'] ?? 0);
    $decision  = strtolower(trim((string)($payload['decision'] ?? ''))); // 'approved' or 'rejected'

    if ($depositId <= 0 || !in_array($decision, ['approved', 'rejected'], true)) {
        jsonResponse(['error' => 'Invalid deposit review request.'], 400);
    }

    try {
        $db->beginTransaction();

        $depStmt = $db->prepare("SELECT * FROM deposits WHERE id = ? FOR UPDATE");
        $depStmt->execute([$depositId]);
        $deposit = $depStmt->fetch();

        if (!$deposit) {
            $db->rollBack();
            jsonResponse(['error' => 'Deposit record not found.'], 404);
        }

        if ($deposit['status'] !== 'pending') {
            $db->rollBack();
            jsonResponse(['error' => "Deposit is already {$deposit['status']}."], 400);
        }

        $userTgId = (int)$deposit['telegram_id'];
        $amount   = (float)$deposit['amount'];

        if ($decision === 'approved') {
            // Update deposit
            $upd = $db->prepare("UPDATE deposits SET status = 'approved', reviewed_at = NOW() WHERE id = ?");
            $upd->execute([$depositId]);

            // Credit wallet
            $credit = $db->prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE telegram_id = ?");
            $credit->execute([$amount, $userTgId]);

            // Get new user balance
            $balStmt = $db->prepare("SELECT wallet_balance FROM users WHERE telegram_id = ?");
            $balStmt->execute([$userTgId]);
            $newBal = (float)$balStmt->fetchColumn();

            $db->commit();

            // Dispatch customer Telegram notification
            $customerMsg = "🎉 <b>DEPOSIT APPROVED!</b>\n\n"
                . "Your deposit of <b>" . number_format($amount, 2) . " ETB</b> via <b>" . htmlspecialchars($deposit['payment_method']) . "</b> has been confirmed and credited to your wallet!\n\n"
                . "💳 <b>Your Current Balance:</b> <b>" . number_format($newBal, 2) . " ETB</b>\n\n"
                . "Open the store to pick your digital keys or subscriptions!";

            $customerMarkup = [
                'inline_keyboard' => [
                    [
                        [
                            'text'    => '🛍️ Open Store Now',
                            'web_app' => ['url' => rtrim(APP_URL, '/') . '/public/index.html']
                        ]
                    ]
                ]
            ];

            sendBotMessage($userTgId, $customerMsg, $customerMarkup);

            jsonResponse([
                'status'      => 'success',
                'message'     => "Deposit #{$depositId} approved! Credited {$amount} ETB.",
                'new_balance' => $newBal
            ]);
        } else {
            // Reject deposit
            $upd = $db->prepare("UPDATE deposits SET status = 'rejected', reviewed_at = NOW() WHERE id = ?");
            $upd->execute([$depositId]);
            $db->commit();

            $failMsg = "⚠️ <b>Deposit Request Update</b>\n\n"
                . "Your deposit request for <b>" . number_format($amount, 2) . " ETB</b> (Txn: " . ($deposit['extracted_txn_id'] ?? 'N/A') . ") could not be verified.\n\n"
                . "Please ensure the transaction was successful and that the exact reference number was provided. If you believe this is an error, please contact customer support.";

            sendBotMessage($userTgId, $failMsg);

            jsonResponse([
                'status'  => 'success',
                'message' => "Deposit #{$depositId} rejected."
            ]);
        }

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Admin Review Deposit Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to process deposit review.'], 500);
    }
}

// Helper: Ensure payment_methods table exists and is seeded with Mohammed Abdirahman Ibrahim
function ensurePaymentMethodsTable(PDO $db): void {
    $sql = "CREATE TABLE IF NOT EXISTS `payment_methods` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `code` VARCHAR(50) UNIQUE NOT NULL,
        `name` VARCHAR(100) NOT NULL,
        `account_number` VARCHAR(100) NOT NULL,
        `account_name` VARCHAR(255) NOT NULL,
        `instructions` TEXT NULL,
        `qr_image_url` VARCHAR(500) NULL,
        `is_active` TINYINT(1) NOT NULL DEFAULT 1,
        `display_order` INT NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX `idx_pm_active_order` (`is_active`, `display_order`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    $db->exec($sql);

    $count = (int)$db->query("SELECT COUNT(*) FROM `payment_methods`")->fetchColumn();
    if ($count === 0) {
        $stmt = $db->prepare("INSERT INTO `payment_methods` (`code`, `name`, `account_number`, `account_name`, `instructions`, `is_active`, `display_order`) VALUES
            ('telebirr', 'Telebirr', ?, ?, ?, 1, 1),
            ('cbe', 'Commercial Bank of Ethiopia (CBE)', ?, ?, ?, 1, 2),
            ('ebirr', 'E-Birr (Coop / Kaafi)', ?, ?, ?, 1, 3)");
        $stmt->execute([
            PAYMENT_TELEBIRR_PHONE, PAYMENT_TELEBIRR_NAME,
            'Transfer to ' . PAYMENT_TELEBIRR_PHONE . ' (' . PAYMENT_TELEBIRR_NAME . ') via Telebirr app or *127# and submit confirmation SMS or Txn ID.',
            PAYMENT_CBE_ACCOUNT, PAYMENT_CBE_NAME,
            'Transfer to CBE Account ' . PAYMENT_CBE_ACCOUNT . ' (' . PAYMENT_CBE_NAME . ') via Mobile Banking, and submit confirmation SMS or Txn ID.',
            PAYMENT_EBIRR_PHONE, PAYMENT_EBIRR_NAME,
            'Transfer via E-Birr to ' . PAYMENT_EBIRR_PHONE . ' (' . PAYMENT_EBIRR_NAME . ') and submit confirmation SMS.'
        ]);
    }
}

// ==========================================================
// 9. ACTION: payment_methods (List all payment accounts)
// ==========================================================
if ($action === 'payment_methods') {
    if ($db === null) {
        jsonResponse([
            'status' => 'success',
            'payment_methods' => array_values(getStorePaymentMethods(null))
        ]);
    }

    try {
        ensurePaymentMethodsTable($db);
        $stmt = $db->query("SELECT * FROM payment_methods ORDER BY display_order ASC, id ASC");
        $methods = $stmt->fetchAll();
        foreach ($methods as &$m) {
            $m['id'] = (int)$m['id'];
            $m['is_active'] = (int)$m['is_active'];
            $m['display_order'] = (int)$m['display_order'];
        }
        unset($m);

        jsonResponse([
            'status' => 'success',
            'payment_methods' => $methods
        ]);
    } catch (Exception $e) {
        error_log('Admin Payment Methods Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Failed to fetch payment methods.'], 500);
    }
}

// ==========================================================
// 10. ACTION: save_payment_method (Create or Edit Account)
// ==========================================================
if ($action === 'save_payment_method') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Only the store owner can modify receiving bank accounts.'], 403);
    }

    if ($db === null) {
        jsonResponse(['error' => 'Database connection required to save payment changes.'], 503);
    }

    $id = isset($payload['id']) && (int)$payload['id'] > 0 ? (int)$payload['id'] : null;
    $name = trim($payload['name'] ?? '');
    $accountNumber = trim($payload['account_number'] ?? '');
    $accountName = trim($payload['account_name'] ?? '');
    $instructions = trim($payload['instructions'] ?? '');
    $code = strtolower(trim($payload['code'] ?? ''));
    $isActive = isset($payload['is_active']) ? (int)(bool)$payload['is_active'] : 1;

    if (empty($name) || empty($accountNumber) || empty($accountName)) {
        jsonResponse(['error' => 'Account name, number, and holder name are required.'], 400);
    }

    if (empty($code)) {
        $code = preg_replace('/[^a-z0-9]+/', '_', strtolower($name));
        $code = trim($code, '_');
    }

    try {
        ensurePaymentMethodsTable($db);

        if ($id) {
            $stmt = $db->prepare("UPDATE payment_methods SET name = ?, account_number = ?, account_name = ?, instructions = ?, is_active = ?, code = ? WHERE id = ?");
            $stmt->execute([$name, $accountNumber, $accountName, $instructions, $isActive, $code, $id]);
            $msg = "Payment account updated successfully!";
        } else {
            $stmt = $db->prepare("INSERT INTO payment_methods (code, name, account_number, account_name, instructions, is_active, display_order) VALUES (?, ?, ?, ?, ?, ?, 99) ON DUPLICATE KEY UPDATE name = VALUES(name), account_number = VALUES(account_number), account_name = VALUES(account_name), instructions = VALUES(instructions), is_active = VALUES(is_active)");
            $stmt->execute([$code, $name, $accountNumber, $accountName, $instructions, $isActive]);
            $msg = "Payment account added successfully!";
        }

        jsonResponse([
            'status'  => 'success',
            'message' => $msg
        ]);
    } catch (Exception $e) {
        error_log("Save Payment Method Error: " . $e->getMessage());
        jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

// ==========================================================
// 11. ACTION: toggle_payment_method (Quick Enable/Disable)
// ==========================================================
if ($action === 'toggle_payment_method') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Only the store owner can modify receiving bank accounts.'], 403);
    }

    if ($db === null) {
        jsonResponse(['error' => 'Database connection required.'], 503);
    }

    $id = (int)($payload['id'] ?? 0);
    if ($id <= 0) {
        jsonResponse(['error' => 'Invalid payment method ID.'], 400);
    }

    try {
        ensurePaymentMethodsTable($db);
        $stmt = $db->prepare("UPDATE payment_methods SET is_active = 1 - is_active WHERE id = ?");
        $stmt->execute([$id]);

        jsonResponse([
            'status' => 'success',
            'message' => 'Status updated successfully.'
        ]);
    } catch (Exception $e) {
        error_log("Toggle Payment Error: " . $e->getMessage());
        jsonResponse(['error' => 'Failed to toggle status.'], 500);
    }
}

// ==========================================================
// 12. ACTION: get_staff (List all staff members)
// ==========================================================
if ($action === 'get_staff') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Staff management is restricted to the store owner.'], 403);
    }

    try {
        $stmt = $db->query("SELECT id, telegram_id, first_name, username, role, created_at FROM users WHERE role IN ('admin', 'staff') ORDER BY (role = 'admin') DESC, id ASC");
        $staff = $stmt->fetchAll();
        jsonResponse(['status' => 'success', 'staff' => $staff]);
    } catch (Exception $e) {
        error_log("Get Staff Error: " . $e->getMessage());
        jsonResponse(['error' => 'Failed to fetch staff list.'], 500);
    }
}

// ==========================================================
// 13. ACTION: save_staff (Promote user to staff/admin)
// ==========================================================
if ($action === 'save_staff' && $method === 'POST') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Staff management is restricted to the store owner.'], 403);
    }

    $targetTgId = (int)($payload['telegram_id'] ?? 0);
    $newRole = strtolower(trim((string)($payload['role'] ?? 'staff')));

    if ($targetTgId <= 0 || !in_array($newRole, ['staff', 'admin'], true)) {
        jsonResponse(['error' => 'Please provide a valid Telegram ID and role.'], 400);
    }

    try {
        $chk = $db->prepare("SELECT id, first_name FROM users WHERE telegram_id = ? LIMIT 1");
        $chk->execute([$targetTgId]);
        $existing = $chk->fetch();

        if ($existing) {
            $upd = $db->prepare("UPDATE users SET role = ? WHERE telegram_id = ?");
            $upd->execute([$newRole, $targetTgId]);
        } else {
            $ins = $db->prepare("INSERT INTO users (telegram_id, first_name, wallet_balance, role, created_at) VALUES (?, 'Staff Member', 0.00, ?, NOW())");
            $ins->execute([$targetTgId, $newRole]);
        }

        jsonResponse([
            'status'  => 'success',
            'message' => "User {$targetTgId} permissions updated to {$newRole}!"
        ]);
    } catch (Exception $e) {
        error_log("Save Staff Error: " . $e->getMessage());
        jsonResponse(['error' => 'Failed to save staff permissions.'], 500);
    }
}

// ==========================================================
// 14. ACTION: remove_staff (Demote user to customer)
// ==========================================================
if ($action === 'remove_staff' && $method === 'POST') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Staff management is restricted to the store owner.'], 403);
    }

    $targetTgId = (int)($payload['telegram_id'] ?? 0);
    if ($targetTgId <= 0) {
        jsonResponse(['error' => 'Invalid Telegram ID.'], 400);
    }

    if (ADMIN_CHAT_ID > 0 && $targetTgId === ADMIN_CHAT_ID) {
        jsonResponse(['error' => 'Cannot demote the primary store owner.'], 400);
    }

    try {
        $upd = $db->prepare("UPDATE users SET role = 'customer' WHERE telegram_id = ?");
        $upd->execute([$targetTgId]);

        jsonResponse([
            'status'  => 'success',
            'message' => "Staff permissions revoked for user {$targetTgId}."
        ]);
    } catch (Exception $e) {
        error_log("Remove Staff Error: " . $e->getMessage());
        jsonResponse(['error' => 'Failed to remove staff privileges.'], 500);
    }
}

// ==========================================================
// 15. ACTION: broadcast_marketing (Post Announcement to Channel)
// ==========================================================
if ($action === 'broadcast_marketing' && $method === 'POST') {
    if (!$isOwner) {
        jsonResponse(['error' => 'Permission denied. Marketing broadcasts are restricted to the store owner.'], 403);
    }

    $messageText = trim((string)($payload['message'] ?? ''));
    $photoUrl    = trim((string)($payload['photo_url'] ?? ''));
    $buttonText  = trim((string)($payload['button_text'] ?? '🛍️ Open Store'));
    $buttonUrl   = trim((string)($payload['button_url'] ?? rtrim(APP_URL, '/') . '/public/index.html'));

    if (empty($messageText)) {
        jsonResponse(['error' => 'Broadcast message content cannot be empty.'], 400);
    }

    if (empty(MARKETING_CHANNEL_ID)) {
        jsonResponse(['error' => 'MARKETING_CHANNEL_ID is not configured in api/config.php.'], 400);
    }

    $channelMarkup = [
        'inline_keyboard' => [
            [
                ['text' => $buttonText, 'web_app' => ['url' => $buttonUrl]]
            ]
        ]
    ];

    $result = broadcastToChannel($messageText, !empty($photoUrl) ? $photoUrl : null, $channelMarkup);

    if (!empty($result['ok'])) {
        jsonResponse([
            'status'  => 'success',
            'message' => 'Broadcast delivered to channel/group successfully! 📢',
            'result'  => $result
        ]);
    } else {
        jsonResponse([
            'error' => 'Telegram broadcast failed: ' . ($result['description'] ?? 'Verify bot is an administrator in your channel.')
        ], 400);
    }
}

jsonResponse(['error' => 'Unknown admin action.'], 400);
