import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import { haptics } from '@shared/lib/telegram';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Hairline border and tight downward shadow, per the design rules. */
export function Card({ children, onClick, className }: CardProps) {
  const interactive = Boolean(onClick);

  return (
    <motion.div
      className={[styles.card, interactive ? styles.interactive : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={
        interactive
          ? () => {
              haptics.tap('light');
              onClick?.();
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}
