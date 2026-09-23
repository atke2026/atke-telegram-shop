import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';

import { useSetProductAvailabilityMutation } from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import styles from './editors.module.css';

/** Suq-owned YeneShop sale switch; catalogue refreshes cannot undo it. */
export function ProductAvailability({
  slug,
  available,
}: {
  slug: string;
  available: boolean;
}) {
  const [setAvailability, { isLoading }] = useSetProductAvailabilityMutation();
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setError(null);
    try {
      await setAvailability({ slug, available: !available }).unwrap();
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not change product availability.'));
    }
  };

  return (
    <div className={styles.availability}>
      <Button variant="secondary" loading={isLoading} onClick={() => void change()}>
        {available ? (
          <>
            <EyeSlash size={16} weight="bold" /> Mark unavailable
          </>
        ) : (
          <>
            <Eye size={16} weight="bold" /> Make available
          </>
        )}
      </Button>
      <p className={styles.note}>
        {available
          ? 'Following YeneShop stock. Turning this off shows it as sold out everywhere.'
          : 'Unavailable by you on both the bot and web shop.'}
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
