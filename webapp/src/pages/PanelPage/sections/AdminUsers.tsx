import { CaretRight, MagnifyingGlass, Users } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetAdminUsersQuery } from '@entities/admin';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

export function AdminUsers() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { data, isLoading, isFetching } = useGetAdminUsersQuery({ query: query.trim() || undefined });

  return (
    <div className={styles.section}>
      <div className={styles.searchWrap}>
        <MagnifyingGlass size={17} className={styles.searchIcon} />
        <input
          className={styles.input}
          placeholder="Name, @username or Telegram ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && (data?.users.length ?? 0) === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? 'No matching users' : 'No users yet'}
          description={query ? 'Try a different search.' : undefined}
        />
      ) : null}

      {data ? (
        <p className={styles.hint}>
          {data.total} user{data.total === 1 ? '' : 's'}
          {isFetching ? ' · updating…' : ''}
        </p>
      ) : null}

      {(data?.users ?? []).map((user) => (
        <Card key={user.id} onClick={() => navigate(`/panel/users/${user.telegramId}`)}>
          <div className={styles.rowHead} style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {user.firstName ?? 'Unknown'}
                {user.username ? ` (@${user.username})` : ''}
                {user.isBanned ? ' · banned' : ''}
              </p>
              <p className={styles.rowMeta}>
                {user.telegramId} · {user.orderCount} order{user.orderCount === 1 ? '' : 's'} ·{' '}
                {user.totalSpent.label} spent
              </p>
            </div>
            <p className={styles.rowAmount}>{user.balance.label}</p>
            <CaretRight size={16} className={styles.chevron} />
          </div>
        </Card>
      ))}
    </div>
  );
}
