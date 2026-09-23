import { CaretRight, MagnifyingGlass, Users } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetAdminUsersQuery, type AdminUserRow } from '@entities/admin';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

export function AdminUsers() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const search = query.trim() || undefined;

  const { data, isLoading, isFetching } = useGetAdminUsersQuery({ query: search, offset });

  // The server pages 30 at a time; we stitch the pages back into one list so
  // the whole user base is scrollable rather than capped at the first page.
  const [rows, setRows] = useState<AdminUserRow[]>([]);

  // A new search term starts the list over from the top. Reset synchronously
  // with the term (not in an effect) so no fetch fires at the old offset.
  const onSearchChange = (value: string) => {
    setQuery(value);
    setOffset(0);
    setRows([]);
  };

  useEffect(() => {
    if (!data) return;
    setRows((prev) => {
      if (offset === 0) return data.users;
      // Dedupe by id so a double-run effect can never append a page twice.
      const seen = new Set(prev.map((user) => user.id));
      return [...prev, ...data.users.filter((user) => !seen.has(user.id))];
    });
  }, [data, offset]);

  const total = data?.total ?? 0;
  const hasMore = rows.length < total;

  const loadMore = () => {
    if (!isFetching && hasMore) setOffset(rows.length);
  };

  // Auto-load as the sentinel nears the viewport; the button below is the
  // manual fallback for when it never scrolls into view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetching) setOffset(rows.length);
      },
      { rootMargin: '240px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isFetching, rows.length]);

  return (
    <div className={styles.section}>
      <div className={styles.searchWrap}>
        <MagnifyingGlass size={17} className={styles.searchIcon} />
        <input
          className={styles.input}
          placeholder="Name, @username or Telegram ID"
          value={query}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? 'No matching users' : 'No users yet'}
          description={query ? 'Try a different search.' : undefined}
        />
      ) : null}

      {data ? (
        <p className={styles.hint}>
          Showing {rows.length} of {total} user{total === 1 ? '' : 's'}
          {isFetching ? ' · updating…' : ''}
        </p>
      ) : null}

      {rows.map((user) => (
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

      {hasMore ? (
        <>
          <div ref={sentinelRef} aria-hidden />
          {isFetching ? (
            <Spinner />
          ) : (
            <Button variant="secondary" fullWidth onClick={loadMore}>
              Load more
            </Button>
          )}
        </>
      ) : null}
    </div>
  );
}
