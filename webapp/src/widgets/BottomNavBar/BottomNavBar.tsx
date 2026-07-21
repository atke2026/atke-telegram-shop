import { Storefront, Wallet, Receipt } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';

import { haptics } from '@shared/lib/telegram';
import styles from './BottomNavBar.module.css';

const TABS = [
  { to: '/', label: 'Store', icon: Storefront },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/orders', label: 'Orders', icon: Receipt },
] as const;

export function BottomNavBar() {
  const { pathname } = useLocation();

  return (
    <nav className={styles.nav}>
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        const Icon = tab.icon;

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={styles.tab}
            onClick={() => {
              if (!active) haptics.select();
            }}
          >
            {/* The pill slides between tabs instead of fading in place. */}
            {active ? (
              <motion.span
                layoutId="nav-pill"
                className={styles.pill}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            ) : null}
            <span className={active ? styles.contentActive : styles.content}>
              <Icon size={22} weight={active ? 'fill' : 'regular'} />
              <span className={styles.label}>{tab.label}</span>
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
