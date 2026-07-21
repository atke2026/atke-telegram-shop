import { useState } from 'react';

import {
  useGetAdminProductsQuery,
  useSetProductPriceMutation,
  type AdminProductRow,
} from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

function ProductRow({ product }: { product: AdminProductRow }) {
  const [setPrice, { isLoading }] = useSetProductPriceMutation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (priceETB: string | null) => {
    setError(null);
    try {
      await setPrice({ slug: product.slug, priceETB }).unwrap();
      setValue('');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not update the price.'));
    }
  };

  return (
    <Card className={styles.row}>
      <div className={styles.rowHead}>
        <img className={styles.logo} src={product.logoUrl} alt="" width={36} height={36} />
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>{product.name}</p>
          <p className={styles.rowMeta}>
            {product.costPriceUSDT} USDT · stock {product.stock} ·{' '}
            {product.fixedPrice ? 'fixed price' : 'auto price'}
          </p>
        </div>
        <p className={styles.rowAmount}>{product.price.label}</p>
      </div>

      <div className={styles.inlineForm}>
        <input
          className={styles.input}
          inputMode="decimal"
          placeholder="New price in ETB"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ''))}
        />
        <Button loading={isLoading} disabled={!value} onClick={() => void save(value)}>
          Set
        </Button>
      </div>

      {/* Only offered when there is a fixed price to clear. */}
      {product.fixedPrice ? (
        <Button variant="ghost" onClick={() => void save(null)}>
          Return to automatic pricing
        </Button>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}

export function AdminProducts() {
  const { data: products, isLoading } = useGetAdminProductsQuery();

  if (isLoading) return <Spinner />;

  return (
    <div className={styles.section}>
      {(products ?? []).map((product) => (
        <ProductRow key={product.id} product={product} />
      ))}
    </div>
  );
}
