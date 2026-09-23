import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

import { ThemeMenu } from '@shared/ui/ThemeMenu';
import styles from './Screen.module.css';

/**
 * Route-level wrapper. Owns the cross-fade page transition so every page gets
 * the same entrance without repeating motion props.
 */
export function Screen({
  title,
  children,
  stickyHeader = false,
  hideHeader = false,
}: {
  title: string;
  children: ReactNode;
  /** Keeps a route's app bar visible while its content scrolls. */
  stickyHeader?: boolean;
  /** Routes with a purpose-built hero can omit the generic title row. */
  hideHeader?: boolean;
}) {
  return (
    <motion.main
      className={styles.screen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {hideHeader ? null : (
        <header className={stickyHeader ? styles.headerSticky : styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <ThemeMenu />
        </header>
      )}
      {children}
    </motion.main>
  );
}
