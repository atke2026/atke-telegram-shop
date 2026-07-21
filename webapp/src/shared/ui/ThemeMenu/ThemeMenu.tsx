import { Check, DeviceMobile, Moon, Sun } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { haptics } from '@shared/lib/telegram';
import { getThemeMode, setThemeMode, THEME_MODES, type ThemeMode } from '@shared/lib/theme';
import styles from './ThemeMenu.module.css';

const ICONS: Record<ThemeMode, typeof Sun> = {
  telegram: DeviceMobile,
  light: Sun,
  dark: Moon,
};

export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(() => getThemeMode());

  // Escape closes it, matching the scrim tap.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const choose = (next: ThemeMode) => {
    setThemeMode(next);
    setMode(next);
    haptics.select();
    setOpen(false);
  };

  const CurrentIcon = ICONS[mode];

  return (
    <div className={styles.wrap}>
      <motion.button
        type="button"
        className={styles.trigger}
        aria-label="Change theme"
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => {
          haptics.tap('light');
          setOpen((current) => !current);
        }}
      >
        <CurrentIcon size={19} weight="regular" />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <>
            {/* Catches the tap that dismisses the menu. */}
            <div className={styles.scrim} onClick={() => setOpen(false)} />

            <motion.div
              className={styles.menu}
              initial={{ opacity: 0, scale: 0.94, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            >
              {THEME_MODES.map((entry) => {
                const Icon = ICONS[entry.id];
                const selected = entry.id === mode;

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={selected ? styles.itemSelected : styles.item}
                    onClick={() => choose(entry.id)}
                  >
                    <Icon size={17} />
                    <span className={styles.label}>{entry.label}</span>
                    {selected ? <Check size={15} weight="bold" /> : null}
                  </button>
                );
              })}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
