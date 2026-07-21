import { InvalidApiKeyError, OutOfStockError, SystemOfflineError } from '../../core/errors/DomainError.js';
import type { HubxGateway, HubxOrderResult, HubxProduct } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

interface HubxClientOptions {
  baseUrl: string;
  apiKey: string;
  logger: Logger;
  timeoutMs?: number;
}

/** Raised for transport/5xx faults so callers can distinguish them from business errors. */
export class HubxRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HubxRequestError';
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
    const body = await this.request<{ data?: unknown[] } | unknown[]>('GET', '/products');
    const rows = Array.isArray(body) ? body : (body.data ?? []);

    return rows.map((row) => this.toProduct(row as Record<string, unknown>));
  }

  async getResellerBalanceUSDT(): Promise<string> {
    const body = await this.request<Record<string, unknown>>('GET', '/balance');
    const raw = body.balance ?? body.available_balance ?? (body.data as Record<string, unknown> | undefined)?.balance;

    if (raw === undefined || raw === null) {
      throw new HubxRequestError('Balance response did not contain a balance field');
    }

    return String(raw);
  }

  async placeOrder(input: {
    productId: string;
    quantity: number;
    externalOrderId: string;
  }): Promise<HubxOrderResult> {
    const body = await this.request<Record<string, unknown>>('POST', '/orders', {
      product_id: input.productId,
      quantity: input.quantity,
      external_order_id: input.externalOrderId,
    });

    const payload = (body.data as Record<string, unknown> | undefined) ?? body;
    const items = payload.delivered_items;

    return {
      hubxOrderId: payload.id != null ? String(payload.id) : null,
      deliveredItems: Array.isArray(items) ? (items as HubxOrderResult['deliveredItems']) : [],
    };
  }

  private toProduct(row: Record<string, unknown>): HubxProduct {
    const stock = Number(row.stock ?? row.available_stock ?? 0);

    return {
      id: String(row.id),
      slug: String(row.slug ?? row.id),
      name: String(row.name ?? 'Unnamed product'),
      description: row.description != null ? String(row.description) : null,
      stock: Number.isFinite(stock) ? stock : 0,
      isActive: row.is_active !== false && row.status !== 'inactive',
      priceUSDT: String(row.price ?? row.price_usdt ?? '0'),
    };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
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
        this.logger.warn({ method, path, status: response.status, body: text.slice(0, 500) }, 'HubX request failed');
        throw this.toError(response.status, parsed, text);
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

  private toError(status: number, parsed: unknown, rawText: string): Error {
    const message =
      (parsed && typeof parsed === 'object' && 'message' in parsed ? String((parsed as { message: unknown }).message) : '') ||
      rawText.slice(0, 200) ||
      `HTTP ${status}`;

    if (status === 401 || status === 403) return new InvalidApiKeyError();
    // HubX signals both "product sold out" and "reseller wallet empty" in the 4xx range;
    // the message is what separates them.
    if (status === 409) {
      return /balance|fund/i.test(message) ? new SystemOfflineError(message) : new OutOfStockError(message);
    }
    if (status === 402) return new SystemOfflineError(message);

    return new HubxRequestError(message, status);
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
