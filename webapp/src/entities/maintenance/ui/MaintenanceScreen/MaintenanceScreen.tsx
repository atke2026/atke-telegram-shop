import styles from './MaintenanceScreen.module.css';

interface MaintenanceScreenProps {
  message: string | null;
  imageUrl: string | null;
}

/**
 * Full-screen takeover shown to non-admins while maintenance mode is on. It
 * replaces the whole app — there is no navigation out of it — so the store
 * cannot be used until an admin turns maintenance off.
 */
export function MaintenanceScreen({ message, imageUrl }: MaintenanceScreenProps) {
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        {imageUrl ? (
          <img className={styles.image} src={imageUrl} alt="" />
        ) : (
          <div className={styles.emoji}>🛠</div>
        )}
        <h1 className={styles.title}>Under maintenance</h1>
        <p className={styles.message}>
          {message ?? 'We are briefly down for maintenance and will be back shortly.'}
        </p>
      </div>
    </main>
  );
}
