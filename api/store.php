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
                    'name' => 'Gemini AI Pro 18m',
                    'category' => 'AI Tools',
                    'price_etb' => 385.00,
                    'cost_price_etb' => 220.00,
                    'description' => 'Google Gemini AI Pro 18 Months subscription with 5TB Cloud storage.',
                    'how_to_use' => "⚡ 18 Months Plan\n⚡ 5TB cloud storage included\n⚡ You can add 5 users\n⚡ No sharing — 100% private\n⚡ No card needed\n⚡ Works in any country, no verification\n⚡ Non-warranty\n⚡ May last before 18 Months sometimes\n\n📌 100% genuine Gemini AI Pro subscription activated on your own Gmail.\n📌 FULL FAMILY ACCOUNT — it is not an invite.\n\n💖 How to activate:\nPaste the received redeem link into your browser and click 'Activate Offer'. Your subscription will then be activated successfully.\n\n⚠️ Important:\nThe redeem link must be used within 24 hours of receiving the order.",
                    'icon_url' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-gemini.png',
                    'badge' => 'POPULAR',
                    'stock_count' => 558,
                    'variants' => null,
                ],
                [
                    'id' => 2,
                    'name' => 'Canva Pro 3 Year',
                    'category' => 'Design',
                    'price_etb' => 300.00,
                    'cost_price_etb' => 160.00,
                    'description' => 'Official Canva Pro 3 Years team invitation upgrade to your personal email.',
                    'how_to_use' => "⚡ 3 Years Licensed Canva Pro Access\n⚡ Connects directly to your private email\n⚡ Magic Studio, AI image generator & background remover\n⚡ Millions of premium fonts, templates & stock media\n⚡ 1TB Cloud Storage included",
                    'icon_url' => 'https://img.icons8.com/color/480/canva.png',
                    'badge' => 'POPULAR',
                    'stock_count' => 85,
                    'variants' => null,
                ],
                [
                    'id' => 3,
                    'name' => 'Duolingo Super 12m',
                    'category' => 'Services',
                    'price_etb' => 1950.00,
                    'cost_price_etb' => 1400.00,
                    'description' => 'Super Duolingo 1 Year plan. Unlimited hearts, zero ads, and offline lessons.',
                    'how_to_use' => "⚡ Official family membership invite sent to your Duolingo email.\n⚡ Instant activation on all iOS, Android, and web devices.",
                    'icon_url' => 'https://img.icons8.com/color/480/duolingo-logo.png',
                    'badge' => null,
                    'stock_count' => 20,
                    'variants' => null,
                ],
                [
                    'id' => 4,
                    'name' => 'Mobbin 10x Seat 12m',
                    'category' => 'Design',
                    'price_etb' => 1850.00,
                    'cost_price_etb' => 1300.00,
                    'description' => 'Mobbin UI/UX Design patterns repository 12 Months shared seat.',
                    'how_to_use' => "⚡ Direct account credentials or team invite sent upon purchase.",
                    'icon_url' => 'https://img.icons8.com/ios-filled/500/m.png',
                    'badge' => null,
                    'stock_count' => 2,
                    'variants' => null,
                ],
                [
                    'id' => 5,
                    'name' => 'Telegram Premium',
                    'category' => 'Social',
                    'price_etb' => 2500.00,
                    'cost_price_etb' => 1900.00,
                    'description' => 'Official Telegram Premium subscription gift code or direct account upgrade.',
                    'how_to_use' => "⚡ Direct Gift Link or Activation\n⚡ 4GB file uploads\n⚡ Voice-to-text audio transcriptions\n⚡ Animated profile badges & emoji status\n⚡ Zero ads across all channels",
                    'icon_url' => 'https://img.icons8.com/color/480/telegram-app.png',
                    'badge' => 'POPULAR',
                    'stock_count' => 12,
                    'variants' => [
                        ['name' => '3 months', 'price_etb' => 2500.00, 'cost_price_etb' => 1900.00, 'status' => 'Available'],
                        ['name' => '6 months', 'price_etb' => 3400.00, 'cost_price_etb' => 2600.00, 'status' => 'Available'],
                        ['name' => '12 months', 'price_etb' => 6200.00, 'cost_price_etb' => 4800.00, 'status' => 'Available'],
                    ],
                ],
                [
                    'id' => 6,
                    'name' => 'SoundCloud Artist Pro',
                    'category' => 'Services',
                    'price_etb' => 400.00,
                    'cost_price_etb' => 250.00,
                    'description' => 'Unlimited track uploads, advanced audience analytics, and spotlight profile styling.',
                    'how_to_use' => "⚡ Unlimited Track Uploads\n⚡ Advanced Listener Demographics\n⚡ Monetization Ready",
                    'icon_url' => 'https://img.icons8.com/color/480/soundcloud.png',
                    'badge' => null,
                    'stock_count' => 40,
                    'variants' => null,
                ],
                [
                    'id' => 7,
                    'name' => 'Railway Hobby 12m',
                    'category' => 'Services',
                    'price_etb' => 3850.00,
                    'cost_price_etb' => 3000.00,
                    'description' => '1-Year Railway Hobby plan for hosting cloud applications and databases.',
                    'how_to_use' => "⚡ 1 Year Railway Hobby Plan\n⚡ $5/mo usage credits included\n⚡ 8GB RAM per container",
                    'icon_url' => 'https://img.icons8.com/ios-filled/500/train.png',
                    'badge' => 'POPULAR',
                    'stock_count' => 6,
                    'variants' => null,
                ],
                [
                    'id' => 8,
                    'name' => 'Replit Core 12m',
                    'category' => 'Services',
                    'price_etb' => 45000.00,
                    'cost_price_etb' => 38000.00,
                    'description' => 'Full Replit Core membership for 12 months with AI Agent code completion.',
                    'how_to_use' => "⚡ 1 Year Replit Core Plan\n⚡ Advanced AI Code Generator\n⚡ Unlimited Private Repls",
                    'icon_url' => 'https://img.icons8.com/color/480/replit.png',
                    'badge' => 'POPULAR',
                    'stock_count' => 4,
                    'variants' => null,
                ],
                [
                    'id' => 9,
                    'name' => 'NordVPN Dedicated',
                    'category' => 'VPN & Security',
                    'price_etb' => 500.00,
                    'cost_price_etb' => 320.00,
                    'description' => 'High-speed dedicated NordVPN account with ultra-secure servers.',
                    'how_to_use' => "⚡ Dedicated credentials delivered.\n⚡ Connect up to 6 devices simultaneously.",
                    'icon_url' => 'https://img.icons8.com/color/480/nordvpn.png',
                    'badge' => null,
                    'stock_count' => 15,
                    'variants' => null,
                ],
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
                p.cost_price_etb,
                p.variants_json,
                p.description,
                p.how_to_use,
                p.icon_url,
                p.badge,
                COUNT(v.id) AS stock_count
            FROM products p
            LEFT JOIN product_vault v 
                ON p.id = v.product_id AND v.is_sold = 0
            WHERE p.is_active = 1
            GROUP BY p.id, p.name, p.category, p.price_etb, p.cost_price_etb, p.variants_json, p.description, p.how_to_use, p.icon_url, p.badge
            ORDER BY p.id ASC
        ");
        $products = $stmt->fetchAll();

        // Format numerical values & decode variants
        foreach ($products as &$p) {
            $p['id'] = (int)$p['id'];
            $p['price_etb'] = (float)$p['price_etb'];
            $p['cost_price_etb'] = (float)($p['cost_price_etb'] ?? 0.00);
            $p['stock_count'] = (int)$p['stock_count'];
            $p['variants'] = !empty($p['variants_json']) ? json_decode($p['variants_json'], true) : null;
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
    $selectedVariant = trim((string)($payload['variant_name'] ?? ''));

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
        $prodStmt = $db->prepare("SELECT id, name, price_etb, cost_price_etb, variants_json, is_active FROM products WHERE id = ? FOR UPDATE");
        $prodStmt->execute([$productId]);
        $product = $prodStmt->fetch();

        if (!$product || (int)$product['is_active'] !== 1) {
            $db->rollBack();
            jsonResponse(['error' => 'Product is no longer available.'], 400);
        }

        $price = (float)$product['price_etb'];
        $costPrice = (float)($product['cost_price_etb'] ?? 0.00);

        // Check if a specific variant was selected
        if (!empty($selectedVariant) && !empty($product['variants_json'])) {
            $variants = json_decode($product['variants_json'], true);
            if (is_array($variants)) {
                foreach ($variants as $v) {
                    if (strcasecmp($v['name'] ?? '', $selectedVariant) === 0) {
                        $price = (float)($v['price'] ?? $price);
                        $costPrice = (float)($v['cost'] ?? $costPrice);
                        break;
                    }
                }
            }
        }

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

        // 7. Calculate profit and insert into orders table
        $profit = round($price - $costPrice, 2);
        $orderStmt = $db->prepare("
            INSERT INTO orders (telegram_id, product_id, selected_variant, price_paid, cost_price, profit, delivered_payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ");
        $orderStmt->execute([
            $telegramId,
            $productId,
            $selectedVariant ?: null,
            $price,
            $costPrice,
            $profit,
            $digitalPayload
        ]);
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
