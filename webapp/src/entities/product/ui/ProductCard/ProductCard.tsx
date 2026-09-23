import { memo } from 'react';
import { Heart } from '@phosphor-icons/react';

import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';
import type { ProductDto } from '../../api/productApi';
import { ProductLogo } from '../ProductLogo';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: ProductDto;
  favorite: boolean;
  onFavorite: (product: ProductDto) => void;
  onSelect: (product: ProductDto) => void;
  /** Skips the product view and opens the sheet on its confirmation step. */
  onBuy: (product: ProductDto) => void;
  /** Set on the tiles that start on screen; the rest defer their logo. */
  eager?: boolean;
}

/**
 * Memoised because the whole grid re-renders on every keystroke in the search
 * box. The props are a stable product object and two callbacks the page holds
 * in useCallback, so a card only re-renders when its own product changes.
 */
export const ProductCard = memo(function ProductCard({
  product,
  favorite,
  onFavorite,
  onSelect,
  onBuy,
  eager = false,
}: ProductCardProps) {
  return (
    <Card className={styles.card} onClick={() => onSelect(product)}>
      <div className={styles.media}>
        <ProductLogo
          className={styles.logo}
          src={product.logoUrl}
          // Lazy-loading the tiles that are already on screen delays the one
          // thing the page is mostly made of; the first row loads immediately
          // and everything below it waits until it is scrolled towards.
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          width={96}
          height={96}
          iconSize={40}
        />

        <button
          type="button"
          className={favorite ? styles.favoriteActive : styles.favorite}
          aria-label={favorite ? `Remove ${product.name} from favorites` : `Save ${product.name}`}
          onClick={(event) => {
            event.stopPropagation();
            onFavorite(product);
          }}
        >
          <Heart size={18} weight={favorite ? 'fill' : 'regular'} />
        </button>

        {/* The discount sits on the artwork rather than in the text block: it
            costs the card no height there, and lands where the eye already is
            on a grid of images. */}
        {product.discountLabel ? (
          <span className={styles.discountBadge}>{product.discountLabel}</span>
        ) : null}
      </div>

      <div className={styles.body}>
        {/* One line, truncated. Names run from "Canva Pro" to "3 Month Spotify
            Premium Subscription", and reserving two lines for the long ones
            left an empty second line on every short one — which was most of
            the wasted height in the tile. */}
        <p className={styles.name} title={product.name}>
          {product.name}
        </p>

        {/*
          The struck-out price gets a line that is reserved whether or not it
          is filled. Two tiles side by side then put their real price on the
          same baseline, instead of the discounted one growing a line taller
          than its neighbour. A single row cannot hold both prices at this
          width — 'ETB' is spelled out — so laying them side by side would
          wrap and reintroduce the same ragged edge.
        */}
        <div className={styles.priceBlock}>
          <span className={styles.wasSlot}>
            {product.listPrice ? <s className={styles.wasPrice}>{product.listPrice.label}</s> : null}
          </span>
          <span className={styles.pricePrefix}>From</span>
          <span className={styles.price}>{product.price.label}</span>
        </div>

        {/* The card is the whole product view for most customers, so the
            purchase affordance belongs here. It opens the same confirmation
            the sheet does — nothing is bought from the grid in one tap. */}
        <Button
          className={styles.buy}
          fullWidth
          variant={product.inStock ? 'primary' : 'outline'}
          aria-label={
            product.inStock
              ? `Buy ${product.name}`
              : `View information for out-of-stock product ${product.name}`
          }
          onClick={(event) => {
            // Otherwise the Card underneath also fires and opens the product
            // view on top of the confirmation.
            event.stopPropagation();
            if (product.inStock) onBuy(product);
            else onSelect(product);
          }}
        >
          {product.inStock ? (product.input ? 'Select options' : 'Buy now') : 'Out of stock'}
        </Button>
      </div>
    </Card>
  );
});
