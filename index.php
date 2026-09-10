<?php
declare(strict_types=1);

/**
 * Root Entry Point for AtkeShop Mini App
 * Automatically handles root domain requests (e.g. https://shop.atke.com.et/)
 * and routes to the frontend without requiring /public/index.html in the URL.
 */

// If requested file exists in public directory, pass through
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?: '/';

// If request is for /api/*, forward to api
if (str_starts_with($path, '/api/')) {
    $apiFile = __DIR__ . $path;
    if (file_exists($apiFile) && is_file($apiFile)) {
        require $apiFile;
        exit;
    }
}

// Serve the mini app frontend
$indexHtml = __DIR__ . '/public/index.html';
if (file_exists($indexHtml)) {
    // Set appropriate headers
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache, must-revalidate');
    readfile($indexHtml);
    exit;
}

// Fallback error
http_response_code(404);
echo "Application frontend not found.";
exit;
