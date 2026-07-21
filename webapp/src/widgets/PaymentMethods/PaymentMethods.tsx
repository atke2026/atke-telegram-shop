import { Copy, Check } from '@phosphor-icons/react';
import { useState } from 'react';

import type { PaymentMethodDto } from '@entities/deposit';
import { haptics } from '@shared/lib/telegram';
import { Card } from '@shared/ui/Card';
import styles from './PaymentMethods.module.css';

/**
 * Where to send money. Account numbers are the one thing a customer must get
 * exactly right, so each is tap-to-copy rather than something to retype.
 */
export function PaymentMethods({ methods }: { methods: PaymentMethodDto[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (method: PaymentMethodDto) => {
    try {
      await navigator.clipboard.writeText(method.accountNumber);
      haptics.notify('success');
      setCopiedId(method.id);
      window.setTimeout(() => setCopiedId((current) => (current === method.id ? null : current)), 1800);
    } catch {
      haptics.notify('error');
    }
  };

  if (methods.length === 0) return null;

  return (
    <div className={styles.list}>
      {methods.map((method) => (
        <Card key={method.id} onClick={() => void copy(method)}>
          <div className={styles.row}>
            <img
              className={styles.logo}
              src={method.logoUrl}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              // A missing logo must not leave a broken-image icon in the card.
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />

            <div className={styles.details}>
              <p className={styles.name}>{method.name}</p>
              <p className={styles.account}>{method.accountNumber}</p>
              <p className={styles.holder}>{method.accountName}</p>
            </div>

            <span className={styles.action}>
              {copiedId === method.id ? (
                <>
                  <Check size={15} weight="bold" /> Copied
                </>
              ) : (
                <>
                  <Copy size={15} /> Copy
                </>
              )}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}
