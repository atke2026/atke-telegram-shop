import { Check, Power, Trash, UploadSimple } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import {
  useGetAdminMaintenanceQuery,
  useSetAdminMaintenanceImageMutation,
  useSetAdminMaintenanceMutation,
} from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { compressImage } from '@shared/lib/compressImage';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import styles from './shared.module.css';

/**
 * Turns the shop's maintenance mode on and off, and edits the notice everyone
 * but admins sees while it is on. The image and message are shared with the
 * bot, so a change here shows up in both places.
 */
export function AdminMaintenance() {
  const { data, isLoading } = useGetAdminMaintenanceQuery();
  const [setMaintenance, { isLoading: saving }] = useSetAdminMaintenanceMutation();
  const [setImage, { isLoading: savingImage }] = useSetAdminMaintenanceImageMutation();

  const [message, setMessage] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Seed the editor from the server once, then leave the admin's edits alone.
  const seeded = useRef(false);
  useEffect(() => {
    if (data && !seeded.current) {
      setMessage(data.message ?? '');
      seeded.current = true;
    }
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  const toggle = async () => {
    setError(null);
    try {
      await setMaintenance({ enabled: !data.enabled }).unwrap();
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not change maintenance mode.'));
    }
  };

  const saveMessage = async () => {
    setError(null);
    try {
      await setMaintenance({ message: message.trim() || null }).unwrap();
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not save the message.'));
    }
  };

  const chooseImage = async (file: File) => {
    setError(null);
    setPreparing(true);
    try {
      const compressed = await compressImage(file);
      setPendingImage(compressed.dataUrl);
    } catch {
      setError('That image could not be read.');
    } finally {
      setPreparing(false);
    }
  };

  const applyImage = async () => {
    if (!pendingImage) return;
    setError(null);
    try {
      await setImage({ imageBase64: pendingImage }).unwrap();
      setPendingImage(null);
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not upload that image.'));
    }
  };

  const removeImage = async () => {
    setError(null);
    try {
      await setImage({ imageBase64: null }).unwrap();
      setPendingImage(null);
      haptics.notify('success');
    } catch (cause) {
      haptics.notify('error');
      setError(apiErrorMessage(cause, 'Could not remove the image.'));
    }
  };

  const previewSrc = pendingImage ?? data.imageUrl;

  return (
    <div className={styles.section}>
      <Card className={styles.row}>
        <div className={styles.rowHead}>
          <div className={styles.rowMain}>
            <p className={styles.rowTitle}>Maintenance mode</p>
            <p className={styles.rowMeta}>
              {data.enabled
                ? 'ON — customers see the notice; only admins can use the shop.'
                : 'OFF — the shop is open to everyone.'}
            </p>
          </div>
          <span className={styles.badge}>{data.enabled ? '🟢 ON' : '⚪️ OFF'}</span>
        </div>
        <Button
          variant={data.enabled ? 'secondary' : 'primary'}
          loading={saving}
          onClick={() => void toggle()}
        >
          <Power size={16} weight="bold" /> {data.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </Card>

      <Card className={styles.row}>
        <p className={styles.rowTitle}>Notice message</p>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="e.g. We are briefly down for maintenance and will be back shortly."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <p className={styles.hint}>Left blank, a default message is shown.</p>
        <div className={styles.actions}>
          <Button loading={saving} onClick={() => void saveMessage()}>
            <Check size={16} weight="bold" /> Save message
          </Button>
        </div>
      </Card>

      <Card className={styles.row}>
        <p className={styles.rowTitle}>Notice image</p>
        <div className={styles.logoRow}>
          {previewSrc ? (
            <img className={styles.logoPreview} src={previewSrc} alt="" />
          ) : (
            <span className={styles.badge}>No image</span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void chooseImage(file);
              event.target.value = '';
            }}
          />
          <Button variant="secondary" loading={preparing} onClick={() => fileInput.current?.click()}>
            <UploadSimple size={16} weight="bold" /> {previewSrc ? 'Pick another' : 'Choose image'}
          </Button>
        </div>

        <div className={styles.actions}>
          {pendingImage ? (
            <>
              <Button loading={savingImage} onClick={() => void applyImage()}>
                <Check size={16} weight="bold" /> Save image
              </Button>
              <Button variant="ghost" onClick={() => setPendingImage(null)}>
                Cancel
              </Button>
            </>
          ) : data.imageUrl ? (
            <Button variant="ghost" loading={savingImage} onClick={() => void removeImage()}>
              <Trash size={16} /> Remove image
            </Button>
          ) : null}
        </div>
      </Card>

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
