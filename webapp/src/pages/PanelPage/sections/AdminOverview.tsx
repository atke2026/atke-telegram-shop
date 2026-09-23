import { ArrowsClockwise, ChartLineUp } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetAdminSummaryQuery, useSyncProductsMutation } from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

export function AdminOverview() {
  const navigate = useNavigate();
  const { data, isLoading } = useGetAdminSummaryQuery();
  const [sync, { isLoading: syncing }] = useSyncProductsMutation();
  const [message, setMessage] = useState<string | null>(null);

  if (isLoading) return <Spinner />;

  const runSync = async () => {
    setMessage(null);
    try {
      const result = await sync().unwrap();
      setMessage(`Synced ${result.synced} product(s) from YeneShop.`);
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Sync failed.'));
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.statGrid}>
        <Card className={styles.stat}>
          <p className={styles.statValue}>{data?.deposits.pending ?? 0}</p>
          <p className={styles.statLabel}>Deposits awaiting review</p>
        </Card>
        <Card className={styles.stat}>
          <p className={styles.statValue}>{data?.deposits.pendingTotal.label ?? '—'}</p>
          <p className={styles.statLabel}>Pending value</p>
        </Card>
        <Card className={styles.stat}>
          <p className={styles.statValue}>{data?.products.active ?? 0}</p>
          <p className={styles.statLabel}>Active products</p>
        </Card>
        <Card className={styles.stat}>
          <p className={styles.statValue}>
            {data?.yeneshop.balance?.label ?? '—'}
          </p>
          <p className={styles.statLabel}>YeneShop reseller balance</p>
        </Card>
      </div>

      {data?.products.outOfStock ? (
        <p className={styles.hint}>{data.products.outOfStock} product(s) are out of stock upstream.</p>
      ) : null}

      <Button variant="secondary" fullWidth onClick={() => navigate('/panel/analytics')}>
        <ChartLineUp size={17} /> Open money analytics
      </Button>

      <Button variant="secondary" fullWidth loading={syncing} onClick={() => void runSync()}>
        <ArrowsClockwise size={17} /> Sync catalogue from YeneShop
      </Button>

      {message ? <p className={styles.hint}>{message}</p> : null}
    </div>
  );
}
