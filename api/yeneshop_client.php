<?php
declare(strict_types=1);

/**
 * YeneShop Reseller API Client
 * Official Integration Service for https://yeneshop.amixmon.com/api/reseller/v1
 */

require_once __DIR__ . '/config.php';

class YeneShopClient {
    private string $baseUrl;
    private string $mode;
    private string $apiKey;
    private string $keysFilePath;

    public function __construct(?string $mode = null) {
        $this->baseUrl = rtrim(defined('YENESHOP_API_BASE_URL') ? YENESHOP_API_BASE_URL : 'https://yeneshop.amixmon.com/api/reseller/v1', '/');
        $this->keysFilePath = __DIR__ . '/reseller_keys.json';
        
        $keys = $this->loadPersistedKeys();
        $this->mode = $mode ?? ($keys['mode'] ?? (defined('YENESHOP_API_MODE') ? YENESHOP_API_MODE : 'sandbox'));
        
        if ($this->mode === 'live') {
            $this->apiKey = $keys['live_key'] ?? (defined('YENESHOP_LIVE_KEY') ? YENESHOP_LIVE_KEY : '');
        } else {
            $this->apiKey = $keys['sandbox_key'] ?? (defined('YENESHOP_SANDBOX_KEY') ? YENESHOP_SANDBOX_KEY : '');
        }
    }

    public function getMode(): string {
        return $this->mode;
    }

    public function setMode(string $mode): void {
        $this->mode = in_array($mode, ['sandbox', 'live'], true) ? $mode : 'sandbox';
        $keys = $this->loadPersistedKeys();
        $keys['mode'] = $this->mode;
        $this->savePersistedKeys($keys);
        
        if ($this->mode === 'live') {
            $this->apiKey = $keys['live_key'] ?? '';
        } else {
            $this->apiKey = $keys['sandbox_key'] ?? '';
        }
    }

