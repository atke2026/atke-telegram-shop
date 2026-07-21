import styles from './Spinner.module.css';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.dot} />
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}
