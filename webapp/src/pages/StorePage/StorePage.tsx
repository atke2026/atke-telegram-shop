import { Package } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';

import { useGetProductsQuery, type ProductDto } from '@entities/product';
import { ProductSheet } from '@features/buy-product';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import { ProductGrid } from '@widgets/ProductGrid';
import styles from './StorePage.module.css';

const CATEGORIES = ['All', 'AI', 'Design', 'Learning', 'Security', 'Software'] as const;
type Category = (typeof CATEGORIES)[number];

function categoryFor(name: string): Exclude<Category, 'All'> {
  const value = name.toLowerCase();
  if (/canva|figma|lovable|gamma|design/.test(value)) return 'Design';
  if (/coursera|udemy|course|learning/.test(value)) return 'Learning';
  if (/vpn|security|nord|quillbot/.test(value)) return 'Security';
  if (/ai|gpt|gemini|factory|elevenlabs|notion/.test(value)) return 'AI';
  return 'Software';
}

export function StorePage() {
  const { data: products, isLoading, isError, refetch } = useGetProductsQuery();
  const [category, setCategory] = useState<Category>('All');
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<ProductDto | null>(null);
  // Set when the customer came in through a card's Buy button rather than the
  // card itself: the sheet then opens on its confirmation step.
  const [buyNow, setBuyNow] = useState(false);

  const visible = useMemo(() => {
    if (category === 'All') return products ?? [];
    return (products ?? []).filter((product) => categoryFor(product.name) === category);
  }, [products, category]);

  // Stable identities, so the memoised cards do not all re-render whenever
  // this page does.
  const openProduct = useCallback((product: ProductDto) => {
    setBuyNow(false);
    setSelected(product);
  }, []);

  const openConfirmation = useCallback((product: ProductDto) => {
    setBuyNow(true);
    setSelected(product);
  }, []);

  const closeSheet = useCallback(() => {
    setSelected(null);
    // Stock changes after a purchase, so the grid is refreshed on close.
    void refetch();
  }, [refetch]);

  const toggleFavorite = useCallback((product: ProductDto) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(product.id)) next.delete(product.id);
      else next.add(product.id);
      return next;
    });
  }, []);

  return (
    <Screen title="Shop" hideHeader>
      <div className={styles.categories} role="tablist" aria-label="Product categories">
        {CATEGORIES.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={category === entry}
            className={category === entry ? styles.categoryActive : styles.category}
            onClick={() => setCategory(entry)}
          >
            {entry}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner label="Loading products" /> : null}

      {isError ? (
        <EmptyState
          icon={Package}
          title="Could not load products"
          description="Check your connection and try again."
        />
      ) : null}

      {!isLoading && !isError && visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title={category === 'All' ? 'No products yet' : `No ${category} products`}
          description={category === 'All' ? 'Please check back soon.' : 'Try another category.'}
        />
      ) : null}

      {visible.length > 0 ? (
        <ProductGrid
          products={visible}
          favorites={favorites}
          onFavorite={toggleFavorite}
          onSelect={openProduct}
          onBuy={openConfirmation}
        />
      ) : null}

      <ProductSheet product={selected} startConfirming={buyNow} onClose={closeSheet} />
    </Screen>
  );
}
