import { PaperPlaneTilt, Receipt } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import { useGetMeQuery } from '@entities/user';
import { SUPPORT_URL } from '@shared/config/support';
import { getTelegramUser, haptics } from '@shared/lib/telegram';
import styles from './TopAppBar.module.css';

export function UserAvatar({ large = false }: { large?: boolean }) {
  const { data: user } = useGetMeQuery();
  const telegramUser = getTelegramUser();
  const initial = (user?.firstName ?? telegramUser?.first_name ?? 'S').trim().charAt(0).toUpperCase();

  return telegramUser?.photo_url ? (
    <img
      className={large ? styles.avatarLarge : styles.avatar}
      src={telegramUser.photo_url}
      alt=""
      width={large ? 72 : 38}
      height={large ? 72 : 38}
    />
  ) : (
    <span className={large ? styles.avatarLarge : styles.avatar} aria-hidden="true">
      {initial}
    </span>
  );
}

export function TopAppBar() {
  const navigate = useNavigate();

  return (
    <header className={styles.bar}>
      <button className={styles.brand} type="button" onClick={() => navigate('/')}>
        Suq<span className={styles.brandMark}>●</span>
      </button>

      <div className={styles.actions}>
        <a
          className={styles.circleAction}
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with Suq customer support"
          title="Chat with @erminana"
          onClick={() => haptics.tap()}
        >
          <PaperPlaneTilt size={19} weight="fill" />
        </a>
        <button
          className={styles.ordersAction}
          type="button"
          onClick={() => {
            haptics.tap();
            navigate('/orders');
          }}
        >
          <Receipt size={18} weight="fill" />
          Orders
        </button>
        <button
          className={styles.avatarButton}
          type="button"
          aria-label="Open profile and wallet"
          onClick={() => {
            haptics.tap();
            navigate('/profile');
          }}
        >
          <UserAvatar />
        </button>
      </div>
    </header>
  );
}
