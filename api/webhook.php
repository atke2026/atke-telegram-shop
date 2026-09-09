<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Telegram webhook always sends POST requests with JSON payload
$rawInput = file_get_contents('php://input');
if (empty($rawInput)) {
    http_response_code(200);
    echo "Telegram Webhook Endpoint active.";
    exit;
}

$update = json_decode($rawInput, true);
if (!$update) {
    http_response_code(200);
    exit;
}

$db = getDb();

try {
    // ==========================================================
    // 1. HANDLE INCOMING MESSAGES (e.g. /start command)
    // ==========================================================
    if (isset($update['message'])) {
        $message = $update['message'];
        $chatId = $message['chat']['id'];
        $userId = (int)($message['from']['id'] ?? $chatId);
        $firstName = $message['from']['first_name'] ?? 'User';
        $username = $message['from']['username'] ?? null;
        $text = trim($message['text'] ?? '');

        // Handle /start and deep-linking referral codes
        if (str_starts_with($text, '/start')) {
            $startParam = trim(substr($text, 6)); // e.g. "ref_123456789"
            $referredBy = null;
            $walletBalance = 0.00;

            if ($db !== null) {
                if (preg_match('/^ref_(\d+)$/', $startParam, $matches)) {
                    $refId = (int)$matches[1];
                    if ($refId !== $userId) {
                        try {
                            $chk = $db->prepare("SELECT telegram_id FROM users WHERE telegram_id = ? LIMIT 1");
                            $chk->execute([$refId]);
                            if ($chk->fetch()) {
                                $referredBy = $refId;
                            }
                        } catch (Exception $e) {
                            error_log("Referral check error: " . $e->getMessage());
                        }
                    }
                }

                // Upsert user into database
                try {
                    $userStmt = $db->prepare("SELECT id, wallet_balance FROM users WHERE telegram_id = ? LIMIT 1");
                    $userStmt->execute([$userId]);
                    $existingUser = $userStmt->fetch();

                    if (!$existingUser) {
                        $insStmt = $db->prepare("
                            INSERT INTO users (telegram_id, first_name, username, wallet_balance, referred_by, created_at)
                            VALUES (?, ?, ?, 0.00, ?, NOW())
                        ");
                        $insStmt->execute([$userId, $firstName, $username, $referredBy]);
                        $walletBalance = 0.00;
                    } else {
                        $walletBalance = (float)$existingUser['wallet_balance'];
                        // Update profile info
                        $updStmt = $db->prepare("UPDATE users SET first_name = ?, username = ? WHERE telegram_id = ?");
                        $updStmt->execute([$firstName, $username, $userId]);
                    }
                } catch (Exception $e) {
                    error_log("Webhook User Upsert Error: " . $e->getMessage());
                    $walletBalance = 0.00;
                }
            }

            // Construct Mini App Launch URL
            $miniAppUrl = rtrim(APP_URL, '/') . '/public/index.html';

            $welcomeText = "👋 <b>Welcome to YeneShop Digital Store, " . htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8') . "!</b>\n\n"
                . "⚡ <b>Instant Delivery for Premium Digital Accounts & Keys:</b>\n"
                . "• Google Gemini 1.5 Advanced\n"
                . "• Canva Pro 1-Year Invites\n"
                . "• Telegram Premium Subscriptions\n"
                . "• NordVPN, ChatGPT Plus, and Spotify\n\n"
                . "💳 <b>Your Wallet Balance:</b> <b>" . number_format($walletBalance, 2) . " ETB</b>\n\n"
                . "👇 Tap <b>Open Store</b> below to start browsing with zero fees!";

            $keyboardButtons = [
                [
                    [
                        'text'    => '🛍️ Open Store (Mini App)',
                        'web_app' => ['url' => $miniAppUrl]
                    ]
                ],
                [
                    [
                        'text'          => '💳 How to Deposit',
                        'callback_data' => 'menu_deposit_guide'
                    ],
                    [
                        'text'          => '💼 My Wallet Balance',
                        'callback_data' => 'menu_check_balance'
                    ]
                ]
            ];

            // If the user is the store administrator, add the Admin Dashboard button
            if (ADMIN_CHAT_ID > 0 && $userId === ADMIN_CHAT_ID) {
                $keyboardButtons[] = [
                    [
                        'text'    => '👑 Admin Dashboard',
                        'web_app' => ['url' => $miniAppUrl . '?tab=admin']
                    ]
                ];
            }

            $replyMarkup = ['inline_keyboard' => $keyboardButtons];

            sendBotMessage($chatId, $welcomeText, $replyMarkup);
            http_response_code(200);
            echo json_encode(['ok' => true]);
            exit;
        }

        // Handle /admin command for quick store administration
        if (str_starts_with($text, '/admin')) {
            if (ADMIN_CHAT_ID > 0 && $userId !== ADMIN_CHAT_ID) {
                sendBotMessage($chatId, "⛔ <b>Access Denied:</b> This command is restricted to the store administrator.");
                http_response_code(200);
                exit;
            }

            $miniAppUrl = rtrim(APP_URL, '/') . '/public/index.html?tab=admin';

            $adminText = "👑 <b>Store Admin Control Center</b>\n\n"
                . "Welcome, Admin! From here you can manage all store operations:\n"
                . "• 🏷️ Update product prices & ETB rates\n"
                . "• 🖼️ Update product images & icons\n"
                . "• 🔑 Bulk upload digital keys, accounts & licenses\n"
                . "• 💳 Review & approve customer deposits\n\n"
                . "Tap below to launch your in-app <b>Admin Dashboard</b>:";

            $adminMarkup = [
                'inline_keyboard' => [
                    [
                        [
                            'text'    => '👑 Launch Admin Dashboard',
                            'web_app' => ['url' => $miniAppUrl]
                        ]
                    ],
                    [
                        [
                            'text'          => '📊 Quick Sales Stats',
                            'callback_data' => 'admin_quick_stats'
                        ]
                    ]
                ]
            ];

            sendBotMessage($chatId, $adminText, $adminMarkup);
            http_response_code(200);
            echo json_encode(['ok' => true]);
            exit;
        }
    }

// ==========================================================
// 2. HANDLE CALLBACK QUERIES (Admin Approvals & User Menus)
// ==========================================================
if (isset($update['callback_query'])) {
    $cb = $update['callback_query'];
    $callbackId = $cb['id'];
    $callbackUserId = (int)$cb['from']['id'];
    $callbackData = $cb['data'] ?? '';
    $message = $cb['message'] ?? null;
    $chatId = $message['chat']['id'] ?? null;
    $messageId = $message['message_id'] ?? null;

    // A. Check Balance Menu Callback
    if ($callbackData === 'menu_check_balance') {
        $bal = 0.00;
        if ($db !== null) {
            try {
                $stmt = $db->prepare("SELECT wallet_balance FROM users WHERE telegram_id = ? LIMIT 1");
                $stmt->execute([$callbackUserId]);
                $bal = (float)($stmt->fetchColumn() ?: 0.00);
            } catch (Exception $e) {
                error_log("Balance check error: " . $e->getMessage());
            }
        }

        answerCallbackQuery($callbackId, "💳 Your balance: " . number_format($bal, 2) . " ETB", true);
        http_response_code(200);
        exit;
    }

    // B. Deposit Guide Menu Callback
    if ($callbackData === 'menu_deposit_guide') {
        $guide = "📌 <b>How to Add Funds:</b>\n\n"
            . "1. Transfer desired ETB to our verified accounts:\n"
            . "   • <b>Telebirr:</b> <code>" . PAYMENT_TELEBIRR_PHONE . "</code> (" . PAYMENT_TELEBIRR_NAME . ")\n"
            . "   • <b>CBE Bank:</b> <code>" . PAYMENT_CBE_ACCOUNT . "</code> (" . PAYMENT_CBE_NAME . ")\n\n"
            . "2. Open the Mini App > <b>Wallet</b> tab.\n"
            . "3. Paste your confirmation SMS or transaction ID.\n"
            . "4. Funds are credited instantly upon verification!";

        answerCallbackQuery($callbackId);
        if ($chatId) {
            sendBotMessage($chatId, $guide);
        }
        http_response_code(200);
        exit;
    }

    // C. Admin Quick Stats Callback
    if ($callbackData === 'admin_quick_stats') {
        if (ADMIN_CHAT_ID > 0 && $callbackUserId !== ADMIN_CHAT_ID) {
            answerCallbackQuery($callbackId, "⛔ Unauthorized.", true);
            http_response_code(200);
            exit;
        }

        if ($db === null) {
            answerCallbackQuery($callbackId, "⚠️ Database setup pending in Plesk.", true);
            http_response_code(200);
            exit;
        }

        try {
            $usersCount = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
            $orderStats = $db->query("SELECT COUNT(*) AS total_orders, COALESCE(SUM(price_paid), 0) AS total_revenue FROM orders")->fetch();
            $depCount = (int)$db->query("SELECT COUNT(*) FROM deposits WHERE status = 'pending'")->fetchColumn();
            $keysCount = (int)$db->query("SELECT COUNT(*) FROM product_vault WHERE is_sold = 0")->fetchColumn();

            $statsMsg = "📊 <b>Live Store Snapshot:</b>\n\n"
                . "👥 <b>Registered Users:</b> " . number_format($usersCount) . "\n"
                . "📦 <b>Orders Delivered:</b> " . number_format((int)$orderStats['total_orders']) . "\n"
                . "💰 <b>Gross Revenue:</b> " . number_format((float)$orderStats['total_revenue'], 2) . " ETB\n"
                . "🔑 <b>Unsold Keys in Vault:</b> " . number_format($keysCount) . "\n"
                . "⏳ <b>Pending Deposits:</b> " . number_format($depCount) . "\n\n"
                . "<i>Tap below to open full management controls:</i>";

            $miniAppUrl = rtrim(APP_URL, '/') . '/public/index.html?tab=admin';
            $btn = [
                'inline_keyboard' => [
                    [
                        [
                            'text'    => '👑 Open In-App Admin',
                            'web_app' => ['url' => $miniAppUrl]
                        ]
                    ]
                ]
            ];

            answerCallbackQuery($callbackId);
            if ($chatId) {
                sendBotMessage($chatId, $statsMsg, $btn);
            }
        } catch (Exception $e) {
            answerCallbackQuery($callbackId, "Error loading stats.", true);
        }

        http_response_code(200);
        exit;
    }

    // D. Admin Action: Approve Deposit
    if (str_starts_with($callbackData, 'approve_')) {
        // Security check: Only configured admin can approve
        if ($callbackUserId !== ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 0) {
            answerCallbackQuery($callbackId, "⛔ Unauthorized. Admin access only.", true);
            http_response_code(200);
            exit;
        }

        if ($db === null) {
            answerCallbackQuery($callbackId, "Database unavailable.", true);
            http_response_code(200);
            exit;
        }

        $depositId = (int)substr($callbackData, 8);

        try {
            $db->beginTransaction();

            $depStmt = $db->prepare("SELECT * FROM deposits WHERE id = ? FOR UPDATE");
            $depStmt->execute([$depositId]);
            $deposit = $depStmt->fetch();

            if (!$deposit) {
                $db->rollBack();
                answerCallbackQuery($callbackId, "Deposit record not found.", true);
                http_response_code(200);
                exit;
            }

            if ($deposit['status'] !== 'pending') {
                $db->rollBack();
                answerCallbackQuery($callbackId, "Deposit already " . strtoupper($deposit['status']) . "!", true);
                http_response_code(200);
                exit;
            }

            $userTgId = (int)$deposit['telegram_id'];
            $amount = (float)$deposit['amount'];

            // Update deposit status
            $updDep = $db->prepare("UPDATE deposits SET status = 'approved', reviewed_at = NOW() WHERE id = ?");
            $updDep->execute([$depositId]);

            // Credit user wallet
            $creditUser = $db->prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE telegram_id = ?");
            $creditUser->execute([$amount, $userTgId]);

            // Fetch new balance
            $balStmt = $db->prepare("SELECT wallet_balance, first_name FROM users WHERE telegram_id = ?");
            $balStmt->execute([$userTgId]);
            $userData = $balStmt->fetch();
            $newBalance = (float)($userData['wallet_balance'] ?? $amount);

            $db->commit();

            answerCallbackQuery($callbackId, "✅ Deposit #{$depositId} approved! Credited {$amount} ETB.");

            // Update admin message to show final status without action buttons
            if ($chatId && $messageId) {
                $updatedAdminText = ($message['text'] ?? '') . "\n\n"
                    . "━━━━━━━━━━━━━━━━━━━━\n"
                    . "✅ <b>APPROVED by Admin @" . ($cb['from']['username'] ?? $callbackUserId) . "</b>\n"
                    . "💰 <b>Credited:</b> +" . number_format($amount, 2) . " ETB\n"
                    . "💳 <b>Customer Balance:</b> " . number_format($newBalance, 2) . " ETB\n"
                    . "🕒 <b>Processed:</b> " . date('Y-m-d H:i:s');

                editMessageText($chatId, $messageId, $updatedAdminText, null);
            }

            // Dispatch Celebration Notification DM to customer
            $customerMsg = "🎉 <b>DEPOSIT APPROVED!</b>\n\n"
                . "Your deposit of <b>" . number_format($amount, 2) . " ETB</b> via <b>" . htmlspecialchars($deposit['payment_method']) . "</b> has been confirmed and credited.\n\n"
                . "💳 <b>Your Current Wallet Balance:</b> <b>" . number_format($newBalance, 2) . " ETB</b>\n\n"
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

        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log("Approval Error: " . $e->getMessage());
            answerCallbackQuery($callbackId, "Server error processing approval.", true);
        }

        http_response_code(200);
        exit;
    }

    // D. Admin Action: Reject Deposit
    if (str_starts_with($callbackData, 'reject_')) {
        if ($callbackUserId !== ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 0) {
            answerCallbackQuery($callbackId, "⛔ Unauthorized. Admin access only.", true);
            http_response_code(200);
            exit;
        }

        if ($db === null) {
            answerCallbackQuery($callbackId, "Database unavailable.", true);
            http_response_code(200);
            exit;
        }

        $depositId = (int)substr($callbackData, 7);

        try {
            $depStmt = $db->prepare("SELECT * FROM deposits WHERE id = ? LIMIT 1");
            $depStmt->execute([$depositId]);
            $deposit = $depStmt->fetch();

            if ($deposit && $deposit['status'] === 'pending') {
                $upd = $db->prepare("UPDATE deposits SET status = 'rejected', reviewed_at = NOW() WHERE id = ?");
                $upd->execute([$depositId]);

                answerCallbackQuery($callbackId, "❌ Deposit #{$depositId} has been rejected.");

                if ($chatId && $messageId) {
                    $updatedAdminText = ($message['text'] ?? '') . "\n\n"
                        . "━━━━━━━━━━━━━━━━━━━━\n"
                        . "❌ <b>REJECTED by Admin @" . ($cb['from']['username'] ?? $callbackUserId) . "</b>\n"
                        . "🕒 <b>Time:</b> " . date('Y-m-d H:i:s');

                    editMessageText($chatId, $messageId, $updatedAdminText, null);
                }

                // Notify customer of rejection
                $custFailMsg = "⚠️ <b>Deposit Request Update</b>\n\n"
                    . "Your deposit request for <b>" . number_format((float)$deposit['amount'], 2) . " ETB</b> (Txn: " . ($deposit['extracted_txn_id'] ?? 'N/A') . ") could not be verified.\n\n"
                    . "Please ensure the transaction was successful and that the exact reference number was provided. If you believe this is an error, please contact customer support.";

                sendBotMessage((int)$deposit['telegram_id'], $custFailMsg);
            } else {
                answerCallbackQuery($callbackId, "Deposit already processed or not found.", true);
            }
        } catch (Exception $e) {
            error_log("Rejection Error: " . $e->getMessage());
            answerCallbackQuery($callbackId, "Server error.", true);
        }

        http_response_code(200);
        exit;
    }
}
} catch (\Throwable $e) {
    error_log("Unhandled Webhook Error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
}

http_response_code(200);
echo json_encode(['ok' => true]);
