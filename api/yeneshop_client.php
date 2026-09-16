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
            'sandbox_key' => defined('YENESHOP_SANDBOX_KEY') ? YENESHOP_SANDBOX_KEY : 'ysk_sandbox_te0-dmQyPQjQlckqXVw5HCEC2kgw-DBthMoF6f42wN8',
            'live_key' => defined('YENESHOP_LIVE_KEY') ? YENESHOP_LIVE_KEY : 'ysk_live_He8SsfRV5OU8I5hndkk37krAvdVI9oa7bOjsgHjPVbM',
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
    public function request(string $endpoint, string $method = 'GET', ?array $body = null): array {
        $cleanEndpoint = '/' . ltrim($endpoint, '/');
        $url = $this->baseUrl . $cleanEndpoint;

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
        $res = $this->request('/balance', 'GET');
        if (isset($res['balance']['amount'])) {
            $amt = (float)$res['balance']['amount'];
            return [
                'status' => 'success',
                'environment' => $res['environment'] ?? strtoupper($this->mode),
                'live_wallet' => ($this->mode === 'live') ? $amt : 0.00,
                'sandbox_wallet' => ($this->mode === 'sandbox') ? $amt : 100000.00,
                'balance' => $amt,
                'label' => $res['balance']['label'] ?? ($amt . ' ETB'),
                'currency' => $res['balance']['currency'] ?? 'ETB'
            ];
        }
        return $res;
    }

    /**
     * GET /products
     */
    public function getProducts(): array {
        $res = $this->request('/products', 'GET');
        if (isset($res['products']) && is_array($res['products'])) {
            $normalized = [];
            foreach ($res['products'] as $p) {
                $resellerPrice = is_array($p['resellerPrice'] ?? null) 
                    ? (float)($p['resellerPrice']['amount'] ?? 0) 
                    : (float)($p['resellerPrice'] ?? 0);

                $suggestedPrice = is_array($p['suggestedRetailPrice'] ?? null) 
                    ? (float)($p['suggestedRetailPrice']['amount'] ?? 0) 
                    : (float)($p['suggestedRetailPrice'] ?? 0);

                $normalized[] = [
                    'id' => $p['id'] ?? $p['slug'],
                    'slug' => $p['slug'] ?? '',
                    'name' => $p['name'] ?? '',
                    'description' => $p['description'] ?? '',
                    'resellerPrice' => $resellerPrice,
                    'suggestedRetailPrice' => $suggestedPrice,
                    'stock' => $p['stock'] ?? -1,
                    'availability' => $p['availability'] ?? 'IN_STOCK',
                    'deliveryType' => strtolower((string)($p['deliveryType'] ?? 'instant')),
                    'requiresCustomerDetails' => !empty($p['customerInput']),
                    'customerInput' => $p['customerInput'] ?? null,
                    'icon' => $p['imageUrl'] ?? 'https://img.icons8.com/color/480/package.png'
                ];
            }
            return [
                'status' => 'success',
                'count' => count($normalized),
                'products' => $normalized
            ];
        }
        return $res;
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

        $res = $this->request('/orders', 'POST', $body);
        if (isset($res['order'])) {
            $o = $res['order'];
            return [
                'status' => 'success',
                'order' => [
                    'id' => $o['id'] ?? '',
                    'externalId' => $o['externalId'] ?? $externalId,
                    'product_id' => $o['productId'] ?? $productId,
                    'product_name' => $o['productName'] ?? '',
                    'resellerPrice' => (float)($o['pricePaid'] ?? 0),
                    'status' => strtolower((string)($o['status'] ?? 'completed')),
                    'awaitingDelivery' => (bool)($o['awaitingDelivery'] ?? false),
                    'deliveredItems' => $o['deliveredItems'] ?? null,
                    'instructions' => $o['instructions'] ?? '',
                    'created_at' => $o['createdAt'] ?? date('Y-m-d H:i:s'),
                    'mode' => $this->mode
                ],
                'balance' => (float)($o['balance'] ?? 0)
            ];
        }
        return $res;
    }

    /**
     * GET /orders
     */
    public function getOrders(): array {
        $res = $this->request('/orders', 'GET');
        if (isset($res['orders']) && is_array($res['orders'])) {
            $normalized = [];
            foreach ($res['orders'] as $o) {
                $normalized[] = [
                    'id' => $o['id'] ?? '',
                    'externalId' => $o['externalId'] ?? '',
                    'product_name' => $o['productName'] ?? '',
                    'resellerPrice' => (float)($o['pricePaid'] ?? 0),
                    'status' => strtolower((string)($o['status'] ?? 'completed')),
                    'deliveredItems' => $o['deliveredItems'] ?? null,
                    'created_at' => $o['createdAt'] ?? '',
                    'mode' => $this->mode
                ];
            }
            return [
                'status' => 'success',
                'orders' => $normalized,
                'count' => count($normalized)
            ];
        }
        return $res;
    }

    /**
     * GET /orders/:externalId
     */
    public function getOrderByExternalId(string $externalId): array {
        return $this->request('/orders/' . urlencode($externalId), 'GET');
    }

    /**
     * Fallback simulation if network is unreachable
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
                'count' => 18,
                'products' => $this->getDefaultResellerCatalogue()
            ];
        }

        return [
            'status' => 'success',
            'endpoint' => $endpoint,
            'message' => 'Simulated response.'
        ];
    }

    public function getDefaultResellerCatalogue(): array {
        return [
            [
                'id' => 'd2cfb051-c58d-453f-9ee9-ccb61d7ff3e3',
                'name' => 'n8n Starter 12m',
                'resellerPrice' => 5900.00,
                'suggestedRetailPrice' => 6250.00,
                'stock' => 2,
                'deliveryType' => 'instant',
                'requiresCustomerDetails' => false,
                'icon' => 'https://yeneshop.amixmon.com/logos/n8n-starter-12m.webp?v=2'
            ]
        ];
    }
}
