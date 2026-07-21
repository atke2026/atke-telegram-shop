import { ShieldWarning } from '@phosphor-icons/react';
import { useState } from 'react';

import { useGetMeQuery } from '@entities/user';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import { AdminAdmins } from './sections/AdminAdmins';
import { AdminDeposits } from './sections/AdminDeposits';
import { AdminOverview } from './sections/AdminOverview';
import { AdminProducts } from './sections/AdminProducts';
import { AdminUsers } from './sections/AdminUsers';
import styles from './PanelPage.module.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'deposits', label: 'Deposits' },
  { id: 'products', label: 'Products' },
  { id: 'users', label: 'Users' },
  { id: 'admins', label: 'Admins' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PanelPage() {
  const { data: user, isLoading } = useGetMeQuery();
  const [tab, setTab] = useState<TabId>('overview');

  if (isLoading) {
    return (
      <Screen title="Panel">
        <Spinner />
      </Screen>
    );
  }

  // Hiding the UI is courtesy, not security: every endpoint behind it
  // re-checks the admins table and answers 403 regardless of what is rendered.
  if (!user?.isAdmin) {
    return (
      <Screen title="Panel">
        <EmptyState
          icon={ShieldWarning}
          title="Administrators only"
          description="This area is not available for your account."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Panel">
      <div className={styles.tabs}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === tab ? styles.tabActive : styles.tab}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <AdminOverview /> : null}
      {tab === 'deposits' ? <AdminDeposits /> : null}
      {tab === 'products' ? <AdminProducts /> : null}
      {tab === 'users' ? <AdminUsers /> : null}
      {tab === 'admins' ? <AdminAdmins currentTelegramId={user.telegramId} /> : null}
    </Screen>
  );
}
