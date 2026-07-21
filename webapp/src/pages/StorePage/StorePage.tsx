import { MagnifyingGlass, Package } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { useGetProductsQuery, type ProductDto } from '@entities/product';
import { ProductSheet } from '@features/buy-product';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import { ProductGrid } from '@widgets/ProductGrid';
import styles from './StorePage.module.css';

export function StorePage() {
  const { data: products, isLoading, isError, refetch } = useGetProductsQuery();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ProductDto | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products ?? [];

    return (products ?? []).filter((product) => product.name.toLowerCase().includes(needle));
  }, [products, query]);

  return (
    <Screen title="Shop Deals">
      <div className={styles.search}>
        <MagnifyingGlass size={18} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Search products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
          title={query ? 'No matches' : 'No products yet'}
          description={query ? 'Try a different search.' : 'Please check back soon.'}
        />
      ) : null}

      {visible.length > 0 ? <ProductGrid products={visible} onSelect={setSelected} /> : null}

      <ProductSheet
        product={selected}
        onClose={() => {
          setSelected(null);
          // Stock changes after a purchase, so the grid is refreshed on close.
          void refetch();
        }}
      />
    </Screen>
  );
}
