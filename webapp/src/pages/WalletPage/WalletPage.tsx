import {
  ArrowRight,
  CaretDown,
  ClockCounterClockwise,
  Headset,
  PlusCircle,
  Receipt,
  ShieldCheck,
  Wallet,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetDepositsQuery } from '@entities/deposit';
import { useGetMeQuery } from '@entities/user';
import { DepositForm } from '@features/request-deposit';
import { PaymentMethods } from '@widgets/PaymentMethods';
import { Card } from '@shared/ui/Card';
import { SUPPORT_URL } from '@shared/config/support';
import { getTelegramUser, haptics } from '@shared/lib/telegram';
import { Screen } from '@shared/ui/Screen';
import { Spinner } from '@shared/ui/Spinner';
import { ThemeMenu } from '@shared/ui/ThemeMenu';
import { UserAvatar } from '@widgets/TopAppBar';
import styles from './WalletPage.module.css';

export function WalletPage() {
  const navigate = useNavigate();
  const { data: user, isLoading: loadingUser } = useGetMeQuery();
  const { data: deposits, isLoading: loadingDeposits } = useGetDepositsQuery();
  const [fundingOpen, setFundingOpen] = useState(false);
  const telegramUser = getTelegramUser();

  const pending = deposits?.deposits ?? [];
  const displayName =
    user?.firstName ?? telegramUser?.first_name ?? user?.username ?? telegramUser?.username ?? 'Suq customer';
  const username = user?.username ?? telegramUser?.username;
  const openFunding = () => {
    setFundingOpen(true);
    haptics.tap();
    window.setTimeout(() => {
      document.getElementById('add-funds')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  return (
    <Screen title="Profile" hideHeader>
      <section className={styles.profileHero}>
        <UserAvatar large />
        <div className={styles.identity}>
          <h1>{displayName}</h1>
          <p>{username ? `@${username}` : 'Suq customer'}</p>
        </div>
      </section>

      <Card className={styles.balanceCard}>
        <div>
          <p className={styles.balanceLabel}>Available balance</p>
          {loadingUser ? <Spinner /> : <p className={styles.balance}>{user?.balance.label ?? '—'}</p>}
        </div>
        <a
          className={styles.addFunds}
          href="#add-funds"
          onClick={(event) => {
            event.preventDefault();
            openFunding();
          }}
        >
          <Wallet size={18} weight="fill" />
          Add funds
        </a>
      </Card>

      <div className={styles.quickActions}>
        <button
          type="button"
          className={styles.quickAction}
          onClick={() => {
            haptics.tap();
            navigate('/orders');
          }}
        >
          <span className={styles.quickIcon}><Receipt size={20} weight="fill" /></span>
          <ArrowRight className={styles.quickArrow} size={17} />
          <span className={styles.quickCopy}>
            <strong>My orders</strong>
            <small>Purchases & delivery</small>
          </span>
        </button>

        <ThemeMenu variant="tile" />

        <a
          className={styles.quickAction}
          href="#add-funds"
          onClick={(event) => {
            event.preventDefault();
            openFunding();
          }}
        >
          <span className={styles.quickIcon}><PlusCircle size={21} weight="fill" /></span>
          <ArrowRight className={styles.quickArrow} size={17} />
          <span className={styles.quickCopy}>
            <strong>Add funds</strong>
            <small>Top up your wallet</small>
          </span>
        </a>

        <a
          className={styles.quickAction}
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => haptics.tap()}
        >
          <span className={styles.quickIcon}><Headset size={21} weight="fill" /></span>
          <ArrowRight className={styles.quickArrow} size={17} />
          <span className={styles.quickCopy}>
            <strong>Support</strong>
            <small>Get help from us</small>
          </span>
        </a>

        {user?.isAdmin ? (
          <button
            type="button"
            className={styles.quickAction}
            onClick={() => {
              haptics.tap();
              navigate('/panel');
            }}
          >
            <span className={styles.quickIcon}><ShieldCheck size={20} weight="fill" /></span>
            <ArrowRight className={styles.quickArrow} size={17} />
            <span className={styles.quickCopy}>
              <strong>Admin panel</strong>
              <small>Manage Suq.et</small>
            </span>
          </button>
        ) : null}
      </div>

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

      <div id="add-funds" className={styles.fundingCard}>
        <button
          type="button"
          className={styles.fundingToggle}
          aria-expanded={fundingOpen}
          onClick={() => {
            haptics.tap();
            setFundingOpen((current) => !current);
          }}
        >
          <span className={styles.fundingIcon}><Wallet size={21} weight="fill" /></span>
          <span className={styles.fundingHeading}>
            <strong>Add funds</strong>
            <small>Choose an account and upload your receipt</small>
          </span>
          <CaretDown className={fundingOpen ? styles.fundingCaretOpen : styles.fundingCaret} size={19} weight="bold" />
        </button>

        {fundingOpen ? (
          <div className={styles.fundingContent}>
            {loadingDeposits ? (
              <Spinner />
            ) : (
              <>
                <PaymentMethods methods={deposits?.paymentMethods ?? []} />
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Amount and receipt</h2>
                  <DepositForm minimumLabel={deposits?.minimum.label ?? '—'} />
                </section>
              </>
            )}
          </div>
        ) : null}
      </div>

    </Screen>
  );
}
