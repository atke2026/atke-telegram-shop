import {
  ArrowLeft,
  ArrowsClockwise,
  ChartLineUp,
  CheckCircle,
  Clock,
  CurrencyCircleDollar,
  ShieldWarning,
  WarningCircle,
  Wallet,
} from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetMoneyAnalyticsQuery } from '@entities/admin';
import { useGetMeQuery } from '@entities/user';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EmptyState } from '@shared/ui/EmptyState';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import { useTelegramBackButton } from '@shared/lib/useTelegramBackButton';
import styles from './MoneyAnalyticsPage.module.css';

type PresetId =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'sevenDays'
  | 'month'
  | 'lastMonth'
  | 'year'
  | 'custom';

interface DateSelection {
  from: string;
  to: string;
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'sevenDays', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

function todayInAddis(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function rangeFor(preset: Exclude<PresetId, 'custom'>, today: string): DateSelection {
  const [year, month] = today.split('-');

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'sevenDays':
      return { from: addDays(today, -6), to: today };
    case 'week': {
      const [y, m, d] = today.split('-').map(Number);
      const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
      return { from: addDays(today, -(weekday === 0 ? 6 : weekday - 1)), to: today };
    }
    case 'month':
      return { from: `${year}-${month}-01`, to: today };
    case 'lastMonth': {
      const firstThisMonth = `${year}-${month}-01`;
      const lastPreviousMonth = addDays(firstThisMonth, -1);
      return {
        from: `${lastPreviousMonth.slice(0, 7)}-01`,
        to: lastPreviousMonth,
      };
    }
    case 'year':
      return { from: `${year}-01-01`, to: today };
  }
}

function isNonZero(amount: string): boolean {
  return Number(amount) !== 0;
}

export function MoneyAnalyticsPage() {
  const navigate = useNavigate();
  const goBack = useCallback(() => navigate('/panel'), [navigate]);
  useTelegramBackButton(goBack);

  const { data: user, isLoading: userLoading } = useGetMeQuery();
  const today = useMemo(todayInAddis, []);
  const [preset, setPreset] = useState<PresetId>('today');
  const [selection, setSelection] = useState<DateSelection>(() => rangeFor('today', today));
  const validRange = selection.from.length === 10 && selection.to.length === 10 &&
    selection.from <= selection.to;
  const { data, isLoading, isFetching, isError, refetch } = useGetMoneyAnalyticsQuery(selection, {
    skip: !user?.isAdmin || !validRange,
  });

  const choosePreset = (next: PresetId) => {
    setPreset(next);
    if (next !== 'custom') setSelection(rangeFor(next, today));
  };

  if (userLoading) {
    return (
      <Screen title="Money analytics">
        <Spinner />
      </Screen>
    );
  }

  if (!user?.isAdmin) {
    return (
      <Screen title="Money analytics">
        <EmptyState
          icon={ShieldWarning}
          title="Administrators only"
          description="This financial workspace is not available for your account."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Money analytics">
      <Button className={styles.back} variant="ghost" onClick={goBack}>
        <ArrowLeft size={17} /> Back to panel
      </Button>

      <div className={styles.presets}>
        {PRESETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={preset === entry.id ? styles.presetActive : styles.preset}
            onClick={() => choosePreset(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <Card className={styles.dateCard}>
          <label>
            From
            <input
              type="date"
              max={selection.to || today}
              value={selection.from}
              onChange={(event) =>
                setSelection((current) => ({ ...current, from: event.target.value }))
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              min={selection.from}
              max={today}
              value={selection.to}
              onChange={(event) =>
                setSelection((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
        </Card>
      ) : null}

      <div className={styles.rangeLine}>
        <div>
          <span>
            {selection.from === selection.to
              ? selection.from
              : `${selection.from} → ${selection.to}`}
          </span>
          <span>{isFetching && data ? 'Refreshing…' : 'Addis Ababa time'}</span>
        </div>
        <button
          type="button"
          className={styles.refresh}
          disabled={isFetching || !validRange}
          aria-label="Refresh analytics"
          onClick={() => {
            if (validRange) void refetch();
          }}
        >
          <ArrowsClockwise size={17} />
        </button>
      </div>

      {!validRange ? (
        <EmptyState
          icon={WarningCircle}
          title="Invalid date range"
          description="The end date must be on or after the start date."
        />
      ) : null}
      {isLoading ? <Spinner label="Calculating money flow" /> : null}
      {isError ? (
        <Card className={styles.errorCard}>
          <WarningCircle size={22} />
          <div>
            <strong>Could not calculate analytics</strong>
            <p>Check the connection and try again.</p>
          </div>
          <Button variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : null}

      {data ? (
        <div className={styles.content}>
          <Card className={styles.hero}>
            <div className={styles.heroIcon}>
              <ChartLineUp size={25} weight="duotone" />
            </div>
            <p>Gross profit</p>
            <strong>{data.profit.gross.label}</strong>
            <span>
              {data.profit.marginPercent === null
                ? 'No settled sales'
                : `${data.profit.marginPercent}% margin`}
            </span>
          </Card>

          <div className={styles.statGrid}>
            <Metric
              icon={CurrencyCircleDollar}
              label="Settled sales"
              value={data.sales.settled.label}
              detail={`${data.sales.completedCount} completed order${data.sales.completedCount === 1 ? '' : 's'}`}
            />
            <Metric
              icon={Wallet}
              label="Cash received"
              value={data.cash.approvedDeposits.label}
              detail={`${data.cash.approvedCount} approved deposit${data.cash.approvedCount === 1 ? '' : 's'}`}
            />
            <Metric
              icon={Clock}
              label="Awaiting delivery"
              value={data.sales.pending.label}
              detail={`${data.sales.pendingCount} unresolved order${data.sales.pendingCount === 1 ? '' : 's'}`}
            />
            <Metric
              icon={ChartLineUp}
              label="YeneShop cost"
              value={data.yeneshop.spentETB.label}
              detail="Reseller API purchases"
            />
          </div>

          <section>
            <h2 className={styles.sectionTitle}>Order money flow</h2>
            <Card className={styles.rows}>
              <DetailRow
                label="Completed sales"
                value={data.sales.settled.label}
                meta={`${data.sales.completedCount} orders`}
              />
              <DetailRow
                label="Refunds processed"
                value={data.sales.refunds.label}
                meta={`${data.sales.refundCount} refunds`}
              />
              <DetailRow
                label="Cancelled without refund"
                value={data.sales.retainedCancellations.label}
                meta={`${data.sales.retainedCancellationCount} exceptions`}
                warning={data.sales.retainedCancellationCount > 0}
              />
              <DetailRow
                label="Manual wallet adjustments"
                value={data.wallet.manualAdjustments.label}
                meta="Selected range"
              />
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>YeneShop</h2>
            <Card className={styles.rows}>
              <DetailRow label="Confirmed reseller spend" value={data.yeneshop.spentETB.label} />
              <DetailRow
                label="Possible unresolved spend (all time)"
                value={data.yeneshop.possibleSpendETB.label}
                warning={isNonZero(data.yeneshop.possibleSpendETB.amount)}
              />
              <DetailRow
                label="Live reseller balance"
                value={data.yeneshop.liveBalanceETB?.label ?? 'Unavailable'}
              />
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Wallet reconciliation</h2>
            <Card className={styles.reconciliation}>
              <div className={styles.reconciliationHead}>
                {isNonZero(data.wallet.mismatch.amount) ? (
                  <WarningCircle size={24} className={styles.warningIcon} />
                ) : (
                  <CheckCircle size={24} className={styles.successIcon} />
                )}
                <div>
                  <strong>
                    {isNonZero(data.wallet.mismatch.amount)
                      ? 'Wallet mismatch found'
                      : 'Wallets reconcile'}
                  </strong>
                  <p>All-time ledger compared with current customer balances.</p>
                </div>
              </div>
              <div className={styles.reconciliationGrid}>
                <div>
                  <span>Actual wallets</span>
                  <strong>{data.wallet.actual.label}</strong>
                </div>
                <div>
                  <span>Ledger expected</span>
                  <strong>{data.wallet.expected.label}</strong>
                </div>
                <div>
                  <span>Difference</span>
                  <strong className={isNonZero(data.wallet.mismatch.amount) ? styles.warningText : ''}>
                    {data.wallet.mismatch.label}
                  </strong>
                </div>
              </div>
              {data.wallet.historicalOpeningCount > 0 ? (
                <p className={styles.note}>
                  {data.wallet.historicalOpeningAdjustment.label} was recorded as a transparent
                  historical opening adjustment when the ledger was introduced.
                </p>
              ) : null}
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Checks</h2>
            <Card className={styles.checkCard}>
              <CheckLine
                label="Awaiting delivery (all time)"
                value={data.anomalies.awaitingDelivery}
                warning={data.anomalies.awaitingDelivery > 0}
              />
              <CheckLine
                label="Completed YeneShop orders without ID"
                value={data.anomalies.completedYeneShopWithoutId}
                warning={data.anomalies.completedYeneShopWithoutId > 0}
              />
              <CheckLine
                label="Missing ledger events"
                value={data.anomalies.missingLedgerEvents}
                warning={data.anomalies.missingLedgerEvents > 0}
              />
              {data.range.estimatedEvents > 0 ? (
                <p className={styles.note}>
                  {data.range.estimatedEvents} historical event
                  {data.range.estimatedEvents === 1 ? '' : 's'} in this range use the closest
                  available timestamp from before the ledger existed.
                </p>
              ) : null}
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionTitle}>Profit by product</h2>
            {data.products.length === 0 ? (
              <Card className={styles.emptyProducts}>No completed sales in this range.</Card>
            ) : (
              <Card className={styles.productList}>
                {data.products.map((product) => (
                  <div key={product.productId} className={styles.product}>
                    <div className={styles.productHead}>
                      <strong>{product.name}</strong>
                      <strong>{product.profit.label}</strong>
                    </div>
                    <div className={styles.productMeta}>
                      <span>
                        {product.orders} order{product.orders === 1 ? '' : 's'} ·{' '}
                        {product.revenue.label} sales
                      </span>
                      <span>
                        {product.costETB.label} YeneShop cost
                      </span>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </Screen>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ChartLineUp;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className={styles.metric}>
      <Icon size={19} weight="duotone" />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  meta,
  warning = false,
}: {
  label: string;
  value: string;
  meta?: string;
  warning?: boolean;
}) {
  return (
    <div className={styles.detailRow}>
      <div>
        <span>{label}</span>
        {meta ? <small>{meta}</small> : null}
      </div>
      <strong className={warning ? styles.warningText : ''}>{value}</strong>
    </div>
  );
}

function CheckLine({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning: boolean;
}) {
  return (
    <div className={styles.checkLine}>
      {warning ? (
        <WarningCircle size={19} className={styles.warningIcon} />
      ) : (
        <CheckCircle size={19} className={styles.successIcon} />
      )}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
