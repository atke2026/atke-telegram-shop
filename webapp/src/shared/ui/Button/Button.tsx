import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

import { haptics } from '@shared/lib/telegram';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

/**
 * The plan's tactile rule lives here rather than in each call site: every
 * button scales down on press with spring physics and fires a light haptic,
 * so the whole app feels consistent by construction.
 */
export function Button({
  variant = 'primary',
  fullWidth = false,
  loading = false,
  disabled,
  children,
  onClick,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      className={[styles.button, styles[variant], fullWidth ? styles.fullWidth : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={isDisabled}
      onClick={(event) => {
        if (isDisabled) return;
        haptics.tap('light');
        onClick?.(event);
      }}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-label="Loading" /> : children}
    </motion.button>
  );
}
