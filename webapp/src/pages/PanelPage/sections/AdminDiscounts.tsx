import { Tag, Trash } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  useCreateDiscountMutation,
  useDeleteDiscountMutation,
  useGetDiscountsQuery,
  useSetDiscountActiveMutation,
  type AdminDiscountRow,
} from '@entities/admin';
import { useGetAdminProductsQuery } from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

function describe(discount: AdminDiscountRow): string {
  const amount = discount.type === 'PERCENT' ? `${Number(discount.value)}%` : `${discount.value} ETB`;
  const target = discount.scope === 'ALL' ? 'everything' : (discount.productName ?? 'a product');

  return `${amount} off ${target}`;
}

function DiscountRow({ discount }: { discount: AdminDiscountRow }) {
  const [setActive] = useSetDiscountActiveMutation();
  const [remove] = useDeleteDiscountMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not update this discount.'));
    }
  };

  const window =
    discount.startsAt || discount.endsAt
      ? `${discount.startsAt ? new Date(discount.startsAt).toLocaleDateString() : 'now'} → ${
          discount.endsAt ? new Date(discount.endsAt).toLocaleDateString() : 'no end'
        }`
      : 'no end date';

  return (
    <Card className={styles.row}>
      <div className={styles.rowHead}>
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>{discount.label ?? describe(discount)}</p>
          <p className={styles.rowMeta}>
            {discount.label ? `${describe(discount)} · ` : ''}
            {window}
          </p>
        </div>
        {/* Switched on but outside its dates is not the same as switched off. */}
        <span className={styles.badge}>
          {discount.isLive ? 'live' : discount.isActive ? 'scheduled' : 'off'}
        </span>
      </div>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => void run(() => setActive({ id: discount.id, isActive: !discount.isActive }).unwrap())}
        >
          {discount.isActive ? 'Turn off' : 'Turn on'}
        </Button>

        {confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void run(() => remove(discount.id).unwrap())}>Confirm</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            <Trash size={16} />
          </Button>
        )}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}

export function AdminDiscounts() {
  const { data: discounts, isLoading } = useGetDiscountsQuery();
  const { data: products } = useGetAdminProductsQuery();
  const [create, { isLoading: creating }] = useCreateDiscountMutation();

  const [scope, setScope] = useState<'ALL' | 'PRODUCT'>('ALL');
  const [productId, setProductId] = useState('');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await create({
        scope,
        type,
        value,
        ...(scope === 'PRODUCT' ? { productId } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
        // A date input gives a day; treat it as the end of that day.
        ...(endsAt ? { endsAt: new Date(`${endsAt}T23:59:59`).toISOString() } : {}),
      }).unwrap();

      haptics.notify('success');
      setValue('');
      setLabel('');
      setEndsAt('');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not create the discount.'));
    }
  };

  const ready = value !== '' && (scope === 'ALL' || productId !== '');

  return (
    <div className={styles.section}>
      <Card className={styles.row}>
        <p className={styles.rowTitle}>New discount</p>

        <div className={styles.actions}>
          <Button variant={scope === 'ALL' ? 'primary' : 'secondary'} onClick={() => setScope('ALL')}>
            All products
          </Button>
          <Button
            variant={scope === 'PRODUCT' ? 'primary' : 'secondary'}
            onClick={() => setScope('PRODUCT')}
          >
            One product
          </Button>
        </div>

        {scope === 'PRODUCT' ? (
          <select
            className={styles.input}
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
          >
            <option value="">Choose a product…</option>
            {(products ?? []).map((product) => (
              <option key={product.id} value={product.slug}>
                {product.name} — {product.price.label}
              </option>
            ))}
          </select>
        ) : null}

        <div className={styles.actions}>
          <Button
            variant={type === 'PERCENT' ? 'primary' : 'secondary'}
            onClick={() => setType('PERCENT')}
          >
            Percent
          </Button>
          <Button variant={type === 'FIXED' ? 'primary' : 'secondary'} onClick={() => setType('FIXED')}>
            Fixed ETB
          </Button>
        </div>

        <input
          className={styles.input}
          inputMode="decimal"
          placeholder={type === 'PERCENT' ? 'e.g. 10 (for 10%)' : 'e.g. 500 (ETB off)'}
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ''))}
        />

        <input
          className={styles.input}
          placeholder="Label shown to customers (optional)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />

        <label className={styles.hint} htmlFor="discount-ends">
          Ends on (optional)
        </label>
        <input
          id="discount-ends"
          className={styles.input}
          type="date"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />

        <Button fullWidth loading={creating} disabled={!ready} onClick={() => void submit()}>
          Create discount
        </Button>

        <p className={styles.hint}>
          Discounts never stack — when more than one applies, the customer gets the best single one.
        </p>

        {error ? <p className={styles.error}>{error}</p> : null}
      </Card>

      {isLoading ? <Spinner /> : null}

      {!isLoading && (discounts?.length ?? 0) === 0 ? (
        <EmptyState icon={Tag} title="No discounts yet" />
      ) : null}

      {(discounts ?? []).map((discount) => (
        <DiscountRow key={discount.id} discount={discount} />
      ))}
    </div>
  );
}
