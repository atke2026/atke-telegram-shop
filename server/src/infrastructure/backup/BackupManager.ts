import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';

import type { PrismaClient } from '@prisma/client';

import { CACHE_KEYS, CONFIG_KEYS } from '../../core/constants.js';
import { getMaintenance, setMaintenance } from '../../core/maintenance.js';
import type { ConfigRepository } from '../../core/ports/repositories.js';
import type { BackupNotifier, CachePort } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';
import type { ReceiptStorage } from '../storage/ReceiptStorage.js';

const FORMAT_VERSION = 1;
const AUTOMATIC_RETENTION = 14;
const MIN_INTERVAL_HOURS = 1;
const MAX_INTERVAL_HOURS = 720;
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 2 * MAX_IMPORT_BYTES;
const MAX_TIMER_DELAY = 2_147_000_000;
const ARCHIVE_NAME = /^(?:suq|yeneshop)_[0-9T-]{15,20}Z_(automatic|manual|pre-restore)\.tar\.gz$/;

export type BackupKind = 'automatic' | 'manual' | 'pre-restore';

export interface BackupEntry {
  name: string;
  kind: BackupKind;
  createdAt: string;
  sizeBytes: number;
  warnings: string[];
}

export interface BackupStatus {
  intervalHours: number | null;
  retentionCount: number;
  nextRunAt: string | null;
  running: boolean;
  restoring: boolean;
  lastError: string | null;
  backups: BackupEntry[];
}

