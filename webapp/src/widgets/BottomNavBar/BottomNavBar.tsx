import { Storefront, Wallet, Receipt, SlidersHorizontal } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';

import { useGetMeQuery } from '@entities/user';
import { haptics } from '@shared/lib/telegram';
import styles from './BottomNavBar.module.css';

const TABS = [
  { to: '/', label: 'Store', icon: Storefront },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/orders', label: 'Orders', icon: Receipt },
] as const;

const PANEL_TAB = { to: '/panel', label: 'Panel', icon: SlidersHorizontal } as const;

export function BottomNavBar() {
  const { pathname } = useLocation();
  const { data: user } = useGetMeQuery();

  // Shown last, and only to admins. The route itself and every endpoint it
  // calls check membership server-side, so hiding it is presentation only.
  const tabs = user?.isAdmin ? [...TABS, PANEL_TAB] : TABS;

  return (
    <nav className={styles.nav} data-tabs={tabs.length}>
      {tabs.map((tab) => {
        // A detail route under /panel should keep the Panel tab lit.
        const active = tab.to === '/' ? pathname === '/' : pathname.startsWith(tab.to);
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
