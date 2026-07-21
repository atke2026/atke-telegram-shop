import { Trash, UserPlus } from '@phosphor-icons/react';
import { useState } from 'react';

import { useGetAdminsQuery, useGrantAdminMutation, useRevokeAdminMutation } from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

export function AdminAdmins({ currentTelegramId }: { currentTelegramId: string }) {
  const { data: admins, isLoading } = useGetAdminsQuery();
  const [grant, { isLoading: granting }] = useGrantAdminMutation();
  const [revoke] = useRevokeAdminMutation();
  const [telegramId, setTelegramId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await grant({ telegramId }).unwrap();
      haptics.notify('success');
      setTelegramId('');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not grant access.'));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await revoke(id).unwrap();
      haptics.notify('success');
      setConfirmingId(null);
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not revoke access.'));
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className={styles.section}>
      <Card className={styles.row}>
        <p className={styles.rowTitle}>Grant admin access</p>
        <div className={styles.inlineForm}>
          <input
            className={styles.input}
            inputMode="numeric"
            placeholder="Telegram user ID"
            value={telegramId}
            onChange={(event) => setTelegramId(event.target.value.replace(/\D/g, ''))}
          />
          <Button loading={granting} disabled={telegramId.length < 5} onClick={() => void add()}>
            <UserPlus size={16} /> Add
          </Button>
        </div>
        <p className={styles.hint}>
          The person must have opened the bot at least once. Their ID is shown on any deposit they
          send.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
      </Card>

      {(admins ?? []).map((admin) => {
        const isSelf = admin.telegramId === currentTelegramId;

        return (
          <Card key={admin.telegramId} className={styles.row}>
            <div className={styles.rowHead}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {admin.firstName ?? 'Unknown'}
                  {admin.username ? ` (@${admin.username})` : ''}
                  {isSelf ? ' · you' : ''}
                </p>
                <p className={styles.rowMeta}>{admin.telegramId}</p>
                {admin.note ? <p className={styles.rowMeta}>{admin.note}</p> : null}
              </div>

              {/* Two taps to revoke: it is an easy action to hit by accident. */}
              {confirmingId === admin.telegramId ? (
                <div className={styles.actions}>
                  <Button variant="ghost" onClick={() => setConfirmingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="secondary" onClick={() => void remove(admin.telegramId)}>
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmingId(admin.telegramId)}>
                  <Trash size={16} />
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
