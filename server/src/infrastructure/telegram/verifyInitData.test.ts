import { describe, expect, it } from 'vitest';

import { InitDataError, signInitData, verifyInitData } from './verifyInitData.js';

const TOKEN = '8711999834:AAF-test-token-not-real';
const USER = JSON.stringify({
  id: 7103165200,
  first_name: 'AMIXMON',
  username: 'cipher_me',
  language_code: 'en',
});

function makeInitData(overrides: Record<string, string> = {}, token = TOKEN) {
  return signInitData(
    {
      user: USER,
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'AAEtest',
      ...overrides,
    },
    token,
  );
}

describe('verifyInitData', () => {
  it('accepts data signed with the bot token', () => {
    const result = verifyInitData(makeInitData(), TOKEN);

    expect(result.user.id).toBe(7103165200n);
    expect(result.user.username).toBe('cipher_me');
    expect(result.user.firstName).toBe('AMIXMON');
  });

  it('rejects data signed with a different token', () => {
    const forged = makeInitData({}, 'someone-elses-token');

    expect(() => verifyInitData(forged, TOKEN)).toThrow(InitDataError);
  });

  it('rejects a tampered field even when the hash is left intact', () => {
    const tampered = makeInitData().replace('cipher_me', 'an_impostor');

    expect(() => verifyInitData(tampered, TOKEN)).toThrow(/does not match/);
  });

  it('rejects a tampered user id', () => {
    const initData = makeInitData();
    const params = new URLSearchParams(initData);
    params.set('user', JSON.stringify({ id: 999, first_name: 'Mallory' }));

    expect(() => verifyInitData(params.toString(), TOKEN)).toThrow(/does not match/);
  });

  it('rejects data with no hash', () => {
    const params = new URLSearchParams(makeInitData());
    params.delete('hash');

    expect(() => verifyInitData(params.toString(), TOKEN)).toThrow(/no hash/);
  });

  it('rejects an empty string', () => {
    expect(() => verifyInitData('', TOKEN)).toThrow(/empty/);
  });

  it('rejects a replayed session older than the max age', () => {
    const old = String(Math.floor(Date.now() / 1000) - 60 * 60 * 25);

    expect(() => verifyInitData(makeInitData({ auth_date: old }), TOKEN)).toThrow(/old/);
  });

  it('accepts data within the max age window', () => {
    const recent = String(Math.floor(Date.now() / 1000) - 60);

    expect(() => verifyInitData(makeInitData({ auth_date: recent }), TOKEN)).not.toThrow();
  });

  it('honours a custom max age', () => {
    const thirtySecondsAgo = String(Math.floor(Date.now() / 1000) - 30);

    expect(() =>
      verifyInitData(makeInitData({ auth_date: thirtySecondsAgo }), TOKEN, { maxAgeSeconds: 10 }),
    ).toThrow(/old/);
  });

  it('still validates when a signature field is present', () => {
    // Newer clients add `signature`; both check-string spellings must pass.
    const initData = makeInitData({ signature: 'abc123' });

    expect(() => verifyInitData(initData, TOKEN)).not.toThrow();
  });

  it('reports a missing user distinctly', () => {
    const params = new URLSearchParams(
      signInitData({ auth_date: String(Math.floor(Date.now() / 1000)) }, TOKEN),
    );

    expect(() => verifyInitData(params.toString(), TOKEN)).toThrow(/no user/);
  });

  it('keeps large telegram ids exact', () => {
    const bigId = '7999999999999999';
    const initData = signInitData(
      {
        user: JSON.stringify({ id: Number(bigId), first_name: 'Big' }),
        auth_date: String(Math.floor(Date.now() / 1000)),
      },
      TOKEN,
    );

    // Round-trips through BigInt rather than a lossy Number.
    expect(verifyInitData(initData, TOKEN).user.id).toBe(BigInt(bigId));
  });
});
