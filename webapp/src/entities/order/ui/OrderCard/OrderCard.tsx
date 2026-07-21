import { CheckCircle, ClockCounterClockwise, XCircle, ArrowUUpLeft } from '@phosphor-icons/react';
import { useState } from 'react';

import { Card } from '@shared/ui/Card';
import { haptics } from '@shared/lib/telegram';
import type { OrderDto, OrderStatus } from '../../api/orderApi';
import styles from './OrderCard.module.css';

const STATUS_ICON = {
  COMPLETED: CheckCircle,
  REFUNDED: ArrowUUpLeft,
  FAILED: XCircle,
  PENDING: ClockCounterClockwise,
  PAID: ClockCounterClockwise,
} as const satisfies Record<OrderStatus, unknown>;

const STATUS_LABEL: Record<OrderStatus, string> = {
  COMPLETED: 'Delivered',
  REFUNDED: 'Refunded',
  FAILED: 'Failed',
  PENDING: 'Processing',
  PAID: 'Processing',
};

/** Renders a delivered item without assuming HubX's payload shape. */
function itemToText(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    return Object.entries(item as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
  }
  return String(item);
}

export function OrderCard({ order }: { order: OrderDto }) {
  const [revealed, setRevealed] = useState(false);
  const Icon = STATUS_ICON[order.status];
  const items = order.deliveredItems ?? [];
  const hasItems = items.length > 0;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptics.notify('success');
    } catch {
      haptics.notify('error');
    }
  };

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <Icon size={20} weight="fill" className={styles[`status_${order.status}`]} />
        <div className={styles.headings}>
          <p className={styles.name}>{order.productName}</p>
          <p className={styles.meta}>
            {STATUS_LABEL[order.status]} · {new Date(order.createdAt).toLocaleDateString()}
          </p>
        </div>
        <p className={styles.price}>{order.pricePaid.label}</p>
      </div>

      {hasItems ? (
        <div className={styles.delivery}>
          {/* Credentials stay hidden until asked for: the app may be on screen in public. */}
          {revealed ? (
            <>
              {items.map((item, index) => {
                const text = itemToText(item);
                return (
                  <pre key={index} className={styles.item} onClick={() => void copy(text)}>
                    {text}
                  </pre>
                );
              })}
              <p className={styles.hint}>Tap an item to copy</p>
            </>
          ) : (
            <button
              type="button"
              className={styles.reveal}
              onClick={() => {
                haptics.tap('light');
                setRevealed(true);
              }}
            >
              Show my item{items.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