interface BackupManifest {
  formatVersion: number;
  createdAt: string;
  kind: BackupKind;
  application: 'suq' | 'yeneshop';
  databaseFormat: 'postgresql-custom';
  warnings: string[];
  files: Record<string, { sha256: string; sizeBytes: number }>;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface DirectorySwap {
  target: string;
  previous: string;
  hadPrevious: boolean;
}

export class BackupBusyError extends Error {
  constructor() {
    super('Another backup or restore operation is already running.');
    this.name = 'BackupBusyError';
  }
}

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBackupError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < 128_000) stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 128_000) stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          new Error(
            `${command} exited with code ${code ?? 'unknown'}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
          ),
        );
      }
    });
  });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  if (await pathExists(source)) {
    await fs.cp(source, destination, { recursive: true, force: true });
  } else {
    await fs.mkdir(destination, { recursive: true });
  }
}

async function walkFiles(root: string, relative = ''): Promise<string[]> {
  const absolute = path.join(root, relative);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(relative.split(path.sep).join(path.posix.sep), entry.name);
    const childAbsolute = path.join(root, ...child.split('/'));
    const details = await fs.lstat(childAbsolute);
    if (details.isSymbolicLink()) {
      throw new InvalidBackupError(`Symbolic links are not allowed in backups: ${child}`);
    }
    if (details.isDirectory()) files.push(...(await walkFiles(root, child)));
    else if (details.isFile()) files.push(child);
    else throw new InvalidBackupError(`Unsupported file type in backup: ${child}`);
  }

  return files;
}

async function describeFile(file: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of createReadStream(file)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    sizeBytes += buffer.length;
    hash.update(buffer);
  }
  return { sha256: hash.digest('hex'), sizeBytes };
}

function timestampForName(date: Date): string {
  return date.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z');
}

export function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  // Split Prisma's URL into libpq variables. Passing the URL as a command
  // argument would expose its password in tools such as ps, while PGDATABASE
  // alone does not consistently accept Prisma-only query parameters.
  const parsed = new URL(databaseUrl);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
  };
  const sslMode = parsed.searchParams.get('sslmode');
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

export class BackupManager {
  private intervalHours: number | null = null;
  private nextRunAt: Date | null = null;
  private timer: NodeJS.Timeout | null = null;
  private job: 'backup' | 'restore' | null = null;
  private restoreActive = false;
  private lastError: string | null = null;
  private beforeRestore: (() => Promise<void>) | null = null;
  private afterRestore: (() => void) | null = null;

  constructor(
    private readonly deps: {
      databaseUrl: string;
      backupRoot: string;
      receiptsRoot: string;
      logosRoot: string;
      prisma: PrismaClient;
      config: ConfigRepository;
      cache: CachePort;
      receipts: ReceiptStorage;
      telegram: { getFileLink(fileId: string): Promise<URL> };
      notifier: BackupNotifier;
      logger: Logger;
    },
  ) {}

  get isRestoring(): boolean {
    return this.restoreActive;
  }

  setRestoreHooks(hooks: { beforeRestore: () => Promise<void>; afterRestore: () => void }): void {
    this.beforeRestore = hooks.beforeRestore;
    this.afterRestore = hooks.afterRestore;
  }

  async start(): Promise<void> {
    await fs.mkdir(this.deps.backupRoot, { recursive: true, mode: 0o700 });
    const raw = await this.deps.config.get(CONFIG_KEYS.backupIntervalHours);
    const parsed = raw === null ? null : Number(raw);
    this.intervalHours =
      parsed !== null &&
      Number.isInteger(parsed) &&
      parsed >= MIN_INTERVAL_HOURS &&
      parsed <= MAX_INTERVAL_HOURS
        ? parsed
        : null;
    await this.scheduleFromPersistedDueTime();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  async status(): Promise<BackupStatus> {
    return {
      intervalHours: this.intervalHours,
      retentionCount: AUTOMATIC_RETENTION,
      nextRunAt: this.nextRunAt?.toISOString() ?? null,
      running: this.job !== null,
      restoring: this.restoreActive,
      lastError: this.lastError,
      backups: await this.listBackups(),
    };
  }

  async setIntervalHours(intervalHours: number | null): Promise<BackupStatus> {
    if (
      intervalHours !== null &&
      (!Number.isInteger(intervalHours) ||
        intervalHours < MIN_INTERVAL_HOURS ||
        intervalHours > MAX_INTERVAL_HOURS)
    ) {
      throw new RangeError(
        `Backup interval must be a whole number from ${MIN_INTERVAL_HOURS} to ${MAX_INTERVAL_HOURS} hours.`,
      );
    }

    this.intervalHours = intervalHours;
    const next =
      intervalHours === null ? null : new Date(Date.now() + intervalHours * 3_600_000);
    await Promise.all([
      this.deps.config.set(
        CONFIG_KEYS.backupIntervalHours,
        intervalHours === null ? '' : String(intervalHours),
      ),
      this.deps.config.set(CONFIG_KEYS.backupNextRunAt, next?.toISOString() ?? ''),
    ]);
    this.lastError = null;
    this.scheduleAt(next);
    return this.status();
  }

  async createManualBackup(adminTelegramId: bigint): Promise<BackupEntry> {
    if (this.job) throw new BackupBusyError();
    this.job = 'backup';
    try {
      const result = await this.performBackup('manual', adminTelegramId);
      await this.deliverBackup(result);
      this.lastError = null;
      return result;
    } catch (error) {
      this.lastError = errorMessage(error);
      throw error;
    } finally {
      this.job = null;
    }
  }

  async saveImport(payload: Readable, contentLength?: number): Promise<string> {
    if (contentLength !== undefined && contentLength > MAX_IMPORT_BYTES) {
      throw new InvalidBackupError('The uploaded backup is larger than 1 GB.');
    }

    await fs.mkdir(this.deps.backupRoot, { recursive: true, mode: 0o700 });
    const destination = path.join(this.deps.backupRoot, `.import-${randomUUID()}.tar.gz`);
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_IMPORT_BYTES) callback(new InvalidBackupError('The uploaded backup is larger than 1 GB.'));
        else callback(null, chunk);
      },
    });

    try {
      await pipeline(payload, limiter, createWriteStream(destination, { mode: 0o600, flags: 'wx' }));
      if (received === 0) throw new InvalidBackupError('The uploaded backup is empty.');
      return destination;
    } catch (error) {
      await fs.rm(destination, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async restoreImported(archive: string, adminTelegramId: bigint): Promise<{ restoredAt: string }> {
    try {
      return await this.restoreArchive(archive, adminTelegramId);
    } finally {
      await fs.rm(archive, { force: true }).catch(() => undefined);
    }
  }

  async restoreStored(name: string, adminTelegramId: bigint): Promise<{ restoredAt: string }> {
    return this.restoreArchive(this.resolveArchive(name), adminTelegramId);
  }

  resolveArchive(name: string): string {
    if (!ARCHIVE_NAME.test(name)) throw new InvalidBackupError('Invalid backup name.');
    return path.join(this.deps.backupRoot, name);
  }

  private async listBackups(): Promise<BackupEntry[]> {
    const names = await fs.readdir(this.deps.backupRoot).catch(() => []);
    const entries: BackupEntry[] = [];

    for (const name of names) {
      if (!ARCHIVE_NAME.test(name)) continue;
      const archive = path.join(this.deps.backupRoot, name);
      const sidecar = `${archive}.json`;
      try {
        const [details, metadata] = await Promise.all([
          fs.stat(archive),
          fs
            .readFile(sidecar, 'utf8')
            .then(
              (raw) =>
                JSON.parse(raw) as Pick<BackupEntry, 'createdAt' | 'kind'> &
                  Partial<Pick<BackupEntry, 'warnings'>>,
            )
            .catch(() => null),
        ]);
        const match = name.match(/_(automatic|manual|pre-restore)\.tar\.gz$/);
        const kind = (metadata?.kind ?? match?.[1]) as BackupKind | undefined;
        if (!kind) continue;
        entries.push({
          name,
          kind,
          createdAt: metadata?.createdAt ?? details.mtime.toISOString(),
          sizeBytes: details.size,
          warnings: metadata?.warnings ?? [],
        });
      } catch {
        // A partially removed pair is not a valid history entry.
      }
    }

    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async scheduleFromPersistedDueTime(): Promise<void> {
    if (this.intervalHours === null) {
      this.scheduleAt(null);
      return;
    }
    const persisted = await this.deps.config.get(CONFIG_KEYS.backupNextRunAt);
    if (persisted) {
      const dueAt = new Date(persisted);
      if (!Number.isNaN(dueAt.getTime())) {
        this.scheduleAt(dueAt);
        return;
      }
    }
    const latest = (await this.listBackups()).find((backup) => backup.kind === 'automatic');
    const dueAt = latest
      ? new Date(new Date(latest.createdAt).getTime() + this.intervalHours * 3_600_000)
      : new Date(Date.now() + this.intervalHours * 3_600_000);
    await this.deps.config.set(CONFIG_KEYS.backupNextRunAt, dueAt.toISOString());
    this.scheduleAt(dueAt);
  }

  private scheduleAt(date: Date | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = date;
    if (!date || this.intervalHours === null) return;

    const delay = Math.max(0, date.getTime() - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.nextRunAt && this.nextRunAt.getTime() > Date.now()) {
        this.scheduleAt(this.nextRunAt);
        return;
      }
      void this.runAutomatic();
    }, Math.min(delay, MAX_TIMER_DELAY));
    this.timer.unref();
  }

  private async runAutomatic(): Promise<void> {
    if (this.job) {
      const retryAt = new Date(Date.now() + 5 * 60_000);
      await this.deps.config.set(CONFIG_KEYS.backupNextRunAt, retryAt.toISOString());
      this.scheduleAt(retryAt);
      return;
    }

    this.job = 'backup';
    this.nextRunAt = null;
    try {
      const backup = await this.performBackup('automatic', null);
      await this.deliverBackup(backup);
      await this.applyAutomaticRetention();
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      this.deps.logger.error({ err: error }, 'Automatic full backup failed');
    } finally {
      this.job = null;
      const next =
        this.intervalHours === null
          ? null
          : new Date(Date.now() + this.intervalHours * 3_600_000);
      await this.deps.config.set(CONFIG_KEYS.backupNextRunAt, next?.toISOString() ?? '');
      this.scheduleAt(next);
    }
  }

  private async deliverBackup(backup: BackupEntry): Promise<void> {
    if (backup.kind !== 'automatic' && backup.kind !== 'manual') return;
    const kind = backup.kind;

    try {
      await this.deps.notifier.notifyBackup({
        archivePath: this.resolveArchive(backup.name),
        ...backup,
        kind,
      });
    } catch (error) {
      // The durable archive is still a successful backup when Telegram is
      // temporarily unavailable or rejects a file that exceeds its limit.
      this.deps.logger.error(
        { err: error, kind: backup.kind, name: backup.name },
        'Could not deliver backup to administrators',
      );
    }
  }

  private async performBackup(
    kind: BackupKind,
    adminTelegramId: bigint | null,
  ): Promise<BackupEntry> {
    const createdAt = new Date();
    const name = `suq_${timestampForName(createdAt)}_${kind}.tar.gz`;
    const archive = path.join(this.deps.backupRoot, name);
    const partial = `${archive}.partial`;
    const working = await fs.mkdtemp(path.join(this.deps.backupRoot, '.working-'));

    try {
      const warnings = await this.materializeTelegramUploads();
      const databaseDump = path.join(working, 'database.dump');
      await runCommand(
        'pg_dump',
        ['--format=custom', '--no-owner', '--no-privileges', '--file', databaseDump],
        { env: postgresEnvironment(this.deps.databaseUrl) },
      );

      const uploads = path.join(working, 'uploads');
      await fs.mkdir(uploads, { recursive: true });
      await Promise.all([
        copyDirectory(this.deps.receiptsRoot, path.join(uploads, 'receipts')),
        copyDirectory(this.deps.logosRoot, path.join(uploads, 'logos')),
      ]);

      const files: BackupManifest['files'] = {};
      for (const relative of await walkFiles(working)) {
        if (relative === 'manifest.json') continue;
        files[relative] = await describeFile(path.join(working, ...relative.split('/')));
      }

      const manifest: BackupManifest = {
        formatVersion: FORMAT_VERSION,
        createdAt: createdAt.toISOString(),
        kind,
        application: 'suq',
        databaseFormat: 'postgresql-custom',
        warnings,
        files,
      };
      await fs.writeFile(path.join(working, 'manifest.json'), JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });

      await runCommand('tar', [
        '-czf',
        partial,
        '-C',
        working,
        'manifest.json',
        'database.dump',
        'uploads',
      ]);
      await fs.chmod(partial, 0o600);
      await fs.rename(partial, archive);

      const details = await fs.stat(archive);
      const entry: BackupEntry = {
        name,
        kind,
        createdAt: createdAt.toISOString(),
        sizeBytes: details.size,
        warnings,
      };
      await fs.writeFile(`${archive}.json`, JSON.stringify(entry), { mode: 0o600 });
      this.deps.logger.warn(
        {
          kind,
          name,
          sizeBytes: details.size,
          by: adminTelegramId?.toString() ?? 'scheduler',
          warnings,
        },
        'Full backup created',
      );
      return entry;
    } finally {
      await fs.rm(partial, { force: true }).catch(() => undefined);
      await fs.rm(working, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Bot receipts used to live only behind Telegram file_ids. Materialising
   * them before pg_dump makes every newly created archive self-contained.
   */
  private async materializeTelegramUploads(): Promise<string[]> {
    const warnings: string[] = [];
    const missingForever = await this.deps.prisma.deposit.count({
      where: { screenshotUrl: 'webapp-upload' },
    });
    if (missingForever > 0) {
      warnings.push(
        `${missingForever} legacy receipt(s) predate file storage and have no image to include.`,
      );
    }

    const external = await this.deps.prisma.deposit.findMany({
      where: {
        AND: [
          { screenshotUrl: { not: 'webapp-upload' } },
          { NOT: { screenshotUrl: { startsWith: 'file:' } } },
        ],
      },
      select: { id: true, screenshotUrl: true },
    });
    const failures: string[] = [];

    for (const deposit of external) {
      try {
        const stored = await this.downloadTelegramImage(deposit.screenshotUrl);
        await this.deps.prisma.deposit.updateMany({
          where: { id: deposit.id, screenshotUrl: deposit.screenshotUrl },
          data: { screenshotUrl: stored },
        });
      } catch {
        failures.push(deposit.id);
      }
    }

    const maintenance = await getMaintenance(this.deps.config);
    if (maintenance.imageFileId && !maintenance.imageFileId.startsWith('file:')) {
      try {
        const stored = await this.downloadTelegramImage(maintenance.imageFileId);
        await setMaintenance(this.deps.config, { imageFileId: stored });
      } catch {
        failures.push('maintenance-image');
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Could not make ${failures.length} Telegram-hosted upload(s) self-contained. Try the backup again.`,
      );
    }
    return warnings;
  }

  private async downloadTelegramImage(fileId: string): Promise<string> {
    const link = await this.deps.telegram.getFileLink(fileId);
    const response = await fetch(link);
    if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}`);
    return this.deps.receipts.save(Buffer.from(await response.arrayBuffer()));
  }

  private async applyAutomaticRetention(): Promise<void> {
    const automatic = (await this.listBackups()).filter((backup) => backup.kind === 'automatic');
    for (const expired of automatic.slice(AUTOMATIC_RETENTION)) {
      const archive = this.resolveArchive(expired.name);
      await Promise.all([
        fs.rm(archive, { force: true }),
        fs.rm(`${archive}.json`, { force: true }),
      ]);
    }
  }

  private async restoreArchive(
    archive: string,
    adminTelegramId: bigint,
  ): Promise<{ restoredAt: string }> {
    if (this.job) throw new BackupBusyError();
    this.job = 'restore';
    this.restoreActive = true;
    this.stop();
    let extracted: string | null = null;

    try {
      await this.beforeRestore?.();
      extracted = await this.validateAndExtract(archive);
      await this.performBackup('pre-restore', adminTelegramId);

      const receiptSwap = await this.swapDirectory(
        path.join(extracted, 'uploads', 'receipts'),
        this.deps.receiptsRoot,
      );
      let logoSwap: DirectorySwap | null = null;

      try {
        logoSwap = await this.swapDirectory(
          path.join(extracted, 'uploads', 'logos'),
          this.deps.logosRoot,
        );
        await this.deps.prisma.$disconnect();
        try {
          await runCommand(
            'pg_restore',
            [
              '--clean',
              '--if-exists',
              '--no-owner',
              '--no-privileges',
              '--single-transaction',
              path.join(extracted, 'database.dump'),
            ],
            { env: postgresEnvironment(this.deps.databaseUrl) },
          );
        } finally {
          await this.deps.prisma.$connect();
        }
      } catch (error) {
        if (logoSwap) await this.rollbackSwap(logoSwap);
        await this.rollbackSwap(receiptSwap);
        throw error;
      }

      await Promise.all([
        this.finishSwap(receiptSwap).catch((error) =>
          this.deps.logger.warn({ err: error }, 'Could not remove old receipt directory after restore'),
        ),
        logoSwap
          ? this.finishSwap(logoSwap).catch((error) =>
              this.deps.logger.warn({ err: error }, 'Could not remove old logo directory after restore'),
            )
          : Promise.resolve(),
      ]);
      await Promise.all([
        this.deps.cache.del(CACHE_KEYS.products),
        this.deps.cache.del(CACHE_KEYS.lastSync),
      ]);
      this.lastError = null;
      const restoredAt = new Date().toISOString();
      this.deps.logger.warn(
        { by: adminTelegramId.toString(), archive: path.basename(archive) },
        'Full backup restored',
      );
      return { restoredAt };
    } catch (error) {
      this.lastError = errorMessage(error);
      this.deps.logger.error(
        { err: error, by: adminTelegramId.toString(), archive: path.basename(archive) },
        'Full backup restore failed',
      );
      throw error;
    } finally {
      if (extracted) {
        await fs.rm(extracted, { recursive: true, force: true }).catch(() => undefined);
      }
      this.restoreActive = false;
      this.job = null;
      this.afterRestore?.();
      await this.start().catch((error) => {
        this.lastError = errorMessage(error);
      });
    }
  }

  private async validateAndExtract(archive: string): Promise<string> {
    const details = await fs.stat(archive).catch(() => null);
    if (!details?.isFile()) throw new InvalidBackupError('Backup archive was not found.');
    if (details.size > MAX_IMPORT_BYTES) throw new InvalidBackupError('Backup is larger than 1 GB.');

    const listing = await runCommand('tar', ['-tzf', archive]);
    const entries = listing.stdout
      .split('\n')
      .map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, ''))
      .filter(Boolean);
    if (!entries.includes('manifest.json') || !entries.includes('database.dump')) {
      throw new InvalidBackupError('This is not a complete Suq backup.');
    }
    for (const entry of entries) {
      const normal = path.posix.normalize(entry);
      if (
        entry.includes('\\') ||
        entry.startsWith('/') ||
        normal === '..' ||
        normal.startsWith('../') ||
        !(
          normal === 'manifest.json' ||
          normal === 'database.dump' ||
          normal === 'uploads' ||
          normal.startsWith('uploads/')
        )
      ) {
        throw new InvalidBackupError(`Unsafe or unexpected archive entry: ${entry}`);
      }
    }

    const extracted = await fs.mkdtemp(path.join(this.deps.backupRoot, '.restore-'));
    try {
      await runCommand('tar', [
        '--extract',
        '--gzip',
        '--file',
        archive,
        '--directory',
        extracted,
        '--no-same-owner',
        '--no-same-permissions',
      ]);
      const manifestRaw = await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8');
      if (manifestRaw.length > 1_000_000) throw new InvalidBackupError('Backup manifest is too large.');

      const manifest = JSON.parse(manifestRaw) as Partial<BackupManifest>;
      if (
        manifest.formatVersion !== FORMAT_VERSION ||
        (manifest.application !== 'suq' && manifest.application !== 'yeneshop') ||
        manifest.databaseFormat !== 'postgresql-custom' ||
        !manifest.files ||
        typeof manifest.files !== 'object'
      ) {
        throw new InvalidBackupError('Unsupported or invalid Suq backup format.');
      }

      const actualFiles = (await walkFiles(extracted)).filter((file) => file !== 'manifest.json');
      const expectedFiles = Object.keys(manifest.files).sort();
      if (
        actualFiles.length !== expectedFiles.length ||
        actualFiles.some((file, index) => file !== expectedFiles[index])
      ) {
        throw new InvalidBackupError('Backup contents do not match its manifest.');
      }

      let totalBytes = 0;
      for (const relative of actualFiles) {
        const expected = manifest.files[relative];
        if (!expected || typeof expected.sha256 !== 'string') {
          throw new InvalidBackupError(`Missing checksum for ${relative}.`);
        }
        const actual = await describeFile(path.join(extracted, ...relative.split('/')));
        totalBytes += actual.sizeBytes;
        if (totalBytes > MAX_EXTRACTED_BYTES) {
          throw new InvalidBackupError('Extracted backup is unexpectedly large.');
        }
        if (actual.sha256 !== expected.sha256 || actual.sizeBytes !== expected.sizeBytes) {
          throw new InvalidBackupError(`Backup checksum failed for ${relative}.`);
        }
      }
      if (
        !(await pathExists(path.join(extracted, 'uploads', 'receipts'))) ||
        !(await pathExists(path.join(extracted, 'uploads', 'logos')))
      ) {
        throw new InvalidBackupError('Backup does not contain all upload directories.');
      }
      await runCommand('pg_restore', ['--list', path.join(extracted, 'database.dump')]);
      return extracted;
    } catch (error) {
      await fs.rm(extracted, { recursive: true, force: true }).catch(() => undefined);
      if (error instanceof InvalidBackupError) throw error;
      throw new InvalidBackupError(`Could not validate backup: ${errorMessage(error)}`);
    }
  }

  private async swapDirectory(source: string, target: string): Promise<DirectorySwap> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const previous = `${target}.before-restore-${randomUUID()}`;
    const prepared = `${target}.restore-new-${randomUUID()}`;
    const hadPrevious = await pathExists(target);
    try {
      // BACKUPS_DIR may be a separate mounted disk. Copy into a sibling first
      // so the two final renames are always atomic on the target filesystem.
      await fs.cp(source, prepared, { recursive: true, force: true });
      if (hadPrevious) await fs.rename(target, previous);
      await fs.rename(prepared, target);
      return { target, previous, hadPrevious };
    } catch (error) {
      await fs.rm(prepared, { recursive: true, force: true }).catch(() => undefined);
      if (hadPrevious) await fs.rename(previous, target).catch(() => undefined);
      throw error;
    }
  }

  private async rollbackSwap(swap: DirectorySwap): Promise<void> {
    await fs.rm(swap.target, { recursive: true, force: true });
    if (swap.hadPrevious) await fs.rename(swap.previous, swap.target);
  }

  private async finishSwap(swap: DirectorySwap): Promise<void> {
    if (swap.hadPrevious) await fs.rm(swap.previous, { recursive: true, force: true });
  }
}
