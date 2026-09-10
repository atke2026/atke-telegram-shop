<?php
declare(strict_types=1);

/**
 * AtkeShop Automated Reseller & Wholesale REST API
 * Enables programmatic ordering, catalog syncing, and profit reporting
 */

require_once __DIR__ . '/config.php';

// Accept either Telegram initData or static Reseller API Key in headers
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$user = null;

if (!empty($_SERVER['HTTP_X_TELEGRAM_INIT_DATA']) || !empty($_SERVER['HTTP_AUTHORIZATION']) && str_starts_with($_SERVER['HTTP_AUTHORIZATION'], 'tma ')) {
    $user = getAuthenticatedUser();
} else {
    // API Key Authentication (Configured in Plesk or env as RESELLER_API_KEY)
    $configuredKey = getenv('RESELLER_API_KEY') ?: 'atkeshop_reseller_secure_api_key_2026';
    $cleanKey = str_ireplace('Bearer ', '', $apiKey);
    
    if ($cleanKey === $configuredKey && !empty($configuredKey)) {
        $user = [
            'id' => ADMIN_CHAT_ID > 0 ? ADMIN_CHAT_ID : 7338533936,
            'first_name' => 'API System',
            'username' => 'api_reseller',
            'role' => 'admin'
        ];
    }
}

if (!$user) {
    jsonResponse(['error' => 'Unauthorized. Provide valid X-Telegram-Init-Data or X-API-KEY.'], 401);
}

$db = getDb(true);
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'catalog';

