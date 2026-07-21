import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvalidApiKeyError,
  OutOfStockError,
  ProductNotFoundError,
  SystemOfflineError,
} from '../../core/errors/DomainError.js';
import type { Logger } from '../../shared/logger.js';
import { HubxClient, HubxRequestError } from './HubxClient.js';

const BASE = 'https://hubx.test/api/public/reseller/v1';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => silentLogger),
} as unknown as Logger;

/**
 * A Response body can only be read once, so hand back a fresh one per call
 * rather than resolving the same object repeatedly.
 */
function mockResponse(status: number, body: unknown) {
  return () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
}

function firstCall(mock: ReturnType<typeof vi.fn>): [string, { headers: Record<string, string>; body: string }] {
  const call = mock.mock.calls[0];
  if (!call) throw new Error('fetch was never called');

  return call as [string, { headers: Record<string, string>; body: string }];
}

describe('HubxClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: HubxClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new HubxClient({ baseUrl: `${BASE}/`, apiKey: 'rsk_live_test', logger: silentLogger });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer key and hits the versioned base path', async () => {
    fetchMock.mockImplementation(mockResponse(200, { data: [] }));

    await client.getProducts();

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(`${BASE}/products`);
    expect(init.headers.Authorization).toBe('Bearer rsk_live_test');
  });

  it('accepts both a bare array and a data-wrapped list', async () => {
    const row = { id: 'p1', slug: 'google-ai-pro', name: 'Google AI Pro', stock: 3, price: '2.50' };

    fetchMock.mockImplementation(mockResponse(200, [row]));
    expect(await client.getProducts()).toHaveLength(1);

    fetchMock.mockImplementation(mockResponse(200, { ok: true, data: [row] }));
    const [product] = await client.getProducts();
    expect(product).toMatchObject({ id: 'p1', slug: 'google-ai-pro', stock: 3, priceUSDT: '2.50' });

    // The live envelope key is undocumented, so `products` must work too.
    fetchMock.mockImplementation(mockResponse(200, { ok: true, products: [row] }));
    expect(await client.getProducts()).toHaveLength(1);
  });

  it('reads the live error envelope shape', async () => {
    fetchMock.mockImplementation(mockResponse(401, { ok: false, error: 'Invalid or revoked API key' }));

    await expect(client.getProducts()).rejects.toThrow(InvalidApiKeyError);
  });

  it('reads the reseller balance', async () => {
    fetchMock.mockImplementation(mockResponse(200, { balance: '150.25' }));

    expect(await client.getResellerBalanceUSDT()).toBe('150.25');
  });

  it('posts the idempotency key and surfaces a replay', async () => {
    fetchMock.mockImplementation(
      mockResponse(200, {
        id: 'hubx-1',
        delivered_items: [{ code: 'ABC' }],
        idempotent_replay: true,
      }),
    );

    const result = await client.placeOrder({
      productId: 'p1',
      quantity: 1,
      externalOrderId: 'order-uuid',
    });

    const [, init] = firstCall(fetchMock);
    expect(JSON.parse(init.body)).toEqual({
      product_id: 'p1',
      quantity: 1,
      external_order_id: 'order-uuid',
    });
    expect(result).toEqual({
      hubxOrderId: 'hubx-1',
      deliveredItems: [{ code: 'ABC' }],
      idempotentReplay: true,
    });
  });

  describe('error mapping', () => {
    const place = () => client.placeOrder({ productId: 'p1', quantity: 1, externalOrderId: 'o1' });

    it('maps 401 to an invalid key error', async () => {
      fetchMock.mockImplementation(mockResponse(401, { message: 'revoked' }));
      await expect(place()).rejects.toThrow(InvalidApiKeyError);
    });

    it('maps 402 to system offline — our wallet, not the customer', async () => {
      fetchMock.mockImplementation(mockResponse(402, { message: 'insufficient balance' }));
      await expect(place()).rejects.toThrow(SystemOfflineError);
    });

    it('maps 409 to out of stock', async () => {
      fetchMock.mockImplementation(mockResponse(409, { message: 'out of stock' }));
      await expect(place()).rejects.toThrow(OutOfStockError);
    });

    it('maps 404 on an order to a missing product', async () => {
      fetchMock.mockImplementation(mockResponse(404, { message: 'product not found' }));
      await expect(place()).rejects.toThrow(ProductNotFoundError);
    });

    it('returns null rather than throwing for a 404 lookup', async () => {
      fetchMock.mockImplementation(mockResponse(404, { message: 'not found' }));

      expect(await client.getProduct('nope')).toBeNull();
      expect(await client.getOrder('nope')).toBeNull();
    });

    it('maps 400 and 5xx to a transport error carrying the status', async () => {
      fetchMock.mockImplementation(mockResponse(400, { message: 'bad input' }));
      await expect(place()).rejects.toThrow(HubxRequestError);

      fetchMock.mockImplementation(mockResponse(503, 'gateway down'));
      await expect(place()).rejects.toMatchObject({ status: 503 });
    });
  });
});
