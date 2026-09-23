import { CaretRight, Star } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetAdminFeedbackQuery, type AdminFeedbackRow } from '@entities/admin';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';
import feedbackStyles from './AdminFeedback.module.css';

const STARS = [1, 2, 3, 4, 5];

function Stars({ rating }: { rating: number }) {
  return (
    <span className={feedbackStyles.stars} aria-label={`${rating} out of 5`}>
      {STARS.map((star) => (
        <Star
          key={star}
          size={15}
          weight={star <= rating ? 'fill' : 'regular'}
          className={star <= rating ? feedbackStyles.lit : feedbackStyles.dim}
        />
      ))}
    </span>
  );
}

export function AdminFeedback() {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isFetching } = useGetAdminFeedbackQuery({ offset });

  // The server pages 30 at a time; the pages are stitched back into one list,
  // exactly as the Users tab does.
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);

  useEffect(() => {
    if (!data) return;
    setRows((prev) => {
      if (offset === 0) return data.entries;
      const seen = new Set(prev.map((entry) => entry.id));
      return [...prev, ...data.entries.filter((entry: AdminFeedbackRow) => !seen.has(entry.id))];
    });
  }, [data, offset]);

  const total = data?.total ?? 0;
  const hasMore = rows.length < total;

  if (isLoading) return <Spinner />;

  if (rows.length === 0) {
    return (
      <div className={styles.section}>
        <EmptyState
          icon={Star}
          title="No feedback yet"
          description="Ratings appear here as customers answer the prompt."
        />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <p className={styles.statValue}>{data?.average?.toFixed(1) ?? '—'}</p>
          <p className={styles.statLabel}>Average rating</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{total}</p>
          <p className={styles.statLabel}>Responses</p>
        </div>
      </div>

      {rows.map((entry) => (
        <Card
          key={entry.id}
          // The whole row is the target rather than the name alone: a username
          // is a small thing to hit on a phone, and there is nothing else on
          // the row to tap by mistake.
          onClick={() => navigate(`/panel/users/${entry.user.telegramId}`)}
        >
          <div className={styles.rowHead} style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {entry.user.username ? `@${entry.user.username}` : (entry.user.firstName ?? 'Unknown')}
                {entry.user.isBanned ? ' · banned' : ''}
              </p>
              <p className={styles.rowMeta}>
                {entry.user.telegramId} · {new Date(entry.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <Stars rating={entry.rating} />
            <CaretRight size={16} className={styles.chevron} />
          </div>
        </Card>
      ))}

      {hasMore ? (
        isFetching ? (
          <Spinner />
        ) : (
          <Button variant="secondary" fullWidth onClick={() => setOffset(rows.length)}>
            Load more
          </Button>
        )
      ) : null}
    </div>
  );
}