// ----------------------------------------------------------
// 1. GET: Wholesale Catalog & Available Stock
// ----------------------------------------------------------
if ($action === 'catalog' && $method === 'GET') {
    try {
        $stmt = $db->query("
            SELECT 
                p.id,
                p.name,
                p.category,
                p.price_etb,
                p.cost_price_etb,
                p.variants_json,
                p.description,
                COUNT(v.id) AS available_stock
            FROM products p
            LEFT JOIN product_vault v ON p.id = v.product_id AND v.is_sold = 0
            WHERE p.is_active = 1
            GROUP BY p.id, p.name, p.category, p.price_etb, p.cost_price_etb, p.variants_json, p.description
            ORDER BY p.id ASC
        ");
        $products = $stmt->fetchAll();

        foreach ($products as &$p) {
            $p['id']              = (int)$p['id'];
            $p['selling_price']   = (float)$p['price_etb'];
            $p['cost_price']      = (float)$p['cost_price_etb'];
            $p['estimated_margin']= round($p['selling_price'] - $p['cost_price'], 2);
            $p['available_stock'] = (int)$p['available_stock'];
            $p['variants']        = !empty($p['variants_json']) ? json_decode($p['variants_json'], true) : null;
            unset($p['variants_json'], $p['price_etb'], $p['cost_price_etb']);
        }
        unset($p);

        jsonResponse([
            'status'   => 'success',
            'catalog'  => $products,
            'count'    => count($products)
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Failed to fetch catalog: ' . $e->getMessage()], 500);
    }
}

// ----------------------------------------------------------
// 2. POST: Programmatic Instant Purchase / Buy via API
// ----------------------------------------------------------
if ($action === 'buy' && $method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true) ?? [];

    $productId = (int)($payload['product_id'] ?? 0);
    $variantName = trim((string)($payload['variant'] ?? ''));
    $customerTelegramId = (int)($payload['telegram_id'] ?? $user['id']);

    if ($productId <= 0) {
        jsonResponse(['error' => 'Invalid product_id parameter.'], 400);
    }

    try {
        $db->beginTransaction();

        // Check user balance
        $uStmt = $db->prepare("SELECT id, wallet_balance, first_name FROM users WHERE telegram_id = ? FOR UPDATE");
        $uStmt->execute([$customerTelegramId]);
        $u = $uStmt->fetch();

        if (!$u) {
            $db->rollBack();
            jsonResponse(['error' => "User {$customerTelegramId} not registered in database."], 404);
        }

        $balance = (float)$u['wallet_balance'];

        // Check product & pricing
        $pStmt = $db->prepare("SELECT id, name, price_etb, cost_price_etb, variants_json, is_active FROM products WHERE id = ? FOR UPDATE");
        $pStmt->execute([$productId]);
        $product = $pStmt->fetch();

        if (!$product || (int)$product['is_active'] !== 1) {
            $db->rollBack();
            jsonResponse(['error' => 'Product is currently inactive or not found.'], 400);
        }

        $price = (float)$product['price_etb'];
        $cost = (float)($product['cost_price_etb'] ?? 0.00);

        if (!empty($variantName) && !empty($product['variants_json'])) {
            $variants = json_decode($product['variants_json'], true);
            if (is_array($variants)) {
                foreach ($variants as $v) {
                    if (strcasecmp($v['name'] ?? '', $variantName) === 0) {
                        $price = (float)($v['price'] ?? $price);
                        $cost = (float)($v['cost'] ?? $cost);
                        break;
                    }
                }
            }
        }

        if ($balance < $price) {
            $db->rollBack();
            jsonResponse([
                'error' => 'Insufficient wallet balance for API purchase.',
                'required' => $price,
                'available' => $balance,
                'shortfall' => round($price - $balance, 2)
            ], 400);
        }

        // Lock vault key
        $vStmt = $db->prepare("SELECT id, item_payload FROM product_vault WHERE product_id = ? AND is_sold = 0 LIMIT 1 FOR UPDATE");
        $vStmt->execute([$productId]);
        $keyItem = $vStmt->fetch();

        if (!$keyItem) {
            $db->rollBack();
            jsonResponse(['error' => 'Item is out of stock in vault.'], 400);
        }

        $vaultId = (int)$keyItem['id'];
        $payloadData = $keyItem['item_payload'];

        // Deduct balance
        $db->prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE telegram_id = ?")->execute([$price, $customerTelegramId]);

        // Mark key sold
        $db->prepare("UPDATE product_vault SET is_sold = 1, sold_to_user = ?, sold_at = NOW() WHERE id = ?")->execute([$customerTelegramId, $vaultId]);

        // Record order with profit
        $profit = round($price - $cost, 2);
        $db->prepare("
            INSERT INTO orders (telegram_id, product_id, selected_variant, price_paid, cost_price, profit, delivered_payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ")->execute([$customerTelegramId, $productId, $variantName ?: null, $price, $cost, $profit, $payloadData]);
        $orderId = (int)$db->lastInsertId();

        $db->commit();

        jsonResponse([
            'status'            => 'success',
            'order_id'          => $orderId,
            'product_name'      => $product['name'],
            'variant'           => $variantName ?: null,
            'price_paid'        => $price,
            'cost_price'        => $cost,
            'profit'            => $profit,
            'remaining_balance' => round($balance - $price, 2),
            'delivered_payload' => $payloadData
        ]);

    } catch (Exception $e) {
        if ($db->inTransaction()) $db->rollBack();
        jsonResponse(['error' => 'API purchase failed: ' . $e->getMessage()], 500);
    }
}

// ----------------------------------------------------------
// 3. GET: Profit & Reseller Report Summary Overview
// ----------------------------------------------------------
if ($action === 'profit_report' && $method === 'GET') {
    try {
        $overall = $db->query("
            SELECT 
                COUNT(*) AS total_orders,
                COALESCE(SUM(price_paid), 0) AS total_gross_sales,
                COALESCE(SUM(cost_price), 0) AS total_wholesale_cost,
                COALESCE(SUM(profit), 0) AS total_net_profit
            FROM orders
        ")->fetch();

        $byProduct = $db->query("
            SELECT 
                p.id,
                p.name,
                COUNT(o.id) AS units_sold,
                COALESCE(SUM(o.price_paid), 0) AS gross_revenue,
                COALESCE(SUM(o.cost_price), 0) AS wholesale_cost,
                COALESCE(SUM(o.profit), 0) AS net_profit
            FROM products p
            LEFT JOIN orders o ON p.id = o.product_id
            GROUP BY p.id, p.name
            ORDER BY net_profit DESC
        ")->fetchAll();

        $gross = (float)$overall['total_gross_sales'];
        $net = (float)$overall['total_net_profit'];
        $marginPct = $gross > 0 ? round(($net / $gross) * 100, 1) : 0.0;

        jsonResponse([
            'status' => 'success',
            'summary' => [
                'total_orders'    => (int)$overall['total_orders'],
                'gross_sales'     => $gross,
                'wholesale_cost'  => (float)$overall['total_wholesale_cost'],
                'net_profit'      => $net,
                'profit_margin_%' => $marginPct
            ],
            'products_breakdown' => $byProduct
        ]);
    } catch (Exception $e) {
        jsonResponse(['error' => 'Report calculation failed: ' . $e->getMessage()], 500);
    }
}

jsonResponse(['error' => 'Unknown action. Available: catalog, buy, profit_report'], 400);
