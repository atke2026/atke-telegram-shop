import { CaretDown, Check, Copy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import type { PaymentMethodDto } from '@entities/deposit';
import { haptics } from '@shared/lib/telegram';
import styles from './PaymentMethods.module.css';

/** One compact payment-method picker followed by the selected account. */
export function PaymentMethods({ methods }: { methods: PaymentMethodDto[] }) {
  const [selectedId, setSelectedId] = useState(methods[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!methods.some((method) => method.id === selectedId)) {
      setSelectedId(methods[0]?.id ?? '');
    }
  }, [methods, selectedId]);

  const selected = methods.find((method) => method.id === selectedId) ?? methods[0];
  if (!selected) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(selected.accountNumber);
      haptics.notify('success');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      haptics.notify('error');
    }
  };

  return (
    <div className={styles.picker}>
      <p className={styles.label}>Pay with</p>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          haptics.tap();
          setOpen((current) => !current);
        }}
      >
        <MethodLogo method={selected} />
        <span className={styles.triggerText}>
          <strong>{selected.name}</strong>
          <small>Choose payment method</small>
        </span>
        <CaretDown className={open ? styles.caretOpen : styles.caret} size={18} weight="bold" />
      </button>

      {open ? (
        <div className={styles.options} role="listbox" aria-label="Payment method">
          {methods.map((method) => {
            const active = method.id === selected.id;
            return (
              <button
                key={method.id}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? styles.optionSelected : styles.option}
                onClick={() => {
                  setSelectedId(method.id);
                  setOpen(false);
                  setCopied(false);
                  haptics.select();
                }}
              >
                <MethodLogo method={method} />
                <span>{method.name}</span>
                {active ? <Check size={17} weight="bold" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.accountCard}>
        <span className={styles.sendLabel}>Send to</span>
        <strong className={styles.account}>{selected.accountNumber}</strong>
        <span className={styles.holder}>{selected.accountName}</span>
        <button type="button" className={styles.copyButton} onClick={() => void copy()}>
          {copied ? <Check size={16} weight="bold" /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy account'}
        </button>
      </div>
    </div>
  );
}

function MethodLogo({ method }: { method: PaymentMethodDto }) {
  return (
    <img
      className={styles.logo}
      src={method.logoUrl}
      alt=""
      width={42}
      height={42}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}
