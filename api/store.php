<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$db = getDb(false);

// ----------------------------------------------------------
// 1. GET: Fetch product catalog with live stock counts
// ----------------------------------------------------------
if ($method === 'GET') {
    if ($db === null) {
        jsonResponse([
            'status' => 'success',
            'products' => [
                [
                    'id' => 1,
                    'name' => 'Google Gemini 1.5 Advanced (1 Month)',
                    'category' => 'AI Tools',
                    'price_etb' => 450.00,
                    'description' => 'Full access to Gemini 1.5 Pro with 1M token context window, Deep Research & Workspace integration.',
                    'icon_url' => 'https://api.iconify.design/logos:google-gemini.svg',
                    'badge' => '⚡ HOT DEAL',
                    'stock_count' => 15
                ],
                [
                    'id' => 2,
                    'name' => 'Canva Pro (1-Year Team Invite)',
                    'category' => 'Design',
                    'price_etb' => 350.00,
                    'description' => 'Full Canva Pro upgrade on your personal email. Magic Resize, Background Remover & premium stock assets.',
                    'icon_url' => 'https://api.iconify.design/logos:canva.svg',
                    'badge' => '🔥 POPULAR',
                    'stock_count' => 24
                ],
                [
                    'id' => 3,
                    'name' => 'Telegram Premium (3 Months Gift)',
                    'category' => 'Social',
                    'price_etb' => 850.00,
                    'description' => 'Direct 3-Month Premium gift code. Fast downloads, 4GB uploads, voice-to-text and unique badges.',
                    'icon_url' => 'https://api.iconify.design/logos:telegram.svg',
                    'badge' => '⭐ BESTSELLER',
                    'stock_count' => 8
                ],
                [
                    'id' => 4,
                    'name' => 'ChatGPT Plus / Team Account (1 Month)',
                    'category' => 'AI Tools',
                    'price_etb' => 650.00,
                    'description' => 'Private OpenAI account with GPT-4o, DALL-E 3 image generation, and Voice Mode enabled.',
                    'icon_url' => 'https://api.iconify.design/logos:openai-icon.svg',
                    'badge' => '🚀 TOP PICK',
                    'stock_count' => 12
                ],
                [
                    'id' => 5,
                    'name' => 'NordVPN Premium (1-Year Private)',
                    'category' => 'VPN & Security',
                    'price_etb' => 500.00,
                    'description' => 'Ultra-fast high-speed VPN supporting 6 devices simultaneously with Threat Protection.',
                    'icon_url' => 'https://api.iconify.design/logos:nordvpn-icon.svg',
                    'badge' => '🛡️ SECURE',
                    'stock_count' => 19
                ],
                [
                    'id' => 6,
                    'name' => 'Spotify Premium (6-Months Individual)',
                    'category' => 'Streaming',
                    'price_etb' => 400.00,
                    'description' => 'Ad-free high-fidelity music streaming, offline downloads, and unlimited skips on your account.',
                    'icon_url' => 'https://api.iconify.design/logos:spotify-icon.svg',
                    'badge' => '🎵 STREAMING',
                    'stock_count' => 11
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
                p.icon_url,
                p.badge,
                COUNT(v.id) AS stock_count
            FROM products p
            LEFT JOIN product_vault v 
                ON p.id = v.product_id AND v.is_sold = 0
            WHERE p.is_active = 1
            GROUP BY p.id, p.name, p.category, p.price_etb, p.description, p.icon_url, p.badge
            ORDER BY p.id ASC
        ");
        $products = $stmt->fetchAll();

        // Format numerical values
        foreach ($products as &$p) {
            $p['id'] = (int)$p['id'];
            $p['price_etb'] = (float)$p['price_etb'];
            $p['stock_count'] = (int)$p['stock_count'];
        }
        unset($p);

        jsonResponse([
            'status' => 'success',
            'products' => $products,
        ]);
    } catch (Exception $e) {
        error_log('Store Catalog Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Unable to fetch store products.'], 500);
    }
}

// ----------------------------------------------------------
// 2. POST: Handle instant digital checkout
// ----------------------------------------------------------
if ($method === 'POST') {
    // Authenticate user
    $authUser = getAuthenticatedUser();
    $telegramId = (int)$authUser['id'];

    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);

    $productId = isset($payload['product_id']) ? (int)$payload['product_id'] : 0;
    if ($productId <= 0) {
        jsonResponse(['error' => 'Invalid product selected.'], 400);
    }

    try {
        // Begin atomic transaction
        $db->beginTransaction();

        // 1. Lock and inspect user record
        $userStmt = $db->prepare("SELECT id, wallet_balance, first_name FROM users WHERE telegram_id = ? FOR UPDATE");
        $userStmt->execute([$telegramId]);
        $user = $userStmt->fetch();

        if (!$user) {
            $db->rollBack();
            jsonResponse(['error' => 'User account not found.'], 404);
        }

        $currentBalance = (float)$user['wallet_balance'];

        // 2. Lock and inspect product
        $prodStmt = $db->prepare("SELECT id, name, price_etb, is_active FROM products WHERE id = ? FOR UPDATE");
        $prodStmt->execute([$productId]);
        $product = $prodStmt->fetch();

        if (!$product || (int)$product['is_active'] !== 1) {
            $db->rollBack();
            jsonResponse(['error' => 'Product is no longer available.'], 400);
        }

        $price = (float)$product['price_etb'];

        // 3. Balance verification
        if ($currentBalance < $price) {
            $db->rollBack();
            jsonResponse([
                'error' => 'Insufficient wallet balance.',
                'current_balance' => $currentBalance,
                'required_amount' => $price,
                'shortfall' => round($price - $currentBalance, 2),
            ], 400);
        }

        // 4. Select and lock 1 unsold digital key/account from vault
        $vaultStmt = $db->prepare("
            SELECT id, item_payload 
            FROM product_vault 
            WHERE product_id = ? AND is_sold = 0 
            LIMIT 1 
            FOR UPDATE
        ");
        $vaultStmt->execute([$productId]);
        $vaultItem = $vaultStmt->fetch();

        if (!$vaultItem) {
            $db->rollBack();
            jsonResponse(['error' => 'Sorry, this item is currently out of stock!'], 400);
        }

        $vaultId = (int)$vaultItem['id'];
        $digitalPayload = $vaultItem['item_payload'];

        // 5. Deduct wallet balance
        $deductStmt = $db->prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE telegram_id = ?");
        $deductStmt->execute([$price, $telegramId]);

        // 6. Mark vault item as sold
        $soldStmt = $db->prepare("UPDATE product_vault SET is_sold = 1, sold_to_user = ?, sold_at = NOW() WHERE id = ?");
        $soldStmt->execute([$telegramId, $vaultId]);

        // 7. Insert into orders table
        $orderStmt = $db->prepare("
            INSERT INTO orders (telegram_id, product_id, price_paid, delivered_payload, created_at)
            VALUES (?, ?, ?, ?, NOW())
        ");
        $orderStmt->execute([$telegramId, $productId, $price, $digitalPayload]);
        $orderId = (int)$db->lastInsertId();

        // Calculate remaining balance
        $newBalance = round($currentBalance - $price, 2);

        // Commit transaction atomically
        $db->commit();

        // 8. Asynchronous backup delivery message to user Telegram Bot chat
        $tgMessage = "🎉 <b>Purchase Successful!</b>\n\n"
            . "📦 <b>Product:</b> " . htmlspecialchars($product['name'], ENT_QUOTES, 'UTF-8') . "\n"
            . "💰 <b>Price:</b> " . number_format($price, 2) . " ETB\n"
            . "🧾 <b>Order ID:</b> #" . $orderId . "\n"
            . "💳 <b>Remaining Balance:</b> " . number_format($newBalance, 2) . " ETB\n\n"
            . "🔑 <b>Delivered Item:</b>\n"
            . "<code>" . htmlspecialchars($digitalPayload, ENT_QUOTES, 'UTF-8') . "</code>\n\n"
            . "<i>You can also access all your purchases in the Mini App under the 'Orders' tab.</i>";

        sendBotMessage($telegramId, $tgMessage);

        jsonResponse([
            'status'            => 'success',
            'order_id'          => $orderId,
            'product_name'      => $product['name'],
            'price_paid'        => $price,
            'delivered_payload' => $digitalPayload,
            'wallet_balance'    => $newBalance,
            'message'           => 'Purchase complete! Your item is delivered below.',
        ]);

    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Store Checkout Error: ' . $e->getMessage());
        jsonResponse(['error' => 'Checkout failed due to a server error. Please try again.'], 500);
    }
}

jsonResponse(['error' => 'Method not allowed.'], 405);
