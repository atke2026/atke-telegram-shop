import { motion } from 'framer-motion';

import { ProductCard, type ProductDto } from '@entities/product';
import styles from './ProductGrid.module.css';

interface ProductGridProps {
  products: ProductDto[];
  onSelect: (product: ProductDto) => void;
}

export function ProductGrid({ products, onSelect }: ProductGridProps) {
  return (
    <div className={styles.grid}>
      {products.map((product, index) => (
        <motion.div
          key={product.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          // Staggered entrance, capped so a long list does not crawl in.
          transition={{ delay: Math.min(index * 0.04, 0.32), duration: 0.28 }}
        >
          <ProductCard product={product} onSelect={onSelect} />
        </motion.div>
      ))}
    </div>
  );
}
