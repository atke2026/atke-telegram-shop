import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../../shared/logger.js';
import { YeneShopClient, YeneShopRequestError } from './YeneShopClient.js';

const logger = {
  child: vi.fn().mockReturnThis(), warn: vi.fn(), info: vi.fn(), error: vi.fn(),
} as unknown as Logger;

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));

describe('YeneShopClient', () => {
  const fetchMock = vi.fn();
  let client: YeneShopClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    client = new YeneShopClient({
      baseUrl: 'https://yeneshop.test/api/reseller/v1/',
      apiKey: 'ysk_live_abcdefghijklmnopqrstuvwxyz',
      logger,
      timeoutMs: 100,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('maps the private catalogue including ETB prices and fulfillment metadata', async () => {
    fetchMock.mockImplementation(() => response(200, {
      products: [{
        id: 'p1', slug: 'canva', name: 'Canva', description: 'Details',
        imageUrl: 'https://yeneshop.test/logos/canva.webp?v=1',
        resellerPrice: { amount: '250.00', label: '250 ETB', currency: 'ETB' },
        suggestedRetailPrice: { amount: '340.00', label: '340 ETB', currency: 'ETB' },
        availability: 'IN_STOCK', stock: null, deliveryType: 'MANUAL',
        customerInput: { required: true, type: 'TEXT', label: 'Email', placeholder: 'Your email' },
      }],
    }));

    await expect(client.getProducts()).resolves.toEqual([expect.objectContaining({
      id: 'p1', resellerPriceETB: '250.00', suggestedRetailPriceETB: '340.00',
      deliveryType: 'MANUAL', input: { type: 'TEXT', placeholder: 'Your email' },
    })]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://yeneshop.test/api/reseller/v1/products',
      expect.objectContaining({ headers: expect.objectContaining({
        Authorization: 'Bearer ysk_live_abcdefghijklmnopqrstuvwxyz',
      }) }),
    );
  });

  it('places an idempotent order using Suq order id and customer input', async () => {
    fetchMock.mockImplementation(() => response(201, {
      order: {
        id: 'yo-1', externalId: 'suq-1', status: 'PAID', pricePaid: '250.00',
        balance: '900.00', deliveredItems: [], awaitingDelivery: true,
        instructions: 'Wait for delivery', createdAt: '2026-07-31T00:00:00.000Z',
      },
    }));

    const order = await client.placeOrder({
      productId: 'p1', externalOrderId: 'suq-1', customerInput: 'buyer@example.com',
    });
    expect(order).toMatchObject({
      yeneshopOrderId: 'yo-1', externalId: 'suq-1', status: 'PAID', awaitingDelivery: true,
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      externalId: 'suq-1', productId: 'p1', customerInput: 'buyer@example.com',
    });
  });

  it('maps insufficient supplier funds to a definite store-offline rejection', async () => {
    fetchMock.mockImplementation(() => response(409, {
      error: 'INSUFFICIENT_BALANCE', message: 'not enough balance',
    }));
    await expect(client.placeOrder({
      productId: 'p1', externalOrderId: 'suq-1', customerInput: null,
    })).rejects.toMatchObject({ code: 'SYSTEM_OFFLINE' });
  });

  it('rejects malformed success payloads instead of silently creating bad products', async () => {
    fetchMock.mockImplementation(() => response(200, { products: [{ id: 'p1' }] }));
    await expect(client.getProducts()).rejects.toBeInstanceOf(YeneShopRequestError);
  });
});
