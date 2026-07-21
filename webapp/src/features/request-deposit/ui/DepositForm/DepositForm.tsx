import { UploadSimple, CheckCircle } from '@phosphor-icons/react';
import { useRef, useState } from 'react';

import { useRequestDepositMutation } from '@entities/deposit';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import styles from './DepositForm.module.css';

/** Matches the server's own limit, so an oversized file fails here not there. */
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export function DepositForm({ minimumLabel }: { minimumLabel: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<{ name: string; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [requestDeposit, { isLoading }] = useRequestDepositMutation();

  const pickFile = (file: File) => {
    if (file.size > MAX_RECEIPT_BYTES) {
      setError('That image is larger than 5MB. Please choose a smaller one.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setReceipt({ name: file.name, dataUrl: String(reader.result) });
      setError(null);
      haptics.select();
    };
    reader.onerror = () => setError('Could not read that image.');
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!receipt) return;

    setError(null);
    try {
      await requestDeposit({ amountETB: amount, receiptBase64: receipt.dataUrl }).unwrap();
      haptics.notify('success');
      setDone(true);
      setAmount('');
      setReceipt(null);
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not submit your deposit.'));
    }
  };

  if (done) {
    return (
      <Card className={styles.success}>
        <CheckCircle size={36} weight="fill" className={styles.successIcon} />
        <p className={styles.successTitle}>Deposit submitted</p>
        <p className={styles.successBody}>
          An admin will review your receipt shortly. You will get a message when it is approved.
        </p>
        <Button variant="secondary" onClick={() => setDone(false)}>
          Submit another
        </Button>
      </Card>
    );
  }

  return (
    <Card className={styles.card}>
      <label className={styles.label} htmlFor="deposit-amount">
        Amount (ETB)
      </label>
      <input
        id="deposit-amount"
        className={styles.input}
        // `decimal` keeps the numeric keypad up without rejecting a decimal point.
        inputMode="decimal"
        placeholder={`Minimum ${minimumLabel}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))}
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) pickFile(file);
        }}
      />

      <button type="button" className={styles.dropzone} onClick={() => fileInput.current?.click()}>
        {receipt ? (
          <>
            <img className={styles.preview} src={receipt.dataUrl} alt="" />
            <span className={styles.fileName}>{receipt.name}</span>
          </>
        ) : (
          <>
            <UploadSimple size={26} weight="duotone" />
            <span>Upload payment receipt</span>
          </>
        )}
      </button>

      {error ? <p className={styles.error}>{error}</p> : null}

      <Button
        fullWidth
        loading={isLoading}
        disabled={!amount || !receipt}
        onClick={() => void submit()}
      >
        Submit for review
      </Button>
    </Card>
  );
}
