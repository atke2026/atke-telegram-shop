import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import {
  getInitData,
  getTelegramUser,
  hasConfirmedTelegram,
  haptics,
  openSuqBot,
} from '@shared/lib/telegram';
import styles from './TelegramAuthSheet.module.css';

interface TelegramAuthSheetProps {
  onContinue: () => void;
}

export function TelegramAuthSheet({ onContinue }: TelegramAuthSheetProps) {
  const [identity, setIdentity] = useState(() => ({
    initData: getInitData(),
    user: getTelegramUser(),
  }));
  const user = identity.user;
  const hasCredentials = Boolean(identity.initData);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Telegram user';
  const initial = fullName.trim().charAt(0).toUpperCase() || 'S';

  useEffect(() => {
    const refresh = () => {
      const initData = getInitData();
      const user = getTelegramUser();
      setIdentity((current) =>
        current.initData === initData && current.user?.id === user?.id
          ? current
          : { initData, user },
      );
    };

    refresh();
    const timer = window.setInterval(refresh, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 5_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // A returning user may receive Telegram's launch data shortly after the
  // first paint. Once it arrives, honour the saved confirmation automatically.
  useEffect(() => {
    if (identity.initData && hasConfirmedTelegram()) onContinue();
  }, [identity.initData, onContinue]);

  return (
    <main className={styles.screen}>
      <div className={styles.brand} aria-hidden="true">
        Suq<span>●</span>
      </div>

      <div className={styles.scrim} />
      <motion.section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-auth-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <div className={styles.handle} />
        <p className={styles.eyebrow}>Secure sign in</p>
        <h1 id="telegram-auth-title">Continue with Telegram</h1>
        <p className={styles.copy}>
          Suq uses your Telegram account to protect your wallet and orders. No password is needed.
        </p>

        <div className={styles.account}>
          {user?.photo_url ? (
            <img className={styles.avatar} src={user.photo_url} alt="" width="54" height="54" />
          ) : (
            <span className={styles.avatar} aria-hidden="true">{initial}</span>
          )}
          <div className={styles.identity}>
            <strong>{fullName}</strong>
            <span>{user?.username ? `@${user.username}` : 'Telegram account'}</span>
            {user?.id ? <small>ID {user.id}</small> : null}
          </div>
        </div>

        <button
          className={styles.telegramButton}
          type="button"
          onClick={() => {
            haptics.tap('medium');
            if (getInitData()) onContinue();
            else openSuqBot();
          }}
        >
          Continue with Telegram
        </button>

        {!hasCredentials ? (
          <p className={styles.warning}>Tap continue to reopen Suq.et securely from the Telegram bot.</p>
        ) : (
          <p className={styles.privacy}>Telegram verifies this request without sharing your phone number.</p>
        )}
      </motion.section>
    </main>
  );
}
