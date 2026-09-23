import { UNLIMITED_STOCK } from '../../core/constants.js';
import {
  InvalidApiKeyError,
  OutOfStockError,
  ProductNotFoundError,
  SystemOfflineError,
} from '../../core/errors/DomainError.js';
import type {
  YeneShopGateway,
  YeneShopOrderResult,
  YeneShopProduct,
} from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

interface YeneShopClientOptions {
  /** Full versioned base, e.g. https://yeneshop.example/api/reseller/v1. */
  baseUrl: string;
  apiKey: string;
  logger: Logger;
  timeoutMs?: number;
}

export class YeneShopRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'YeneShopRequestError';
  }
}

class YeneShopNotFoundError extends Error {}

export class YeneShopClient implements YeneShopGateway {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor({ baseUrl, apiKey, logger, timeoutMs = 15_000 }: YeneShopClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.logger = logger.child({ component: 'YeneShopClient' });
    this.timeoutMs = timeoutMs;
  }

  async getProducts(): Promise<YeneShopProduct[]> {
    const body = await this.request<{ products?: unknown }>('GET', '/products');
    if (!Array.isArray(body.products)) {
      throw new YeneShopRequestError('YeneShop product response contained no products array');
    }
    return body.products.map((row) => this.toProduct(record(row)));
  }

  async getResellerBalanceETB(): Promise<string> {
    const body = await this.request<{ balance?: unknown }>('GET', '/balance');
    return moneyAmount(body.balance, 'balance');
  }

  async placeOrder(input: {
    productId: string;
    externalOrderId: string;
    customerInput: string | null;
  }): Promise<YeneShopOrderResult> {
    const body = await this.request<{ order?: unknown }>(
      'POST',
      '/orders',
      {
        externalId: input.externalOrderId,
        productId: input.productId,
        ...(input.customerInput === null ? {} : { customerInput: input.customerInput }),
      },
      true,
    );
    return this.toOrder(record(body.order));
  }

  async getOrder(externalOrderId: string): Promise<YeneShopOrderResult | null> {
    try {
      const body = await this.request<{ order?: unknown }>(
        'GET',
        `/orders/${encodeURIComponent(externalOrderId)}`,
      );
      return this.toOrder(record(body.order));
    } catch (error) {
      if (error instanceof YeneShopNotFoundError) return null;
      throw error;
    }
  }

  private toProduct(row: Record<string, unknown>): YeneShopProduct {
    const customerInput = row.customerInput === null ? null : record(row.customerInput);
    const type = customerInput?.type;
    if (customerInput && type !== 'TEXT' && type !== 'NUMBER') {
      throw new YeneShopRequestError('YeneShop product has an invalid customer input type');
    }

    return {
      id: requiredString(row.id, 'product.id'),
      slug: requiredString(row.slug, 'product.slug'),
      name: requiredString(row.name, 'product.name'),
      description: optionalString(row.description),
      imageUrl: requiredString(row.imageUrl, 'product.imageUrl'),
      resellerPriceETB: moneyAmount(row.resellerPrice, 'product.resellerPrice'),
      suggestedRetailPriceETB: moneyAmount(
        row.suggestedRetailPrice,
        'product.suggestedRetailPrice',
      ),
      isActive: row.availability === 'IN_STOCK',
      stock:
        row.stock === null
          ? UNLIMITED_STOCK
          : nonNegativeInteger(row.stock, 'product.stock'),
      deliveryType: row.deliveryType === 'MANUAL' ? 'MANUAL' : 'INSTANT',
      input: customerInput
        ? {
            type: type as 'TEXT' | 'NUMBER',
            placeholder:
              optionalString(customerInput.placeholder) ?? optionalString(customerInput.label),
          }
        : null,
    };
  }

  private toOrder(row: Record<string, unknown>): YeneShopOrderResult {
    const status = row.status;
    if (!['PENDING', 'PAID', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(String(status))) {
      throw new YeneShopRequestError('YeneShop order has an invalid status');
    }
    return {
      yeneshopOrderId: requiredString(row.id, 'order.id'),
      externalId: requiredString(row.externalId, 'order.externalId'),
      status: status as YeneShopOrderResult['status'],
      deliveredItems: Array.isArray(row.deliveredItems)
        ? (row.deliveredItems as YeneShopOrderResult['deliveredItems'])
        : [],
      awaitingDelivery: row.awaitingDelivery === true,
      instructions: optionalString(row.instructions),
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    productOrder = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const raw = await response.text();
      const parsed = raw ? safeJson(raw) : null;
      if (!response.ok) {
        this.logger.warn(
          { method, path, status: response.status, body: raw.slice(0, 500) },
          'YeneShop reseller request failed',
        );
        throw this.toError(response.status, parsed, productOrder);
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new YeneShopRequestError(`YeneShop request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private toError(status: number, payload: unknown, productOrder: boolean): Error {
    const row = record(payload);
    const code = optionalString(row.error) ?? '';
    const message = optionalString(row.message) ?? (code || `HTTP ${status}`);

    if (status === 401) return new InvalidApiKeyError();
    if (status === 403) return new SystemOfflineError(`YeneShop reseller access denied: ${message}`);
    if (status === 404) {
      return productOrder ? new ProductNotFoundError(message) : new YeneShopNotFoundError(message);
    }
    if (status === 409 && code === 'OUT_OF_STOCK') return new OutOfStockError(message);
    if (status === 409 && code === 'INSUFFICIENT_BALANCE') {
      return new SystemOfflineError(`YeneShop reseller balance is too low: ${message}`);
    }
    return new YeneShopRequestError(message, status);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new YeneShopRequestError(`YeneShop response is missing ${field}`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function moneyAmount(value: unknown, field: string): string {
  const amount = record(value).amount;
  if (typeof amount !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw new YeneShopRequestError(`YeneShop response has an invalid ${field}`);
  }
  return amount;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new YeneShopRequestError(`YeneShop response has an invalid ${field}`);
  }
  return value;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
