<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Ensure user is authenticated via Telegram WebApp initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];
$firstName = trim($authUser['first_name'] ?? '');
$username = !empty($authUser['username']) ? trim($authUser['username']) : null;

$db = getDb(false);

if ($db === null) {
    $devRole = getUserRole($telegramId, null);
    jsonResponse([
        'status' => 'success',
        'user' => [
            'id'               => $telegramId,
            'telegram_id'      => $telegramId,
            'first_name'       => $firstName ?: 'User',
            'username'         => $username,
            'wallet_balance'   => 0.00,
            'role'             => $devRole,
            'referral_count'   => 0,
            'orders_count'     => 0,
            'pending_deposits' => 0,
            'referral_link'    => sprintf('https://t.me/%s?start=ref_%s', BOT_USERNAME, $telegramId),
            'is_admin'         => ($devRole === 'admin'),
            'is_staff'         => ($devRole === 'admin' || $devRole === 'staff'),
            'created_at'       => date('Y-m-d H:i:s'),
        ],
        'payment_methods'   => getStorePaymentMethods($db),
        'bot_username'      => BOT_USERNAME,
        'support_handle'    => SUPPORT_TELEGRAM_HANDLE,
        'marketing_channel' => MARKETING_CHANNEL_ID,
    ]);
}

try {
    // 1. Check if user already exists
    $stmt = $db->prepare("SELECT id, telegram_id, first_name, username, wallet_balance, role, referred_by, created_at FROM users WHERE telegram_id = ? LIMIT 1");
    $stmt->execute([$telegramId]);
    $userRecord = $stmt->fetch();

    $userRole = 'customer';

    if (!$userRecord) {
        // Handle referral parameter if passed in start_param (e.g. ref_123456789)
        $referredBy = null;
        if (!empty($authUser['start_param']) && preg_match('/^ref_(\d+)$/', (string)$authUser['start_param'], $matches)) {
            $refId = (int)$matches[1];
            // Ensure referrer is not the user themselves
            if ($refId !== $telegramId) {
                // Check if referrer exists in DB
                $chk = $db->prepare("SELECT telegram_id FROM users WHERE telegram_id = ? LIMIT 1");
                $chk->execute([$refId]);
                if ($chk->fetch()) {
                    $referredBy = $refId;
                }
            }
        }

        // Check if this newly joining user is configured as the owner/admin
        $initialRole = (ADMIN_CHAT_ID > 0 && $telegramId === ADMIN_CHAT_ID) ? 'admin' : 'customer';

        // Insert new user
        $insertStmt = $db->prepare("
            INSERT INTO users (telegram_id, first_name, username, wallet_balance, role, referred_by, created_at)
            VALUES (?, ?, ?, 0.00, ?, ?, NOW())
        ");
        $insertStmt->execute([$telegramId, $firstName, $username, $initialRole, $referredBy]);

        // Re-fetch created record
        $stmt->execute([$telegramId]);
        $userRecord = $stmt->fetch();
        $userRole = $initialRole;
    } else {
        // Update user profile info (name/username change)
        $updateStmt = $db->prepare("UPDATE users SET first_name = ?, username = ? WHERE telegram_id = ?");
        $updateStmt->execute([$firstName, $username, $telegramId]);
        $userRecord['first_name'] = $firstName;
        $userRecord['username'] = $username;

        // Auto-promote configured owner to admin if not already set
        if (ADMIN_CHAT_ID > 0 && $telegramId === ADMIN_CHAT_ID && ($userRecord['role'] ?? '') !== 'admin') {
            $db->prepare("UPDATE users SET role = 'admin' WHERE telegram_id = ?")->execute([$telegramId]);
            $userRecord['role'] = 'admin';
        }
        $userRole = $userRecord['role'] ?? 'customer';
    }

    // 2. Fetch user statistics
    // Total referral count
    $refStmt = $db->prepare("SELECT COUNT(*) AS total_referred FROM users WHERE referred_by = ?");
    $refStmt->execute([$telegramId]);
    $referralCount = (int)($refStmt->fetchColumn() ?: 0);

    // Total orders count
    $ordStmt = $db->prepare("SELECT COUNT(*) AS total_orders FROM orders WHERE telegram_id = ?");
    $ordStmt->execute([$telegramId]);
    $ordersCount = (int)($ordStmt->fetchColumn() ?: 0);

    // Total pending deposits count
    $depStmt = $db->prepare("SELECT COUNT(*) AS pending_deposits FROM deposits WHERE telegram_id = ? AND status = 'pending'");
    $depStmt->execute([$telegramId]);
    $pendingDeposits = (int)($depStmt->fetchColumn() ?: 0);

    $isAdmin = ($userRole === 'admin' || (ADMIN_CHAT_ID > 0 && $telegramId === ADMIN_CHAT_ID));
    $isStaff = ($isAdmin || $userRole === 'staff');

    // 3. Return authenticated response
    jsonResponse([
        'status' => 'success',
        'user' => [
            'id'               => (int)$userRecord['id'],
            'telegram_id'      => (int)$userRecord['telegram_id'],
            'first_name'       => $userRecord['first_name'],
            'username'         => $userRecord['username'],
            'wallet_balance'   => (float)$userRecord['wallet_balance'],
            'role'             => $userRole,
            'referral_count'   => $referralCount,
            'orders_count'     => $ordersCount,
            'pending_deposits' => $pendingDeposits,
            'referral_link'    => sprintf('https://t.me/%s?start=ref_%s', BOT_USERNAME, $telegramId),
            'is_admin'         => $isAdmin,
            'is_staff'         => $isStaff,
            'created_at'       => $userRecord['created_at'],
        ],
        'payment_methods'   => getStorePaymentMethods($db),
        'bot_username'      => BOT_USERNAME,
        'support_handle'    => SUPPORT_TELEGRAM_HANDLE,
        'marketing_channel' => MARKETING_CHANNEL_ID,
    ]);

} catch (Exception $e) {
    error_log('Auth Error: ' . $e->getMessage());
    jsonResponse(['error' => 'Authentication processing error.'], 500);
}
