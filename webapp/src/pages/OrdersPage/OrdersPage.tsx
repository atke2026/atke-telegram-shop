import { Receipt } from '@phosphor-icons/react';

import { OrderCard, useGetOrdersQuery } from '@entities/order';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import styles from './OrdersPage.module.css';

export function OrdersPage() {
  const { data: orders, isLoading } = useGetOrdersQuery();

  return (
    <Screen title="Orders">
      {isLoading ? <Spinner label="Loading orders" /> : null}

      {!isLoading && (orders?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No orders yet"
          description="Anything you buy will appear here with its license keys."
        />
      ) : null}

      <div className={styles.list}>
        {(orders ?? []).map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </Screen>
  );
}
