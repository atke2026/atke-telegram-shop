import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import type { ProductDto } from '@entities/product';
import { usePlaceOrderMutation } from '@entities/order';
import { useGetMeQuery } from '@entities/user';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import styles from './ProductSheet.module.css';

interface ProductSheetProps {
  product: ProductDto | null;
  onClose: () => void;
}

/** Bottom sheet holding product detail and the purchase confirmation. */
export function ProductSheet({ product, onClose }: ProductSheetProps) {
  const { data: user } = useGetMeQuery();
  const [placeOrder, { isLoading }] = usePlaceOrderMutation();
  const [confirming, setConfirming] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A newly opened sheet must never inherit the previous product's state.
  useEffect(() => {
    setConfirming(false);
    setShowInstructions(false);
    setError(null);
  }, [product?.id]);

  const affordable =
    user && product ? Number(user.balance.amount) >= Number(product.price.amount) : true;

  const buy = async () => {
    if (!product) return;

    setError(null);
    try {
      await placeOrder({ productId: product.id }).unwrap();
      haptics.notify('success');
      onClose();
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Purchase failed. Please try again.'));
      setConfirming(false);
    }
  };

  return (
    <AnimatePresence>
      {product ? (
        <>
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className={styles.grabber} />
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} weight="bold" />
            </button>

            <div className={styles.scroll}>
              <img className={styles.logo} src={product.logoUrl} alt="" width={72} height={72} />
              <h2 className={styles.name}>{product.name}</h2>
              <p className={styles.price}>
                {product.listPrice ? (
                  <span className={styles.wasPrice}>{product.listPrice.label}</span>
                ) : null}
                {product.price.label}
              </p>
              {product.discountLabel ? (
                <p className={styles.discountLine}>🏷 {product.discountLabel}</p>
              ) : null}
              <p className={styles.stock}>
                {product.inStock ? `${product.stock} in stock` : 'Out of stock'}
              </p>

              <AnimatePresence initial={false}>
                {showInstructions && product.details ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className={styles.details}>{product.details}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <footer className={styles.footer}>
              {error ? <p className={styles.error}>{error}</p> : null}

              {!product.inStock ? (
                <Button fullWidth disabled>
                  Out of stock
                </Button>
              ) : !affordable ? (
                <Button fullWidth disabled>
                  Balance too low
                </Button>
              ) : confirming ? (
                <div className={styles.confirmRow}>
                  <Button variant="secondary" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                  <Button fullWidth loading={isLoading} onClick={() => void buy()}>
                    Confirm {product.price.label}
                  </Button>
                </div>
              ) : (
                <div className={styles.buyRow}>
                  <Button fullWidth onClick={() => setConfirming(true)}>
                    Buy for {product.price.label}
                  </Button>

                  {/* Narrow, to the right of Buy: the instructions matter, but
                      not enough to push the purchase off the first screen. */}
                  {product.details ? (
                    <Button
                      variant={showInstructions ? 'primary' : 'secondary'}
                      className={styles.infoButton}
                      aria-label={showInstructions ? 'Hide instructions' : 'Show instructions'}
                      onClick={() => setShowInstructions((current) => !current)}
                    >
                      <Info size={18} weight={showInstructions ? 'fill' : 'regular'} />
                      <span className={styles.infoLabel}>Info</span>
                    </Button>
                  ) : null}
                </div>
              )}
            </footer>
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
