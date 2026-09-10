<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Authenticate user via Telegram initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];

$db = getDb();

try {
    $stmt = $db->prepare("
        SELECT 
            o.id,
            o.product_id,
            o.price_paid,
            o.delivered_payload,
            o.created_at,
            p.name AS product_name,
            p.category,
            p.icon_url,
            p.description,
            p.how_to_use
        FROM orders o
        JOIN products p ON o.product_id = p.id
        WHERE o.telegram_id = ?
        ORDER BY o.id DESC
    ");
    $stmt->execute([$telegramId]);
    $orders = $stmt->fetchAll();

    foreach ($orders as &$ord) {
        $ord['id'] = (int)$ord['id'];
        $ord['product_id'] = (int)$ord['product_id'];
        $ord['price_paid'] = (float)$ord['price_paid'];
    }
    unset($ord);

    jsonResponse([
        'status' => 'success',
        'orders' => $orders,
    ]);

} catch (Exception $e) {
    error_log('Orders Fetch Error: ' . $e->getMessage());
    jsonResponse(['error' => 'Unable to fetch orders.'], 500);
}
