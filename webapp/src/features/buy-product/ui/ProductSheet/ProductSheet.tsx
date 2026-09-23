import { AnimatePresence, motion } from 'framer-motion';
import { Info, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { ProductLogo, stockLabel, type ProductDto } from '@entities/product';
import { itemToText, usePlaceOrderMutation, type PlaceOrderResponse } from '@entities/order';
import { useGetMeQuery } from '@entities/user';
import { apiErrorMessage } from '@shared/api/baseApi';
import { SUPPORT_URL } from '@shared/config/support';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import styles from './ProductSheet.module.css';

interface ProductSheetProps {
  product: ProductDto | null;
  onClose: () => void;
  /** Opens straight on the confirmation step, for the grid's Buy button. The
   *  step itself is never skipped: it is where the agreement is given and any
   *  detail the order needs is asked for. */
  startConfirming?: boolean;
}

/** Bottom sheet holding product detail and the purchase confirmation. */
export function ProductSheet({ product, onClose, startConfirming = false }: ProductSheetProps) {
  const { data: user } = useGetMeQuery();
  const [placeOrder, { isLoading }] = usePlaceOrderMutation();
  const [confirming, setConfirming] = useState(startConfirming);
  const [agreed, setAgreed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set on success: the sheet becomes a receipt instead of closing, so the
  // delivered item and its steps are on screen the moment they are paid for.
  const [purchased, setPurchased] = useState<PlaceOrderResponse['order'] | null>(null);
  const scroll = useRef<HTMLDivElement>(null);

  // A newly opened sheet must never inherit the previous product's state.
  useEffect(() => {
    setConfirming(startConfirming);
    setAgreed(false);
    setShowInstructions(false);
    setAnswer('');
    setError(null);
    setPurchased(null);
  }, [product?.id, startConfirming]);

  // All three views share this one element, so React keeps its scroll offset
  // across them: opening the Info panel, scrolling, then tapping Buy would
  // otherwise drop the customer into the middle of the agreement, below the
  // heading telling them what they are agreeing to.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [confirming, purchased]);

  const affordable =
    user && product ? Number(user.balance.amount) >= Number(product.price.amount) : true;

  const copyItem = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      haptics.notify('success');
    } catch {
      haptics.notify('error');
    }
  };

  const buy = async () => {
    if (!product) return;

    setError(null);
    try {
      const response = await placeOrder({
        productId: product.id,
        ...(product.input ? { customerInput: answer.trim() } : {}),
      }).unwrap();
      haptics.notify('success');
      setPurchased(response.order);
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

            <div className={styles.scroll} ref={scroll}>
              {purchased ? (
                <div className={styles.receipt}>
                  <p className={styles.receiptTitle}>
                    {purchased.awaitingDelivery ? '✅ Payment received' : '✅ Purchase complete'}
                  </p>
                  <p className={styles.receiptName}>{purchased.productName}</p>

                  {/* Some products are prepared for each customer by hand, so
                      there is nothing to show yet. That is not the same as a
                      delivery having gone wrong, and must not read like one. */}
                  {purchased.awaitingDelivery ? (
                    <p className={styles.receiptPending}>
                      ⏳ YeneShop is preparing this order. It will appear in Orders and in your
                      chat shortly.
                    </p>
                  ) : purchased.deliveredItems.length > 0 ? (
                    <>
                      {purchased.deliveredItems.map((item, index) => {
                        const text = itemToText(item);
                        return (
                          <pre
                            key={index}
                            className={styles.receiptItem}
                            onClick={() => void copyItem(text)}
                          >
                            {text}
                          </pre>
                        );
                      })}
                      <p className={styles.receiptHint}>Tap to copy · also saved in Orders</p>
                    </>
                  ) : (
                    <p className={styles.receiptPending}>
                      Delivery is taking longer than usual. It will appear in Orders —{' '}
                      <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
                        contact support
                      </a>{' '}
                      if it does not arrive.
                    </p>
                  )}

                  {purchased.instructions ? (
                    <div className={styles.receiptSteps}>
                      <p className={styles.receiptStepsTitle}>📖 How to use it</p>
                      <p className={styles.receiptStepsBody}>{purchased.instructions}</p>
                    </div>
                  ) : null}
                </div>
              ) : confirming ? (
                <div className={styles.agreement}>
                  <p className={styles.agreementEyebrow}>Review before purchase</p>
                  <h2 className={styles.agreementName}>{product.name}</h2>
                  {/* Carries the discount over from the product view: this is
                      the screen the decision is made on, so dropping it here
                      would hide the saving at exactly the wrong moment. */}
                  <p className={styles.agreementPrice}>
                    {product.listPrice ? (
                      <span className={styles.wasPrice}>{product.listPrice.label}</span>
                    ) : null}
                    {product.price.label}
                  </p>
                  {product.discountLabel ? (
                    <p className={styles.discountLine}>🏷 {product.discountLabel}</p>
                  ) : null}

                  {/* Some products cannot be fulfilled without something from
                      the buyer. Asked for here rather than after paying,
                      because an order that arrives without it is one the
                      operator has to chase the customer for. */}
                  {product.input ? (
                    <div className={styles.inputField}>
                      <label className={styles.inputLabel} htmlFor="product-input">
                        {product.input.placeholder ?? 'We need one more detail'}
                      </label>
                      <input
                        id="product-input"
                        className={styles.input}
                        inputMode={product.input.type === 'NUMBER' ? 'tel' : 'text'}
                        placeholder={product.input.placeholder ?? ''}
                        value={answer}
                        autoComplete="off"
                        onChange={(event) => setAnswer(event.target.value)}
                      />
                      <p className={styles.inputHint}>
                        This is sent to us with your order so we can complete it.
                      </p>
                    </div>
                  ) : null}

                  {/* Only asked for when there is something to read. Most of
                      the catalogue has no description yet, and a tickbox
                      confirming you have read "no information was provided"
                      is friction that informs nobody — those products get the
                      plain confirmation the shop has always had, and gain the
                      agreement automatically once their copy is written. */}
                  {product.details ? (
                    <>
                      <div className={styles.agreementDetailsCard}>
                        <p className={styles.agreementDetailsTitle}>Full product information</p>
                        <p className={styles.agreementDetails}>{product.details}</p>
                      </div>

                      <label className={styles.agreementCheck}>
                        <input
                          type="checkbox"
                          checked={agreed}
                          onChange={(event) => {
                            setAgreed(event.target.checked);
                            haptics.select();
                          }}
                        />
                        <span>
                          I have read and agree to the product information, delivery conditions,
                          warranty and limitations shown above.
                        </span>
                      </label>
                    </>
                  ) : null}
                </div>
              ) : (
                <>
                  <ProductLogo
                    className={styles.logo}
                    src={product.logoUrl}
                    width={72}
                    height={72}
                    iconSize={32}
                  />
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
                  <p className={styles.stock}>{stockLabel(product)}</p>

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
                </>
              )}
            </div>

            <footer className={styles.footer}>
              {error ? <p className={styles.error}>{error}</p> : null}

              {purchased ? (
                <Button fullWidth onClick={onClose}>
                  Done
                </Button>
              ) : confirming && product.inStock && affordable ? (
                <div className={styles.confirmRow}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirming(false);
                      setAgreed(false);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    fullWidth
                    loading={isLoading}
                    // Withheld until the buyer has both agreed to whatever
                    // there was to read and answered whatever was asked.
                    disabled={
                      (Boolean(product.details) && !agreed) ||
                      Boolean(product.input && answer.trim() === '')
                    }
                    onClick={() => void buy()}
                  >
                    {product.details ? 'Purchase now' : `Confirm ${product.price.label}`}
                  </Button>
                </div>
              ) : (
                <div className={styles.buyRow}>
                  {!product.inStock ? (
                    <Button fullWidth disabled>
                      Out of stock
                    </Button>
                  ) : !affordable ? (
                    <Button fullWidth disabled>
                      Balance too low
                    </Button>
                  ) : (
                    <Button
                      fullWidth
                      onClick={() => {
                        setAgreed(false);
                        setConfirming(true);
                      }}
                    >
                      Buy for {product.price.label}
                    </Button>
                  )}

                  {/* Narrow, to the right of Buy: the instructions matter, but
                      not enough to push the purchase off the first screen.
                      It remains available even when the customer cannot buy:
                      balance and stock control purchasing, not whether product
                      information may be read. */}
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
