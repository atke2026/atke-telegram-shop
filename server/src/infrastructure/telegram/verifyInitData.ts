import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verification of the `initData` string a Telegram Mini App passes to its
 * backend. This is the app's entire authentication story, so it is written as
 * a pure function and tested directly.
 *
 * Telegram's scheme:
 *   secret = HMAC_SHA256(key: "WebAppData", message: bot_token)
 *   hash   = HMAC_SHA256(key: secret, message: data_check_string)
 * where data_check_string is every field except `hash`, sorted by key, joined
 * as `key=value` with newlines.
 */

export class InitDataError extends Error {
  constructor(readonly reason: 'malformed' | 'bad_hash' | 'expired' | 'no_user', message: string) {
    super(message);
    this.name = 'InitDataError';
  }
}

export interface TelegramInitUser {
  id: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
}

export interface VerifiedInitData {
  user: TelegramInitUser;
  authDate: Date;
}

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

function buildDataCheckString(params: URLSearchParams, exclude: string[]): string {
  return [...params.entries()]
    .filter(([key]) => !exclude.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

function hmacHex(key: Buffer | string, message: string): Buffer {
  return createHmac('sha256', key).update(message).digest();
}

function matches(expected: Buffer, receivedHex: string): boolean {
  let received: Buffer;
  try {
    received = Buffer.from(receivedHex, 'hex');
  } catch {
    return false;
  }

  // Length must match before timingSafeEqual, which throws otherwise.
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export function verifyInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; now?: Date } = {},
): VerifiedInitData {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const now = options.now ?? new Date();

  if (!initData) throw new InitDataError('malformed', 'initData is empty');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new InitDataError('malformed', 'initData has no hash');

  const secret = hmacHex('WebAppData', botToken);

  // Telegram documents excluding only `hash`. Newer clients also send
  // `signature` (for third-party Ed25519 validation) and implementations
  // disagree on whether it belongs in the check string, so accept either.
  // Both forms are HMACs under the same bot-token-derived secret, so allowing
  // the second spelling does not make a forgery any easier.
  const accepted = [['hash'], ['hash', 'signature']].some((exclude) =>
    matches(hmacHex(secret, buildDataCheckString(params, exclude)), hash),
  );

  if (!accepted) throw new InitDataError('bad_hash', 'initData signature does not match');

  const authDateRaw = params.get('auth_date');
  const authDateSeconds = Number(authDateRaw);
  if (!authDateRaw || !Number.isFinite(authDateSeconds)) {
    throw new InitDataError('malformed', 'initData has no usable auth_date');
  }

  const authDate = new Date(authDateSeconds * 1000);
  const ageSeconds = (now.getTime() - authDate.getTime()) / 1000;
  if (ageSeconds > maxAgeSeconds) {
    throw new InitDataError('expired', `initData is ${Math.round(ageSeconds)}s old`);
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new InitDataError('no_user', 'initData has no user');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(userRaw) as Record<string, unknown>;
  } catch {
    throw new InitDataError('malformed', 'initData user is not valid JSON');
  }

  if (parsed.id === undefined || parsed.id === null) {
    throw new InitDataError('no_user', 'initData user has no id');
  }

  return {
    authDate,
    user: {
      id: BigInt(String(parsed.id)),
      firstName: parsed.first_name != null ? String(parsed.first_name) : null,
      lastName: parsed.last_name != null ? String(parsed.last_name) : null,
      username: parsed.username != null ? String(parsed.username) : null,
      photoUrl: parsed.photo_url != null ? String(parsed.photo_url) : null,
      languageCode: parsed.language_code != null ? String(parsed.language_code) : null,
    },
  };
}

/** Builds a correctly signed initData string. Test helper, not for production use. */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const params = new URLSearchParams(fields);
  const secret = hmacHex('WebAppData', botToken);
  const hash = hmacHex(secret, buildDataCheckString(params, ['hash'])).toString('hex');

  params.set('hash', hash);
  return params.toString();
}
