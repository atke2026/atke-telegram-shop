<?php
declare(strict_types=1);

/**
 * Root Entry Point for AtkeShop Mini App
 * Automatically handles root domain requests (e.g. https://shop.atke.com.et/)
 * and routes cleanly to the frontend.
 */

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?: '/';

// 1. Static asset fallback for root /style.css, /app.js
if (in_array($path, ['/style.css', '/app.js'], true)) {
    $assetFile = __DIR__ . '/public' . $path;
    if (file_exists($assetFile)) {
        header('Content-Type: ' . (str_ends_with($path, '.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8'));
        header('Cache-Control: no-cache, must-revalidate');
        readfile($assetFile);
        exit;
    }
}

// 2. Forward /api/* requests to api folder
if (str_starts_with($path, '/api/')) {
    $apiFile = __DIR__ . $path;
    if (file_exists($apiFile) && is_file($apiFile)) {
        require $apiFile;
        exit;
    }
}

// 3. Clean 302 redirect to /public/index.html preserving query parameters
$query = $_SERVER['QUERY_STRING'] ?? '';
$target = '/public/index.html' . ($query !== '' ? '?' . $query : '');

header('Location: ' . $target, true, 302);
exit;
