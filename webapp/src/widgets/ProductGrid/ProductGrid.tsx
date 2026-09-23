import { ProductCard, type ProductDto } from '@entities/product';
import styles from './ProductGrid.module.css';

/** Past this many tiles the stagger stops adding delay, so a long catalogue
 *  does not crawl in one card at a time. */
const STAGGER_CAP = 8;

/** Roughly the first screenful. These load eagerly; everything below waits. */
const ABOVE_FOLD = 4;

interface ProductGridProps {
  products: ProductDto[];
  favorites: Set<string>;
  onFavorite: (product: ProductDto) => void;
  onSelect: (product: ProductDto) => void;
  onBuy: (product: ProductDto) => void;
}

export function ProductGrid({ products, favorites, onFavorite, onSelect, onBuy }: ProductGridProps) {
  return (
    <div className={styles.grid}>
      {products.map((product, index) => (
        <div
          key={product.id}
          className={styles.item}
          // The entrance was a framer-motion node per tile, which meant two
          // animation components per card and a JS-driven transform on every
          // one of them at mount. It is a CSS keyframe now: same fade-and-rise,
          // but composited off the main thread and free of the per-card
          // subscription cost that made a full grid feel heavy.
          style={{ animationDelay: `${Math.min(index, STAGGER_CAP) * 0.03}s` }}
        >
          <ProductCard
            product={product}
            favorite={favorites.has(product.id)}
            onFavorite={onFavorite}
            onSelect={onSelect}
            onBuy={onBuy}
            eager={index < ABOVE_FOLD}
          />
        </div>
      ))}
    </div>
  );
}