    public function loadPersistedKeys(): array {
        if (file_exists($this->keysFilePath)) {
            $content = @file_get_contents($this->keysFilePath);
            if ($content) {
                $data = json_decode($content, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }
        return [
            'mode' => 'sandbox',
            'sandbox_key' => '',
            'live_key' => '',
            'sandbox_balance' => 100000.00,
            'sandbox_orders' => []
        ];
    }

    public function savePersistedKeys(array $keys): bool {
        $current = $this->loadPersistedKeys();
        $merged = array_merge($current, $keys);
        return (bool)@file_put_contents($this->keysFilePath, json_encode($merged, JSON_PRETTY_PRINT));
    }

    public function resetSandboxFunds(): float {
        $keys = $this->loadPersistedKeys();
        $keys['sandbox_balance'] = 100000.00;
        $this->savePersistedKeys($keys);
        return 100000.00;
    }

    /**
     * Send HTTP request to YeneShop Reseller API
     */
    private function request(string $endpoint, string $method = 'GET', ?array $body = null): array {
        $cleanEndpoint = '/' . ltrim($endpoint, '/');
        $url = $this->baseUrl . $cleanEndpoint;

        // If no active API key provided yet, return graceful fallback / sandbox simulation
        if (empty($this->apiKey)) {
            return $this->simulateResponse($cleanEndpoint, $method, $body);
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

        $headers = [
            'Accept: application/json',
            'Authorization: Bearer ' . $this->apiKey,
            'User-Agent: YeneShop-Reseller-Client/1.0'
        ];

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            $jsonBody = json_encode($body ?? []);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($jsonBody);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            // Network fallback
            return [
                'status' => 'error',
                'http_code' => 500,
                'error' => 'Connection to YeneShop API failed: ' . $curlError,
                'fallback' => $this->simulateResponse($cleanEndpoint, $method, $body)
            ];
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            return [
                'status' => 'error',
                'http_code' => $httpCode,
                'error' => 'Invalid JSON from upstream API',
                'raw' => substr($response, 0, 500)
            ];
        }

        $decoded['http_code'] = $httpCode;
        return $decoded;
    }

    /**
     * GET /balance
     */
    public function getBalance(): array {
        return $this->request('/balance', 'GET');
    }

    /**
     * GET /products
     */
    public function getProducts(): array {
        return $this->request('/products', 'GET');
    }

    /**
     * POST /orders
     */
    public function createOrder(string $externalId, $productId, ?string $customerInput = null): array {
        $body = [
            'externalId' => substr($externalId, 0, 100),
            'productId' => $productId,
        ];
        if (!empty($customerInput)) {
            $body['customerInput'] = $customerInput;
        }
        return $this->request('/orders', 'POST', $body);
    }

    /**
     * GET /orders
     */
    public function getOrders(): array {
        return $this->request('/orders', 'GET');
    }

    /**
     * GET /orders/:externalId
     */
    public function getOrderByExternalId(string $externalId): array {
        return $this->request('/orders/' . urlencode($externalId), 'GET');
    }

    /**
     * Simulation fallback matching YeneShop video recording
     */
    private function simulateResponse(string $endpoint, string $method, ?array $body): array {
        $keys = $this->loadPersistedKeys();

        if ($endpoint === '/balance') {
            return [
                'status' => 'success',
                'balance' => $this->mode === 'live' ? 0.00 : (float)($keys['sandbox_balance'] ?? 100000.00),
                'live_wallet' => 0.00,
                'sandbox_wallet' => (float)($keys['sandbox_balance'] ?? 100000.00),
                'currency' => 'ETB',
                'mode' => $this->mode
            ];
        }

        if ($endpoint === '/products') {
            return [
                'status' => 'success',
                'count' => 16,
                'products' => $this->getDefaultResellerCatalogue()
            ];
        }

        if ($endpoint === '/orders' && $method === 'POST') {
            $externalId = (string)($body['externalId'] ?? ('ord_' . uniqid()));
            $productId = $body['productId'] ?? null;
            $customerInput = $body['customerInput'] ?? null;

            $catalog = $this->getDefaultResellerCatalogue();
            $matched = null;
            foreach ($catalog as $item) {
                if ($item['id'] == $productId) {
                    $matched = $item;
                    break;
                }
            }

            $price = $matched ? (float)$matched['resellerPrice'] : 500.00;
            $currentBal = (float)($keys['sandbox_balance'] ?? 100000.00);

            if ($this->mode === 'sandbox') {
                $keys['sandbox_balance'] = max(0.00, $currentBal - $price);
            }

            $orderRecord = [
                'id' => 'ys_' . rand(100000, 999999),
                'externalId' => $externalId,
                'product_id' => $productId,
                'product_name' => $matched['name'] ?? 'Digital Product',
                'resellerPrice' => $price,
                'customerInput' => $customerInput,
                'status' => 'completed',
                'awaitingDelivery' => false,
                'deliveredItems' => [
                    'license_key' => 'YENE-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 16)),
                    'instructions' => 'Redeem your voucher within 24 hours. Contact support for assistance.'
                ],
                'created_at' => date('Y-m-d H:i:s'),
                'mode' => $this->mode
            ];

            $keys['sandbox_orders'][] = $orderRecord;
            $this->savePersistedKeys($keys);

            return [
                'status' => 'success',
                'order' => $orderRecord,
                'balance' => $keys['sandbox_balance']
            ];
        }

        if ($endpoint === '/orders' && $method === 'GET') {
            return [
                'status' => 'success',
                'orders' => $this->mode === 'live' ? [] : ($keys['sandbox_orders'] ?? []),
                'count' => count($this->mode === 'live' ? [] : ($keys['sandbox_orders'] ?? []))
            ];
        }

        return [
            'status' => 'success',
            'endpoint' => $endpoint,
            'message' => 'Simulated sandbox response.'
        ];
    }

    /**
     * Complete 16 products from the official YeneShop Reseller Catalog (recorded in Reseller.mp4)
     */
    public function getDefaultResellerCatalogue(): array {
        return [
            [
                'id' => 1,
                'name' => 'n8n Starter 12m',
                'resellerPrice' => 5900.00,
                'suggestedRetailPrice' => 6250.00,
                'stock' => 2,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Automation',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/n8n.png'
            ],
            [
                'id' => 2,
                'name' => 'Wispr Flow Pro 12m',
                'resellerPrice' => 5200.00,
                'suggestedRetailPrice' => 5400.00,
                'stock' => 3,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'AI Tools',
                'icon' => 'https://img.icons8.com/color/480/speech-bubble.png'
            ],
            [
                'id' => 3,
                'name' => 'Warp Build 12m',
                'resellerPrice' => 5800.00,
                'suggestedRetailPrice' => 6000.00,
                'stock' => 3,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Developer',
                'icon' => 'https://img.icons8.com/fluency/480/console.png'
            ],
            [
                'id' => 4,
                'name' => 'Replit Core 12m',
                'resellerPrice' => 7300.00,
                'suggestedRetailPrice' => 7500.00,
                'stock' => 3,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Developer',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/replit.png'
            ],
            [
                'id' => 5,
                'name' => 'QuillBot Premium 1m',
                'resellerPrice' => 700.00,
                'suggestedRetailPrice' => 750.00,
                'stock' => 65,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Writing',
                'icon' => 'https://img.icons8.com/color/480/quill-with-ink.png'
            ],
            [
                'id' => 6,
                'name' => 'Nord VPN 3m',
                'resellerPrice' => 650.00,
                'suggestedRetailPrice' => 1350.00,
                'stock' => 21,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'VPN & Security',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nordvpn.png'
            ],
            [
                'id' => 7,
                'name' => 'Monthly IAT Unlimited Data | 300 Birr ...',
                'resellerPrice' => 1750.00,
                'suggestedRetailPrice' => 1820.00,
                'stock' => -1, // Unlimited
                'deliveryType' => 'manual',
                'requiresCustomerDetails' => true,
                'customerInput' => 'Phone / Account Number',
                'category' => 'Telecom & Data',
                'icon' => 'https://img.icons8.com/color/480/sim-card-chip.png'
            ],
            [
                'id' => 8,
                'name' => 'Gemini AI Pro 18m',
                'resellerPrice' => 400.00,
                'suggestedRetailPrice' => 385.00,
                'stock' => 300,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'AI Tools',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-gemini.png'
            ],
            [
                'id' => 9,
                'name' => 'ElevenLabs Creator 12m',
                'resellerPrice' => 9000.00,
                'suggestedRetailPrice' => 10500.00,
                'stock' => 1,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'AI Audio',
                'icon' => 'https://img.icons8.com/fluency/480/sound-waves.png'
            ],
            [
                'id' => 10,
                'name' => 'Lovable Lite 12m',
                'resellerPrice' => 2520.00,
                'suggestedRetailPrice' => 2800.00,
                'stock' => 0,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Design & Code',
                'icon' => 'https://img.icons8.com/color/480/like--v3.png'
            ],
            [
                'id' => 11,
                'name' => 'Weekly Unlimited IAT Data | 90 Birr ...',
                'resellerPrice' => 540.00,
                'suggestedRetailPrice' => 600.00,
                'stock' => -1, // Unlimited
                'deliveryType' => 'manual',
                'requiresCustomerDetails' => true,
                'customerInput' => 'Phone / Account Number',
                'category' => 'Telecom & Data',
                'icon' => 'https://img.icons8.com/color/480/signal.png'
            ],
            [
                'id' => 12,
                'name' => 'SoundCloud Artist Pro 1 Month',
                'resellerPrice' => 360.00,
                'suggestedRetailPrice' => 400.00,
                'stock' => -1, // Unlimited
                'deliveryType' => 'manual',
                'requiresCustomerDetails' => false,
                'category' => 'Music & Audio',
                'icon' => 'https://img.icons8.com/color/480/soundcloud.png'
            ],
            [
                'id' => 13,
                'name' => 'Gamma Pro 12m',
                'resellerPrice' => 5850.00,
                'suggestedRetailPrice' => 8100.00,
                'stock' => 3,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Presentations',
                'icon' => 'https://img.icons8.com/fluency/480/presentation.png'
            ],
            [
                'id' => 14,
                'name' => 'Factory Pro 12m',
                'resellerPrice' => 3150.00,
                'suggestedRetailPrice' => 3500.00,
                'stock' => 5,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'AI Developer',
                'icon' => 'https://img.icons8.com/fluency/480/factory.png'
            ],
            [
                'id' => 15,
                'name' => 'Github Developer Pack (2 Years)',
                'resellerPrice' => 3150.00,
                'suggestedRetailPrice' => 3500.00,
                'stock' => 7,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Developer',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/github.png'
            ],
            [
                'id' => 16,
                'name' => 'Railway Hobby 12m',
                'resellerPrice' => 2700.00,
                'suggestedRetailPrice' => 3000.00,
                'stock' => 4,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'category' => 'Cloud Hosting',
                'icon' => 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/railway.png'
            ],
        ];
    }
}
