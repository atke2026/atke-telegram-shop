import { ClockCounterClockwise } from '@phosphor-icons/react';

import { useGetDepositsQuery } from '@entities/deposit';
import { useGetMeQuery } from '@entities/user';
import { DepositForm } from '@features/request-deposit';
import { Card } from '@shared/ui/Card';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import styles from './WalletPage.module.css';

export function WalletPage() {
  const { data: user, isLoading: loadingUser } = useGetMeQuery();
  const { data: deposits, isLoading: loadingDeposits } = useGetDepositsQuery();

  const pending = deposits?.deposits ?? [];

  return (
    <Screen title="Wallet">
      <Card className={styles.balanceCard}>
        <p className={styles.balanceLabel}>Available balance</p>
        {loadingUser ? (
          <Spinner />
        ) : (
          <p className={styles.balance}>{user?.balance.label ?? '—'}</p>
        )}
      </Card>

      {pending.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Awaiting review</h2>
          {pending.map((deposit) => (
            <Card key={deposit.id} className={styles.pendingRow}>
              <ClockCounterClockwise size={18} className={styles.pendingIcon} />
              <span className={styles.pendingAmount}>{deposit.amount.label}</span>
              <span className={styles.pendingDate}>
                {new Date(deposit.createdAt).toLocaleDateString()}
              </span>
            </Card>
          ))}
        </section>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Top up</h2>
        {loadingDeposits ? (
          <Spinner />
        ) : (
          <DepositForm minimumLabel={deposits?.minimum.label ?? '—'} />
        )}
      </section>
    </Screen>
  );
}
