import {
  InvalidApiKeyError,
  OutOfStockError,
  ProductNotFoundError,
  SystemOfflineError,
} from '../../core/errors/DomainError.js';
import type { HubxGateway, HubxOrderResult, HubxProduct } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

interface HubxClientOptions {
  /** Full base including the version prefix, e.g. https://host/api/public/reseller/v1 */
  baseUrl: string;
  apiKey: string;
  logger: Logger;
  timeoutMs?: number;
}

/** Transport or unmapped-status fault — distinct from an expected business error. */
export class HubxRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HubxRequestError';
  }
}

/** Signals a 404 from HubX so callers can decide what was missing. */
class HubxNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubxNotFoundError';
  }
}

export class HubxClient implements HubxGateway {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor({ baseUrl, apiKey, logger, timeoutMs = 15_000 }: HubxClientOptions) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.logger = logger.child({ component: 'HubxClient' });
    this.timeoutMs = timeoutMs;
  }

  async getProducts(): Promise<HubxProduct[]> {
    const body = await this.request<unknown>('GET', '/products');
    const rows = unwrapList(body);

    return rows.map((row) => this.toProduct(row));
  }

  async getProduct(idOrSlug: string): Promise<HubxProduct | null> {
    try {
      const body = await this.request<unknown>('GET', `/products/${encodeURIComponent(idOrSlug)}`);
      return this.toProduct(unwrapObject(body));
    } catch (error) {
      if (error instanceof HubxNotFoundError) return null;
      throw error;
    }
  }

  async getResellerBalanceUSDT(): Promise<string> {
    const payload = unwrapObject(await this.request<unknown>('GET', '/balance'));
    // Live shape: {"ok":true,"balance_usdt":1}
    const raw = payload.balance_usdt ?? payload.balance ?? payload.available_balance;

    if (raw === undefined || raw === null) {
      throw new HubxRequestError('Balance response contained no balance field');
    }

    return String(raw);
  }

  async placeOrder(input: {
    productId: string;
    quantity: number;
    externalOrderId: string;
  }): Promise<HubxOrderResult> {
    const body = await this.request<unknown>(
      'POST',
      '/orders',
      {
        product_id: input.productId,
        quantity: input.quantity,
        external_order_id: input.externalOrderId,
      },
      // A 404 here means the product vanished between our sync and the order.
      (message) => new ProductNotFoundError(message),
    );

    return this.toOrderResult(unwrapObject(body));
  }

  async getOrder(hubxOrderId: string): Promise<HubxOrderResult | null> {
    try {
      const body = await this.request<unknown>('GET', `/orders/${encodeURIComponent(hubxOrderId)}`);
      return this.toOrderResult(unwrapObject(body));
    } catch (error) {
      if (error instanceof HubxNotFoundError) return null;
      throw error;
    }
  }

  private toOrderResult(payload: Record<string, unknown>): HubxOrderResult {
    const items = payload.delivered_items;

    return {
      hubxOrderId: payload.id != null ? String(payload.id) : null,
      deliveredItems: Array.isArray(items) ? (items as HubxOrderResult['deliveredItems']) : [],
      idempotentReplay: payload.idempotent_replay === true,
    };
  }

  /** Live row: {id, slug, name, price_usdt: 2, stock: 9, active: true} */
  private toProduct(row: Record<string, unknown>): HubxProduct {
    const stock = Number(row.stock ?? 0);

    return {
      id: String(row.id),
      slug: String(row.slug ?? row.id),
      name: String(row.name ?? 'Unnamed product'),
      description: row.description != null ? String(row.description) : null,
      stock: Number.isFinite(stock) ? stock : 0,
      // `active` is the documented flag; the others are defensive fallbacks.
      isActive: row.active !== false && row.is_active !== false && row.status !== 'inactive',
      // Numeric upstream — stringified here so it never touches a float.
      priceUSDT: String(row.price_usdt ?? row.price ?? '0'),
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    onNotFound?: (message: string) => Error,
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

      const text = await response.text();
      const parsed = text ? safeJsonParse(text) : null;

      if (!response.ok) {
        this.logger.warn(
          { method, path, status: response.status, body: text.slice(0, 500) },
          'HubX request failed',
        );
        throw this.toError(response.status, parsed, text, onNotFound);
      }

      return parsed as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HubxRequestError(`HubX request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private toError(
    status: number,
    parsed: unknown,
    rawText: string,
    onNotFound?: (message: string) => Error,
  ): Error {
    const message = extractMessage(parsed) || rawText.slice(0, 200) || `HTTP ${status}`;

    switch (status) {
      case 401:
        return new InvalidApiKeyError();
      case 402:
        // Our reseller wallet is empty — the customer did nothing wrong.
        return new SystemOfflineError(`insufficient reseller balance: ${message}`);
      case 404:
        return onNotFound ? onNotFound(message) : new HubxNotFoundError(message);
      case 409:
        // HubX auto-refunds our wallet on a failed allocation, so there is
        // nothing to reconcile upstream — only the customer needs refunding.
        return new OutOfStockError(message);
      default:
        return new HubxRequestError(message, status);
    }
  }
}

function extractMessage(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';

  const record = parsed as Record<string, unknown>;
  const candidate = record.message ?? record.error ?? record.detail;

  return typeof candidate === 'string' ? candidate : '';
}

/**
 * HubX wraps responses in an `{ok, …}` envelope; the payload key is not
 * documented, so accept a bare array or any of the plausible wrappers.
 */
function unwrapList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (!body || typeof body !== 'object') return [];

  const record = body as Record<string, unknown>;
  for (const key of ['data', 'products', 'items', 'results']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
  }

  return [];
}

function unwrapObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};

  const record = body as Record<string, unknown>;
  const data = record.data;

  return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : record;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
