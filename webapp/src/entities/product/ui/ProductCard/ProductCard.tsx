import { Card } from '@shared/ui/Card';
import type { ProductDto } from '../../api/productApi';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: ProductDto;
  onSelect: (product: ProductDto) => void;
}

export function ProductCard({ product, onSelect }: ProductCardProps) {
  return (
    <Card className={styles.card} onClick={() => onSelect(product)}>
      <div className={styles.logoWrap}>
        <img
          className={styles.logo}
          src={product.logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          width={96}
          height={96}
        />
        {!product.inStock ? <span className={styles.soldOut}>Sold out</span> : null}
        {product.discountLabel ? (
          <span className={styles.discountBadge}>{product.discountLabel}</span>
        ) : null}
      </div>

      <div className={styles.body}>
        <p className={styles.name}>{product.name}</p>
        <p className={styles.price}>
          {product.listPrice ? (
            <span className={styles.wasPrice}>{product.listPrice.label}</span>
          ) : null}
          {product.price.label}
        </p>
      </div>
    </Card>
  );
}
