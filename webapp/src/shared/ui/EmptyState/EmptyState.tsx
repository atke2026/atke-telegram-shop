import type { Icon } from '@phosphor-icons/react';

import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: Icon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: IconComponent, title, description }: EmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <IconComponent size={44} weight="duotone" className={styles.icon} />
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
    </div>
  );
}
