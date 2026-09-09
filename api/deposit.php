<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Authenticate user via Telegram initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];

$rawInput = file_get_contents('php://input');
$payload = json_decode($rawInput, true);

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !$payload) {
    jsonResponse(['error' => 'Invalid request data.'], 400);
}

$amount = isset($payload['amount']) ? (float)$payload['amount'] : 0.0;
$paymentMethod = trim($payload['payment_method'] ?? '');
$receiptRaw = trim($payload['receipt_raw'] ?? '');

// Validation
if ($amount <= 0) {
    jsonResponse(['error' => 'Please enter a valid deposit amount in ETB.'], 400);
}

$db = getDb(false);
$activeMethods = getStorePaymentMethods($db);
$methodMatched = false;
foreach ($activeMethods as $m) {
    if (strcasecmp($m['code'], $paymentMethod) === 0 || strcasecmp($m['name'], $paymentMethod) === 0) {
        $paymentMethod = $m['name'];
        $methodMatched = true;
        break;
    }
}
if (!$methodMatched && !empty($paymentMethod)) {
    // Allow custom named bank if provided
    $paymentMethod = htmlspecialchars(substr($paymentMethod, 0, 50), ENT_QUOTES, 'UTF-8');
} elseif (!$methodMatched) {
    jsonResponse(['error' => 'Please select a valid payment method.'], 400);
}

if (empty($receiptRaw) || mb_strlen($receiptRaw) < 5) {
    jsonResponse(['error' => 'Please paste your complete SMS confirmation or receipt reference.'], 400);
}

// ----------------------------------------------------------
// Transaction Reference / ID Extraction Engine
// ----------------------------------------------------------
function extractTransactionReference(string $text, string $method): ?string {
    $clean = trim($text);

    // 1. Check if the user simply pasted a standalone transaction code
    if (preg_match('/^[A-Za-z0-9\-_]{6,30}$/', $clean)) {
        return strtoupper($clean);
    }

    // 2. Check for URL receipt links (e.g. telebirr.et or CBE URLs)
    if (preg_match('/https?:\/\/[^\s]+/i', $clean, $matches)) {
        $url = $matches[0];
        // Parse query or last segment
        $pathParts = explode('/', parse_url($url, PHP_URL_PATH) ?? '');
        $lastSegment = end($pathParts);
        if ($lastSegment && strlen($lastSegment) >= 6) {
            return strtoupper(substr($lastSegment, 0, 30));
        }
    }

    // 3. Telebirr SMS patterns: "Transaction ID: 1048291048", "Txn ID: 9AA04K19", "Ref: CC109482"
    if (preg_match('/(?:trans(?:action)?\s*(?:id|no\.?|ref|code)?|txn\s*(?:id)?|ref(?:erence)?\s*(?:no\.?)?)\s*[:=\-]?\s*([A-Za-z0-9]{6,25})/i', $clean, $matches)) {
        return strtoupper($matches[1]);
    }

    // 4. CBE (Commercial Bank of Ethiopia) patterns: "Ref No: FT240987163", "FT[0-9]{8,15}"
    if (preg_match('/\b(FT[0-9A-Z]{8,18})\b/i', $clean, $matches)) {
        return strtoupper($matches[1]);
    }

    // 5. Fallback: find any capitalized alphanumeric code of 8-20 characters
    if (preg_match('/\b([A-Z0-9]{8,20})\b/', $clean, $matches)) {
        return strtoupper($matches[1]);
    }

    return null;
}

$extractedTxnId = extractTransactionReference($receiptRaw, $paymentMethod);

$db = getDb();

try {
    // Check for duplicate transaction ID if an ID was extracted
    if ($extractedTxnId !== null) {
        $dupStmt = $db->prepare("SELECT id, status, created_at FROM deposits WHERE extracted_txn_id = ? LIMIT 1");
        $dupStmt->execute([$extractedTxnId]);
        $existing = $dupStmt->fetch();

        if ($existing) {
            jsonResponse([
                'error' => "This transaction reference ({$extractedTxnId}) was already submitted on {$existing['created_at']} (Status: {$existing['status']}). Duplicate submissions are not permitted.",
            ], 409);
        }
    }

    // Insert deposit request into DB
    $stmt = $db->prepare("
        INSERT INTO deposits (telegram_id, amount, payment_method, receipt_raw, extracted_txn_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', NOW())
    ");
    $stmt->execute([
        $telegramId,
        $amount,
        $paymentMethod,
        $receiptRaw,
        $extractedTxnId,
    ]);
    $depositId = (int)$db->lastInsertId();

    // ----------------------------------------------------------
    // Alert Admin via Telegram Bot API with Inline Action Buttons
    // ----------------------------------------------------------
    if (ADMIN_CHAT_ID > 0) {
        $userName = htmlspecialchars($authUser['first_name'] ?? 'User', ENT_QUOTES, 'UTF-8');
        $userHandle = !empty($authUser['username']) ? '@' . htmlspecialchars($authUser['username'], ENT_QUOTES, 'UTF-8') : 'No username';

        $safeReceipt = htmlspecialchars(mb_substr($receiptRaw, 0, 400), ENT_QUOTES, 'UTF-8');
        if (mb_strlen($receiptRaw) > 400) {
            $safeReceipt .= '...';
        }

        $adminMessage = "⚡ <b>NEW DEPOSIT REQUEST (#{$depositId})</b>\n\n"
            . "👤 <b>Customer:</b> {$userName} ({$userHandle})\n"
            . "🆔 <b>Telegram ID:</b> <code>{$telegramId}</code>\n"
            . "💰 <b>Claimed Amount:</b> <b>" . number_format($amount, 2) . " ETB</b>\n"
            . "🏦 <b>Payment Method:</b> <b>{$paymentMethod}</b>\n"
            . "🔖 <b>Extracted Txn:</b> <code>" . ($extractedTxnId ?: 'Manual Review Needed') . "</code>\n\n"
            . "📄 <b>Receipt Text:</b>\n"
            . "<blockquote>{$safeReceipt}</blockquote>\n\n"
            . "<i>Tap an action below after verifying the funds in your {$paymentMethod} account:</i>";

        $inlineKeyboard = [
            'inline_keyboard' => [
                [
                    [
                        'text'          => "✅ Approve " . number_format($amount, 0) . " ETB",
                        'callback_data' => "approve_{$depositId}",
                    ],
                    [
                        'text'          => "❌ Reject",
                        'callback_data' => "reject_{$depositId}",
                    ],
                ]
            ]
        ];

        sendBotMessage(ADMIN_CHAT_ID, $adminMessage, $inlineKeyboard);
    }

    jsonResponse([
        'status'           => 'success',
        'deposit_id'       => $depositId,
        'extracted_txn_id' => $extractedTxnId,
        'amount'           => $amount,
        'payment_method'   => $paymentMethod,
        'message'          => 'Deposit submitted successfully! Our team will verify and credit your wallet shortly.',
    ]);

} catch (Exception $e) {
    error_log('Deposit Submission Error: ' . $e->getMessage());
    jsonResponse(['error' => 'Failed to record deposit. Please try again.'], 500);
}
