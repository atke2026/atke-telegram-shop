<?php
declare(strict_types=1);

/**
 * AtkeShop Automated Reseller & Wholesale REST API & Gateway
 * Powers the Reseller TMA Portal (Overview, Products, Orders, API Keys, Integration)
 * and bridges with YeneShop Wholesaler API (https://yeneshop.amixmon.com/api/reseller/v1)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/yeneshop_client.php';

$client = new YeneShopClient();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'overview';

// ----------------------------------------------------------
// 1. GET: Reseller Dashboard Overview (Balances & Stats)
// ----------------------------------------------------------
if ($action === 'overview' && $method === 'GET') {
    $balRes = $client->getBalance();
    $prodRes = $client->getProducts();
    $ordersRes = $client->getOrders();

    $liveWallet = (float)($balRes['live_wallet'] ?? 0.00);
    $sandboxWallet = (float)($balRes['sandbox_wallet'] ?? $balRes['balance'] ?? 100000.00);
    $prodCount = (int)($prodRes['count'] ?? count($prodRes['products'] ?? []));
    $ordersCount = (int)($ordersRes['count'] ?? count($ordersRes['orders'] ?? []));

    jsonResponse([
        'status' => 'success',
        'overview' => [
            'live_wallet' => $liveWallet,
            'sandbox_wallet' => $sandboxWallet,
            'products_count' => $prodCount > 0 ? $prodCount : 16,
            'recent_orders_count' => $ordersCount,
            'mode' => $client->getMode(),
            'base_url' => defined('YENESHOP_API_BASE_URL') ? YENESHOP_API_BASE_URL : 'https://yeneshop.amixmon.com/api/reseller/v1'
        ]
    ]);
}

// ----------------------------------------------------------
// 2. GET: Reseller Wholesale Catalog (16 Products)
// ----------------------------------------------------------
if (($action === 'products' || $action === 'catalog') && $method === 'GET') {
    $response = $client->getProducts();
    $products = $response['products'] ?? $client->getDefaultResellerCatalogue();

    jsonResponse([
        'status' => 'success',
        'count' => count($products),
        'products' => $products
    ]);
}

// ----------------------------------------------------------
// 3. GET: Reseller Orders (Live vs Sandbox)
// ----------------------------------------------------------
if ($action === 'orders' && $method === 'GET') {
    $mode = $_GET['mode'] ?? $client->getMode();
    $savedData = $client->loadPersistedKeys();

    if ($mode === 'sandbox') {
        $orders = $savedData['sandbox_orders'] ?? [];
    } else {
        $liveRes = $client->getOrders();
        $orders = $liveRes['orders'] ?? [];
    }

    jsonResponse([
        'status' => 'success',
        'mode' => $mode,
        'count' => count($orders),
        'orders' => array_reverse($orders)
    ]);
}

// ----------------------------------------------------------
// 4. POST: Reset Sandbox Funds (to 100,000 ETB)
// ----------------------------------------------------------
if ($action === 'reset_sandbox' && $method === 'POST') {
    $newBalance = $client->resetSandboxFunds();
    jsonResponse([
        'status' => 'success',
        'message' => 'Sandbox wallet reset to 100,000.00 ETB.',
        'sandbox_balance' => $newBalance
    ]);
}

// ----------------------------------------------------------
// 5. GET / POST: Manage Reseller API Keys
// ----------------------------------------------------------
if ($action === 'keys') {
    if ($method === 'GET') {
        $keys = $client->loadPersistedKeys();
        $sandboxKey = $keys['sandbox_key'] ?? '';
        $liveKey = $keys['live_key'] ?? '';

        jsonResponse([
            'status' => 'success',
            'base_url' => defined('YENESHOP_API_BASE_URL') ? YENESHOP_API_BASE_URL : 'https://yeneshop.amixmon.com/api/reseller/v1',
            'mode' => $keys['mode'] ?? 'sandbox',
            'sandbox' => [
                'is_active' => !empty($sandboxKey),
                'masked' => !empty($sandboxKey) ? (substr($sandboxKey, 0, 4) . '...' . substr($sandboxKey, -4)) : null,
            ],
            'live' => [
                'is_active' => !empty($liveKey),
                'masked' => !empty($liveKey) ? (substr($liveKey, 0, 4) . '...' . substr($liveKey, -4)) : null,
            ]
        ]);
    }

    if ($method === 'POST') {
        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $update = [];
        
        if (isset($payload['sandbox_key'])) {
            $update['sandbox_key'] = trim((string)$payload['sandbox_key']);
        }
        if (isset($payload['live_key'])) {
            $update['live_key'] = trim((string)$payload['live_key']);
        }
        if (isset($payload['mode']) && in_array($payload['mode'], ['sandbox', 'live'], true)) {
            $update['mode'] = $payload['mode'];
        }

        $client->savePersistedKeys($update);

        jsonResponse([
            'status' => 'success',
            'message' => 'Reseller API configuration updated successfully.'
        ]);
    }
}

// ----------------------------------------------------------
// 6. POST: Place Upstream Reseller Order
// ----------------------------------------------------------
if ($action === 'buy' || $action === 'order') {
    if ($method === 'POST') {
        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $productId = $payload['product_id'] ?? $payload['productId'] ?? null;
        $customerInput = $payload['customer_input'] ?? $payload['customerInput'] ?? null;
        $externalId = trim((string)($payload['external_id'] ?? $payload['externalId'] ?? ('ord_' . date('Ymd_His') . '_' . rand(100, 999))));

        if (!$productId) {
            jsonResponse(['error' => 'Missing product_id parameter.'], 400);
        }

        $orderRes = $client->createOrder($externalId, $productId, $customerInput);
        jsonResponse($orderRes);
    }
}

jsonResponse(['error' => 'Invalid action requested.'], 404);
