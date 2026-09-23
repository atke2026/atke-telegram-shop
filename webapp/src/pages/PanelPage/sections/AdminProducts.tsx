import { ArrowCounterClockwise, DotsSixVertical } from '@phosphor-icons/react';
import { Reorder, useDragControls } from 'framer-motion';
import { useEffect, useState } from 'react';

import {
  useGetAdminProductsQuery,
  useReorderProductsMutation,
  useResetProductOrderMutation,
  useSetProductPriceMutation,
  type AdminProductRow,
} from '@entities/admin';
import { ProductLogo, stockLabel } from '@entities/product';
import { ProductAvailability } from '@features/edit-product';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

function ProductRow({ product, onDragEnd }: { product: AdminProductRow; onDragEnd: () => void }) {
  const [setPrice, { isLoading }] = useSetProductPriceMutation();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The row holds a text input and buttons, so dragging is driven by the
  // handle alone — otherwise a tap meant for the price field starts a drag.
  const controls = useDragControls();

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
    <Reorder.Item
      as="div"
      value={product}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
    >
      <Card className={styles.row}>
        <div className={styles.rowHead}>
          <span
            className={styles.dragHandle}
            // Without this the browser claims the gesture for scrolling and
            // the drag never starts on a touch screen.
            style={{ touchAction: 'none' }}
            onPointerDown={(event) => {
              haptics.tap('light');
              controls.start(event);
            }}
            role="button"
            aria-label={`Reorder ${product.name}`}
          >
            <DotsSixVertical size={20} weight="bold" />
          </span>
          <ProductLogo className={styles.logo} src={product.logoUrl} width={36} height={36} iconSize={18} />
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>{product.name}</p>
            <p className={styles.rowMeta}>
              {`${product.costPriceETB} ETB YeneShop cost · ${stockLabel({
                stock: product.stock,
                inStock: product.inStock,
              })} · ${product.operatorAvailable ? 'available by you' : 'unavailable by you'} · ${
                product.fixedPrice ? 'fixed price' : 'auto price'
              }`}
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

        {product.fixedPrice ? (
          <Button variant="ghost" onClick={() => void save(null)}>
            Return to automatic pricing
          </Button>
        ) : null}

        <ProductAvailability slug={product.slug} available={product.operatorAvailable} />
        {error ? <p className={styles.error}>{error}</p> : null}
      </Card>
    </Reorder.Item>
  );
}

export function AdminProducts() {
  const { data: products, isLoading } = useGetAdminProductsQuery();
  const [reorder, { isLoading: isSaving }] = useReorderProductsMutation();
  const [resetOrder, { isLoading: isResetting }] = useResetProductOrderMutation();

  // The dragged order lives here so the list follows the finger; the server is
  // told once the row is dropped, not on every frame of the gesture.
  const [rows, setRows] = useState<AdminProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (products) setRows(products);
  }, [products]);

  const persist = async (ordered: AdminProductRow[]) => {
    setError(null);
    try {
      await reorder(ordered.map((product) => product.id)).unwrap();
      haptics.tap('light');
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not save the new order.'));
      // Put the list back where the server still believes it is.
      if (products) setRows(products);
    }
  };

  const reset = async () => {
    setError(null);
    try {
      await resetOrder().unwrap();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not reset the order.'));
    }
  };

  if (isLoading) return <Spinner />;

  // True as soon as any arrangement has been saved; the reset button and the
  // explanatory line both hang off it.
  const anyPlaced = rows.some((product) => product.placed);

  return (
    <div className={styles.section}>
      {/*
        Dropping a row saves the whole list, so the arrangement is all-or-
        nothing: either the shop follows the admin or it ranks automatically.
        Anything in between would leave nobody able to say what the order is.
      */}
      <p className={styles.hint}>
        {anyPlaced
          ? 'Your order is in use. The shop and the bot list products exactly as arranged below, except that sold-out products always sink to the bottom.'
          : 'Drag a product by its handle to arrange the shop yourself. Until then products are ordered automatically — discounted first, then best selling.'}
      </p>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          loading={isResetting}
          disabled={!anyPlaced}
          onClick={() => void reset()}
        >
          <ArrowCounterClockwise size={16} weight="bold" /> Reset to automatic order
        </Button>
        {isSaving ? <span className={styles.rowMeta}>Saving…</span> : null}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <Reorder.Group as="div" axis="y" values={rows} onReorder={setRows} className={styles.section}>
        {rows.map((product) => (
          <ProductRow key={product.id} product={product} onDragEnd={() => void persist(rows)} />
        ))}
      </Reorder.Group>
    </div>
  );
}
