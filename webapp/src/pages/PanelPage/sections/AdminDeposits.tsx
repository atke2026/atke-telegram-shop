import { CheckCircle, Receipt, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  useApproveDepositMutation,
  useGetAdminDepositsQuery,
  useRejectDepositMutation,
  type AdminDepositRow,
} from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { appPath } from '@shared/lib/appPath';
import { getInitData } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

/**
 * Receipts are fetched with the same initData credential as everything else,
 * which an <img src> cannot send — so the blob is fetched and turned into an
 * object URL only when an admin asks to see it.
 */
function ReceiptImage({ depositId }: { depositId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appPath(`/api/admin/deposits/${depositId}/receipt`), {
        headers: { Authorization: `tma ${getInitData()}` },
      });
      if (!response.ok) throw new Error(String(response.status));
      setUrl(URL.createObjectURL(await response.blob()));
    } catch {
      setError('Could not load the receipt.');
    } finally {
      setLoading(false);
    }
  };

  if (url) return <img className={styles.receipt} src={url} alt="Payment receipt" />;

  return (
    <>
      <Button variant="secondary" loading={loading} onClick={() => void load()}>
        View receipt
      </Button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  );
}

function DepositRow({ deposit }: { deposit: AdminDepositRow }) {
  const [approve, { isLoading: approving }] = useApproveDepositMutation();
  const [reject, { isLoading: rejecting }] = useRejectDepositMutation();
  const [error, setError] = useState<string | null>(null);

  const act = async (action: 'approve' | 'reject') => {
    setError(null);
    try {
      if (action === 'approve') await approve(deposit.id).unwrap();
      else await reject({ id: deposit.id }).unwrap();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not update this deposit.'));
    }
  };

  const busy = approving || rejecting;
  const name = deposit.user?.firstName ?? 'Unknown user';

  return (
    <Card className={styles.row}>
      <div className={styles.rowHead}>
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>
            {name}
            {deposit.user?.username ? ` (@${deposit.user.username})` : ''}
          </p>
          <p className={styles.rowMeta}>
            {deposit.user?.telegramId ?? '—'} · balance {deposit.user?.balance.label ?? '—'}
          </p>
          <p className={styles.rowMeta}>{new Date(deposit.createdAt).toLocaleString()}</p>
        </div>
        <p className={styles.rowAmount}>{deposit.amount.label}</p>
      </div>

      {deposit.hasReceiptImage ? (
        <ReceiptImage depositId={deposit.id} />
      ) : (
        <p className={styles.hint}>Receipt was sent to your Telegram chat.</p>
      )}

      {deposit.status === 'PENDING' ? (
        <div className={styles.actions}>
          <Button variant="secondary" loading={rejecting} disabled={busy} onClick={() => void act('reject')}>
            <XCircle size={16} /> Reject
          </Button>
          <Button fullWidth loading={approving} disabled={busy} onClick={() => void act('approve')}>
            <CheckCircle size={16} /> Approve {deposit.amount.label}
          </Button>
        </div>
      ) : (
        <span className={styles.badge}>{deposit.status}</span>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </Card>
  );
}

export function AdminDeposits() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const { data: deposits, isLoading } = useGetAdminDepositsQuery(status);

  return (
    <div className={styles.section}>
      <div className={styles.actions}>
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((value) => (
          <Button
            key={value}
            variant={value === status ? 'primary' : 'secondary'}
            onClick={() => setStatus(value)}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && (deposits?.length ?? 0) === 0 ? (
        <EmptyState icon={Receipt} title={`No ${status.toLowerCase()} deposits`} />
      ) : null}

      {(deposits ?? []).map((deposit) => (
        <DepositRow key={deposit.id} deposit={deposit} />
      ))}
    </div>
  );
}
