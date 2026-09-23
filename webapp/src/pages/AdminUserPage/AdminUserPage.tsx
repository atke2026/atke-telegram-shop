import { ArrowLeft, Check, Copy, Eye, Prohibit, ShieldCheck } from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  useAdjustBalanceMutation,
  useGetAdminUserQuery,
  useLazyGetAdminOrderItemsQuery,
  useSetUserBannedMutation,
  type AdminUserDetail,
} from '@entities/admin';
import { itemToText } from '@entities/order';
import { useGetMeQuery } from '@entities/user';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { useTelegramBackButton } from '@shared/lib/useTelegramBackButton';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import styles from './AdminUserPage.module.css';

type AdminOrder = AdminUserDetail['orders'][number];

/**
 * One order, with what was actually delivered.
 *
 * The count is shown unconditionally because it answers the usual support
 * question — "did anything arrive?" — and, when it is zero on a completed
 * order, points at an upstream delivery that silently returned nothing. The
 * contents are fetched only when asked for: that request is logged.
 */
function AdminOrderRow({ order }: { order: AdminOrder }) {
  const [fetchItems, { data, isFetching, isError }] = useLazyGetAdminOrderItemsQuery();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const missing = order.status === 'COMPLETED' && order.deliveredItemCount === 0;

  const reveal = () => {
    setShown(true);
    haptics.tap('light');
    void fetchItems(order.id);
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      haptics.notify('success');
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      haptics.notify('error');
    }
  };

  const deliveredTexts = data?.deliveredItems.map(itemToText) ?? [];

  return (
    <Card className={styles.orderRow}>
      <div className={styles.listRow}>
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>{order.productName}</p>
          <p className={styles.meta}>
            {order.status} · {new Date(order.createdAt).toLocaleString()}
          </p>
          <p className={missing ? styles.deliveryBad : styles.meta}>
            {order.deliveredItemCount === null
              ? 'Not fulfilled'
              : missing
                ? '⚠ Nothing was delivered'
                : `${order.deliveredItemCount} item(s) delivered`}
          </p>
        </div>
        <p className={styles.rowAmount}>{order.pricePaid.label}</p>
      </div>

      {order.deliveredItemCount ? (
        shown ? (
          <div className={styles.delivery}>
            {isFetching ? <Spinner /> : null}
            {isError ? <p className={styles.error}>Could not load the delivered items.</p> : null}
            {deliveredTexts.map((text, index) => (
              <div key={index} className={styles.deliveryItemRow}>
                <pre className={styles.deliveryItem}>{text}</pre>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => void copy(text, String(index))}
                >
                  {copied === String(index) ? <Check size={14} /> : <Copy size={14} />}
                  {copied === String(index) ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
            {deliveredTexts.length > 1 ? (
              <Button
                variant="ghost"
                onClick={() => void copy(deliveredTexts.join('\n\n'), 'all')}
              >
                {copied === 'all' ? <Check size={16} /> : <Copy size={16} />}
                {copied === 'all' ? 'Copied all' : 'Copy all'}
              </Button>
            ) : null}
            {data?.yeneshopOrderId ? (
              <p className={styles.meta}>YeneShop order {data.yeneshopOrderId}</p>
            ) : null}
          </div>
        ) : (
          <Button variant="ghost" onClick={reveal}>
            <Eye size={16} /> Show item
          </Button>
        )
      ) : null}
    </Card>
  );
}

export function AdminUserPage() {
  const { telegramId = '' } = useParams();
  const navigate = useNavigate();
  const { data: me } = useGetMeQuery();
  const { data, isLoading, isError } = useGetAdminUserQuery(telegramId);

  const [adjustBalance, { isLoading: adjusting }] = useAdjustBalanceMutation();
  const [setBanned, { isLoading: banning }] = useSetUserBannedMutation();
  const [delta, setDelta] = useState('');
  const [error, setError] = useState<string | null>(null);

  const goBack = useCallback(() => navigate('/panel'), [navigate]);
  useTelegramBackButton(goBack);

  if (isLoading) {
    return (
      <Screen title="User">
        <Spinner />
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen title="User">
        <EmptyState icon={Prohibit} title="Could not load this user" />
        <Button variant="secondary" fullWidth onClick={goBack}>
          Back to panel
        </Button>
      </Screen>
    );
  }

  const { user, totals, orders, deposits } = data;
  const isSelf = me?.telegramId === user.telegramId;

  const applyDelta = async () => {
    setError(null);
    try {
      await adjustBalance({ telegramId: user.telegramId, deltaETB: delta }).unwrap();
      haptics.notify('success');
      setDelta('');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not adjust the balance.'));
    }
  };

  const toggleBan = async () => {
    setError(null);
    try {
      await setBanned({ telegramId: user.telegramId, banned: !user.isBanned }).unwrap();
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not change the ban status.'));
    }
  };

  return (
    <Screen title={user.firstName ?? 'User'}>
      <button type="button" className={styles.back} onClick={goBack}>
        <ArrowLeft size={15} /> Panel
      </button>

      <Card className={styles.identity}>
        <p className={styles.name}>
          {user.firstName ?? 'Unknown'}
          {user.username ? <span className={styles.handle}> @{user.username}</span> : null}
        </p>
        <p className={styles.meta}>ID {user.telegramId}</p>
        <p className={styles.meta}>Joined {new Date(user.createdAt).toLocaleDateString()}</p>
        {user.isBanned ? <span className={styles.banned}>Banned</span> : null}

        <p className={styles.balance}>{user.balance.label}</p>
        <p className={styles.meta}>Current balance</p>
      </Card>

      <div className={styles.statGrid}>
        <Card className={styles.stat}>
          <p className={styles.statValue}>{totals.deposited.label}</p>
          <p className={styles.statLabel}>Deposited ({totals.depositCount})</p>
        </Card>
        <Card className={styles.stat}>
          <p className={styles.statValue}>{totals.spent.label}</p>
          <p className={styles.statLabel}>Spent ({totals.orderCount} orders)</p>
        </Card>
      </div>

      <h2 className={styles.sectionTitle}>Adjust balance</h2>
      <Card className={styles.actionCard}>
        <div className={styles.inlineForm}>
          <input
            className={styles.input}
            inputMode="text"
            placeholder="e.g. 500 or -500"
            value={delta}
            onChange={(event) => setDelta(event.target.value.replace(/[^\d.-]/g, ''))}
          />
          <Button loading={adjusting} disabled={!delta} onClick={() => void applyDelta()}>
            Apply
          </Button>
        </div>
        <p className={styles.hint}>
          Negative debits. The customer is notified of the new balance.
        </p>

        {/* Banning yourself would lock you out of your own account. */}
        {!isSelf ? (
          <Button variant="secondary" fullWidth loading={banning} onClick={() => void toggleBan()}>
            {user.isBanned ? (
              <>
                <ShieldCheck size={16} /> Unban this user
              </>
            ) : (
              <>
                <Prohibit size={16} /> Ban this user
              </>
            )}
          </Button>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
      </Card>

      <h2 className={styles.sectionTitle}>Orders</h2>
      {orders.length === 0 ? (
        <p className={styles.hint}>No orders yet.</p>
      ) : (
        orders.map((order) => <AdminOrderRow key={order.id} order={order} />)
      )}

      <h2 className={styles.sectionTitle}>Deposits</h2>
      {deposits.length === 0 ? (
        <p className={styles.hint}>No deposits yet.</p>
      ) : (
        deposits.map((deposit) => (
          <Card key={deposit.id} className={styles.listRow}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{deposit.amount.label}</p>
              <p className={styles.meta}>
                {deposit.status} · {new Date(deposit.createdAt).toLocaleString()}
              </p>
            </div>
          </Card>
        ))
      )}
    </Screen>
  );
}
