import {
  Check,
  CloudArrowDown,
  DownloadSimple,
  FloppyDisk,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import {
  useCreateBackupMutation,
  useDownloadBackupMutation,
  useGetBackupsQuery,
  useImportBackupMutation,
  useRestoreStoredBackupMutation,
  useSetBackupIntervalMutation,
} from '@entities/admin';
import { apiErrorMessage } from '@shared/api/baseApi';
import { haptics } from '@shared/lib/telegram';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Spinner } from '@shared/ui/Spinner';
import shared from './shared.module.css';
import styles from './AdminBackup.module.css';

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminBackup() {
  const { data, isLoading, refetch } = useGetBackupsQuery(undefined, {
    pollingInterval: 15_000,
  });
  const [setInterval, { isLoading: savingSchedule }] = useSetBackupIntervalMutation();
  const [createBackup, { isLoading: creating }] = useCreateBackupMutation();
  const [downloadBackup, { isLoading: downloading }] = useDownloadBackupMutation();
  const [restoreStored, { isLoading: restoringStored }] = useRestoreStoredBackupMutation();
  const [importBackup, { isLoading: importing }] = useImportBackupMutation();

  const [automatic, setAutomatic] = useState(false);
  const [hours, setHours] = useState('24');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!data || seeded.current) return;
    setAutomatic(data.intervalHours !== null);
    if (data.intervalHours !== null) setHours(String(data.intervalHours));
    seeded.current = true;
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  const fail = (cause: unknown, fallback: string) => {
    haptics.notify('error');
    setError(apiErrorMessage(cause, fallback));
    setSuccess(null);
  };

  const saveSchedule = async () => {
    setError(null);
    const interval = Number(hours);
    if (automatic && (!Number.isInteger(interval) || interval < 1 || interval > 720)) {
      setError('Enter a whole number from 1 to 720 hours.');
      return;
    }
    try {
      await setInterval(automatic ? interval : null).unwrap();
      haptics.notify('success');
      setSuccess(automatic ? `Automatic backup set to every ${interval} hours.` : 'Automatic backup disabled.');
    } catch (cause) {
      fail(cause, 'Could not save the backup schedule.');
    }
  };

  const download = async (name: string) => {
    setError(null);
    try {
      const blob = await downloadBackup(name).unwrap();
      saveBlob(blob, name);
      haptics.notify('success');
    } catch (cause) {
      fail(cause, 'Could not download the backup.');
    }
  };

  const backupNow = async () => {
    setError(null);
    setSuccess(null);
    try {
      const entry = await createBackup().unwrap();
      const blob = await downloadBackup(entry.name).unwrap();
      saveBlob(blob, entry.name);
      haptics.notify('success');
      setSuccess('Full backup created and downloaded.');
      await refetch();
    } catch (cause) {
      fail(cause, 'Could not create the full backup.');
    }
  };

  const restore = async () => {
    if (confirmation !== 'RESTORE') return;
    setError(null);
    setSuccess(null);
    try {
      if (selectedFile) {
        await importBackup(selectedFile).unwrap();
      } else if (restoreName) {
        await restoreStored(restoreName).unwrap();
      } else {
        return;
      }
      haptics.notify('success');
      setSelectedFile(null);
      setRestoreName(null);
      setConfirmation('');
      setSuccess('Backup restored successfully. The panel is refreshing.');
      seeded.current = false;
      await refetch();
    } catch (cause) {
      fail(cause, 'Restore failed. The existing data was kept where possible.');
    }
  };

  const restoreTarget = selectedFile?.name ?? restoreName;
  const busy = data.running || creating || importing || restoringStored;

  return (
    <div className={shared.section}>
      <Card className={shared.row}>
        <div className={shared.rowHead}>
          <div className={shared.rowMain}>
            <p className={shared.rowTitle}>Automatic full backup</p>
            <p className={shared.rowMeta}>
              Database, receipt uploads and product logos. The latest {data.retentionCount} automatic
              copies are retained.
            </p>
          </div>
          <span className={shared.badge}>{data.intervalHours === null ? 'OFF' : 'ON'}</span>
        </div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />
          Run automatically
        </label>

        <label className={styles.field}>
          <span>Interval in hours</span>
          <input
            className={shared.input}
            type="number"
            inputMode="numeric"
            min={1}
            max={720}
            step={1}
            disabled={!automatic}
            value={hours}
            onChange={(event) => setHours(event.target.value.replace(/[^\d]/g, ''))}
          />
        </label>

        <div className={shared.actions}>
          <Button loading={savingSchedule} onClick={() => void saveSchedule()}>
            <Check size={16} weight="bold" /> Save schedule
          </Button>
        </div>

        <p className={shared.hint}>
          {data.nextRunAt
            ? `Next backup: ${new Date(data.nextRunAt).toLocaleString()}`
            : 'No automatic backup is scheduled.'}
        </p>
      </Card>

      <Card className={shared.row}>
        <p className={shared.rowTitle}>Backup and import</p>
        <p className={shared.rowMeta}>
          Manual backup downloads a portable .tar.gz archive. Import replaces all current shop data.
        </p>
        <div className={styles.buttonStack}>
          <Button
            fullWidth
            loading={creating || downloading}
            disabled={busy}
            onClick={() => void backupNow()}
          >
            <FloppyDisk size={17} weight="bold" /> Backup now
          </Button>

          <input
            ref={fileInput}
            type="file"
            accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setRestoreName(null);
              setConfirmation('');
              setError(null);
              event.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            fullWidth
            disabled={!data.canRestore || busy}
            onClick={() => fileInput.current?.click()}
          >
            <UploadSimple size={17} weight="bold" /> Import backup
          </Button>
        </div>
        {!data.canRestore ? (
          <p className={shared.hint}>Only a primary server administrator can restore backups.</p>
        ) : null}
      </Card>

      {restoreTarget ? (
        <Card className={styles.dangerCard}>
          <div className={styles.warningTitle}>
            <Warning size={20} weight="fill" /> Restore all shop data
          </div>
          <p className={shared.rowMeta}>
            Restoring <strong>{restoreTarget}</strong> replaces the database, receipts and logos.
            A safety backup is created first.
          </p>
          <label className={styles.field}>
            <span>Type RESTORE to continue</span>
            <input
              className={shared.input}
              autoCapitalize="characters"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <div className={shared.actions}>
            <Button
              loading={importing || restoringStored}
              disabled={confirmation !== 'RESTORE'}
              onClick={() => void restore()}
            >
              Restore everything
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedFile(null);
                setRestoreName(null);
                setConfirmation('');
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {data.lastError ? (
        <p className={shared.error}>Last backup operation failed: {data.lastError}</p>
      ) : null}
      {error ? <p className={shared.error}>{error}</p> : null}
      {success ? <p className={styles.success}>{success}</p> : null}

      <h2 className={styles.sectionTitle}>Backup history</h2>
      {data.backups.length === 0 ? (
        <p className={shared.hint}>No backups have been created yet.</p>
      ) : (
        data.backups.map((backup) => (
          <Card key={backup.name} className={shared.row}>
            <div className={shared.rowHead}>
              <CloudArrowDown size={22} />
              <div className={shared.rowMain}>
                <p className={shared.rowTitle}>
                  {backup.kind === 'pre-restore'
                    ? 'Pre-restore safety copy'
                    : backup.kind === 'automatic'
                      ? 'Automatic backup'
                      : 'Manual backup'}
                </p>
                <p className={shared.rowMeta}>
                  {new Date(backup.createdAt).toLocaleString()} · {fileSize(backup.sizeBytes)}
                </p>
                {backup.warnings.map((warning) => (
                  <p key={warning} className={styles.warningText}>
                    ⚠ {warning}
                  </p>
                ))}
              </div>
            </div>
            <div className={shared.actions}>
              <Button
                variant="secondary"
                loading={downloading}
                disabled={busy}
                onClick={() => void download(backup.name)}
              >
                <DownloadSimple size={16} /> Download
              </Button>
              {data.canRestore ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setRestoreName(backup.name);
                    setSelectedFile(null);
                    setConfirmation('');
                  }}
                >
                  Restore
                </Button>
              ) : null}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
