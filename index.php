<?php
/**
 * Root Entry Point for Atke Digital Storefront
 */
if (file_exists(__DIR__ . '/index.html')) {
    include __DIR__ . '/index.html';
    exit;
} elseif (file_exists(__DIR__ . '/public_html/index.html')) {
    include __DIR__ . '/public_html/index.html';
    exit;
} else {
    header('Location: /public_html/index.html');
    exit;
}
