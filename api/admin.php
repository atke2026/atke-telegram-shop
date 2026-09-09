<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// 1. Authenticate user via Telegram initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];

// 2. Strict Admin Authorization Check
// When ADMIN_CHAT_ID is set (> 0), strictly enforce that only the configured admin can execute actions.
// If ADMIN_CHAT_ID is 0 in local dev mode with mock token, allow for testing.
if (ADMIN_CHAT_ID > 0 && $telegramId !== ADMIN_CHAT_ID) {
    jsonResponse([
        'error' => 'Unauthorized. Admin access required.',
        'code'  => 403
    ], 403);
}

$db = getDb(false);
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

        // Total orders & gross revenue
        $orderStats = $db->query("
            SELECT COUNT(*) AS total_orders, COALESCE(SUM(price_paid), 0) AS total_revenue 
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

        jsonResponse([
            'status' => 'success',
            'stats'  => [
                'users_count'      => $usersCount,
                'orders_count'     => (int)($orderStats['total_orders'] ?? 0),
                'total_revenue'    => (float)($orderStats['total_revenue'] ?? 0.00),
                'pending_deposits' => (int)($depStats['pending_count'] ?? 0),
                'pending_amount'   => (float)($depStats['pending_amount'] ?? 0.00),
                'available_keys'   => (int)($stockStats['available_keys'] ?? 0),
                'delivered_keys'   => (int)($stockStats['delivered_keys'] ?? 0),
                'active_products'  => $prodCount,
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
                ['id' => 1, 'name' => 'Google Gemini 1.5 Advanced (1 Month)', 'category' => 'AI Tools', 'price_etb' => 450.00, 'description' => 'Full access to Gemini 1.5 Pro', 'icon_url' => 'https://api.iconify.design/logos:google-gemini.svg', 'badge' => '⚡ HOT DEAL', 'is_active' => 1, 'unsold_keys' => 15, 'sold_keys' => 0],
                ['id' => 2, 'name' => 'Canva Pro (1-Year Team Invite)', 'category' => 'Design', 'price_etb' => 350.00, 'description' => 'Full Canva Pro upgrade', 'icon_url' => 'https://api.iconify.design/logos:canva.svg', 'badge' => '🔥 POPULAR', 'is_active' => 1, 'unsold_keys' => 24, 'sold_keys' => 0],
                ['id' => 3, 'name' => 'Telegram Premium (3 Months Gift)', 'category' => 'Social', 'price_etb' => 850.00, 'description' => 'Direct 3-Month Premium gift code', 'icon_url' => 'https://api.iconify.design/logos:telegram.svg', 'badge' => '⭐ BESTSELLER', 'is_active' => 1, 'unsold_keys' => 8, 'sold_keys' => 0],
                ['id' => 4, 'name' => 'ChatGPT Plus / Team Account (1 Month)', 'category' => 'AI Tools', 'price_etb' => 650.00, 'description' => 'Private OpenAI account with GPT-4o', 'icon_url' => 'https://api.iconify.design/logos:openai-icon.svg', 'badge' => '🚀 TOP PICK', 'is_active' => 1, 'unsold_keys' => 12, 'sold_keys' => 0],
                ['id' => 5, 'name' => 'NordVPN Premium (1-Year Private)', 'category' => 'VPN & Security', 'price_etb' => 500.00, 'description' => 'Ultra-fast VPN for 6 devices', 'icon_url' => 'https://api.iconify.design/logos:nordvpn-icon.svg', 'badge' => '🛡️ SECURE', 'is_active' => 1, 'unsold_keys' => 19, 'sold_keys' => 0],
                ['id' => 6, 'name' => 'Spotify Premium (6-Months Individual)', 'category' => 'Streaming', 'price_etb' => 400.00, 'description' => 'Ad-free music streaming', 'icon_url' => 'https://api.iconify.design/logos:spotify-icon.svg', 'badge' => '🎵 STREAMING', 'is_active' => 1, 'unsold_keys' => 11, 'sold_keys' => 0],
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
                p.icon_url,
                p.badge,
                p.is_active,
                p.created_at,
                COUNT(CASE WHEN v.is_sold = 0 THEN 1 END) AS unsold_keys,
                COUNT(CASE WHEN v.is_sold = 1 THEN 1 END) AS sold_keys
            FROM products p
            LEFT JOIN product_vault v ON p.id = v.product_id
            GROUP BY p.id, p.name, p.category, p.price_etb, p.description, p.icon_url, p.badge, p.is_active, p.created_at
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
    $description = trim((string)($payload['description'] ?? ''));
    $iconUrl = trim((string)($payload['icon_url'] ?? ''));
    $badge = trim((string)($payload['badge'] ?? ''));
    $badge = $badge === '' ? null : $badge;
    $isActive = isset($payload['is_active']) ? (int)$payload['is_active'] : 1;

    if (empty($name)) {
        jsonResponse(['error' => 'Product title/name is required.'], 400);
    }
    if ($price <= 0) {
        jsonResponse(['error' => 'Price must be greater than 0 ETB.'], 400);
    }

    try {
        if ($id > 0) {
            // Update existing product
            $stmt = $db->prepare("
                UPDATE products 
                SET name = ?, category = ?, price_etb = ?, description = ?, icon_url = ?, badge = ?, is_active = ?
                WHERE id = ?
            ");
            $stmt->execute([$name, $category, $price, $description, $iconUrl, $badge, $isActive, $id]);

            jsonResponse([
                'status'  => 'success',
                'message' => 'Product updated successfully!',
                'id'      => $id
            ]);
        } else {
            // Insert new product
            $stmt = $db->prepare("
                INSERT INTO products (name, category, price_etb, description, icon_url, badge, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ");
            $stmt->execute([$name, $category, $price, $description, $iconUrl, $badge, $isActive]);
            $newId = (int)$db->lastInsertId();

            jsonResponse([
                'status'  => 'success',
                'message' => 'New product created successfully!',
                'id'      => $newId
            ]);
        }
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

jsonResponse(['error' => 'Unknown admin action.'], 400);
