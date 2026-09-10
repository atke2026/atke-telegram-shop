<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Authenticate user via Telegram initData
$authUser = getAuthenticatedUser();
$telegramId = (int)$authUser['id'];

// Check if request is JSON or multipart/form-data
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isMultipart = str_contains(strtolower($contentType), 'multipart/form-data');

$amount = 0.0;
$paymentMethod = '';
$receiptRaw = '';
$receiptImageBase64 = '';

if ($isMultipart) {
    $amount = isset($_POST['amount']) ? (float)$_POST['amount'] : 0.0;
    $paymentMethod = trim($_POST['payment_method'] ?? '');
    $receiptRaw = trim($_POST['receipt_raw'] ?? '');
} else {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);
    if ($payload) {
        $amount = isset($payload['amount']) ? (float)$payload['amount'] : 0.0;
        $paymentMethod = trim($payload['payment_method'] ?? '');
        $receiptRaw = trim($payload['receipt_raw'] ?? '');
        $receiptImageBase64 = trim($payload['receipt_image_base64'] ?? '');
    }
}

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

// ----------------------------------------------------------
// Process Screenshot Receipt Upload (if attached)
// ----------------------------------------------------------
$receiptImageUrl = null;
$uploadDir = __DIR__ . '/../public/uploads/receipts';

if (!is_dir($uploadDir)) {
    @mkdir($uploadDir, 0755, true);
}

// 1. Check $_FILES['receipt_image']
if (!empty($_FILES['receipt_image']['tmp_name'])) {
    $file = $_FILES['receipt_image'];
    if ($file['error'] === UPLOAD_ERR_OK) {
        // Max 20MB check
        if ($file['size'] > 20 * 1024 * 1024) {
            jsonResponse(['error' => 'Receipt screenshot exceeds 20 MB limit.'], 400);
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($file['tmp_name']);
        $allowedMimes = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
        ];

        if (!isset($allowedMimes[$mime])) {
            jsonResponse(['error' => 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF.'], 400);
        }

        $ext = $allowedMimes[$mime];
        $filename = 'receipt_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $targetPath = $uploadDir . '/' . $filename;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $receiptImageUrl = 'uploads/receipts/' . $filename;
        }
    }
} elseif (!empty($receiptImageBase64)) {
    // 2. Base64 payload support
    if (preg_match('/^data:image\/(jpeg|png|webp|gif);base64,(.*)$/i', $receiptImageBase64, $matches)) {
        $ext = strtolower($matches[1]) === 'jpeg' ? 'jpg' : strtolower($matches[1]);
        $binary = base64_decode($matches[2]);
        if ($binary !== false && strlen($binary) <= 20 * 1024 * 1024) {
            $filename = 'receipt_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
            $targetPath = $uploadDir . '/' . $filename;
            if (file_put_contents($targetPath, $binary) !== false) {
                $receiptImageUrl = 'uploads/receipts/' . $filename;
            }
        }
    }
}

// Require either SMS text OR an uploaded receipt screenshot
if (empty($receiptRaw) && empty($receiptImageUrl)) {
    jsonResponse(['error' => 'Please paste your SMS confirmation message or upload a receipt screenshot.'], 400);
}

if (empty($receiptRaw) && !empty($receiptImageUrl)) {
    $receiptRaw = '[Receipt Screenshot Uploaded]';
}

// ----------------------------------------------------------
// Transaction Reference / ID Extraction Engine
// ----------------------------------------------------------
function extractTransactionReference(string $text, string $method): ?string {
    $clean = trim($text);
    if (empty($clean) || str_starts_with($clean, '[Receipt')) {
        return null;
    }

    // 1. Check if user pasted a standalone transaction code
    if (preg_match('/^[A-Za-z0-9\-_]{6,30}$/', $clean)) {
        return strtoupper($clean);
    }

    // 2. Check for URL receipt links (e.g. telebirr.et or CBE URLs)
    if (preg_match('/https?:\/\/[^\s]+/i', $clean, $matches)) {
        $url = $matches[0];
        $pathParts = explode('/', parse_url($url, PHP_URL_PATH) ?? '');
        $lastSegment = end($pathParts);
        if ($lastSegment && strlen($lastSegment) >= 6) {
            return strtoupper(substr($lastSegment, 0, 30));
        }
    }

    // 3. Telebirr SMS patterns: "Transaction ID: 1048291048", "Txn ID: 9AA04K19", "Ref: CC109482"
    if (preg_match('/(?:trans(?:action)?\s*(?:id|no\.?|ref|code)?|txn\s*(?:id)?|(?:reference|ref)\s*(?:no\.?)?)\s*[:=\-]?\s*([A-Za-z0-9]{6,25})/i', $clean, $matches)) {
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
        INSERT INTO deposits (telegram_id, amount, payment_method, receipt_raw, receipt_image_url, extracted_txn_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())
    ");
    $stmt->execute([
        $telegramId,
        $amount,
        $paymentMethod,
        $receiptRaw,
        $receiptImageUrl,
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

        if (!empty($receiptImageUrl)) {
            $fullImageUrl = rtrim(APP_URL, '/') . '/public/' . $receiptImageUrl;
            sendBotPhoto(ADMIN_CHAT_ID, $fullImageUrl, $adminMessage, $inlineKeyboard);
        } else {
            sendBotMessage(ADMIN_CHAT_ID, $adminMessage, $inlineKeyboard);
        }
    }

    jsonResponse([
        'status'            => 'success',
        'deposit_id'        => $depositId,
        'extracted_txn_id'  => $extractedTxnId,
        'amount'            => $amount,
        'payment_method'    => $paymentMethod,
        'receipt_image_url' => $receiptImageUrl,
        'message'           => 'Deposit submitted successfully! Our team will verify and credit your wallet shortly.',
    ]);

} catch (Exception $e) {
    error_log('Deposit Submission Error: ' . $e->getMessage());
    jsonResponse(['error' => 'Failed to record deposit. Please try again.'], 500);
}
