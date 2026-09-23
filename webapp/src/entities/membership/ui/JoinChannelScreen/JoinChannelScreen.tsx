import styles from './JoinChannelScreen.module.css';

interface JoinChannelScreenProps {
  channel: string;
  joinUrl: string;
  isChecking: boolean;
  onRetry(): void;
}

/** Full-app gate shown when the API reports that the Telegram user has not joined. */
export function JoinChannelScreen({
  channel,
  joinUrl,
  isChecking,
  onRetry,
}: JoinChannelScreenProps) {
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.emoji}>📣</div>
        <h1 className={styles.title}>Join our channel</h1>
        <p className={styles.message}>
          Join {channel} to access Suq and receive product updates.
        </p>

        <a className={styles.primaryButton} href={joinUrl} target="_blank" rel="noreferrer">
          Join {channel}
        </a>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onRetry}
          disabled={isChecking}
        >
          {isChecking ? 'Checking…' : "I've joined"}
        </button>
      </div>
    </main>
  );
}
