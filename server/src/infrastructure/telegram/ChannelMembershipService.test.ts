import { describe, expect, it, vi } from 'vitest';

import {
  ChannelMembershipService,
  hasJoinedChannel,
  publicChannelUrl,
} from './ChannelMembershipService.js';

describe('hasJoinedChannel', () => {
  it.each(['creator', 'administrator', 'member'])('accepts Telegram status %s', (status) => {
    expect(hasJoinedChannel({ status })).toBe(true);
  });

  it('accepts restricted users only while Telegram says they remain a member', () => {
    expect(hasJoinedChannel({ status: 'restricted', is_member: true })).toBe(true);
    expect(hasJoinedChannel({ status: 'restricted', is_member: false })).toBe(false);
  });

  it.each(['left', 'kicked'])('rejects Telegram status %s', (status) => {
    expect(hasJoinedChannel({ status })).toBe(false);
  });
});

describe('ChannelMembershipService', () => {
  it('checks the configured announcement channel', async () => {
    const getChatMember = vi.fn().mockResolvedValue({ status: 'member' });
    const service = new ChannelMembershipService({ getChatMember }, '@yeneshop_et');

    await expect(service.hasJoined(123456789n)).resolves.toBe(true);
    expect(getChatMember).toHaveBeenCalledWith('@yeneshop_et', 123456789);
    expect(service.joinUrl).toBe('https://t.me/yeneshop_et');
  });

  it('does not cache results, allowing immediate join and leave enforcement', async () => {
    const getChatMember = vi
      .fn()
      .mockResolvedValueOnce({ status: 'left' })
      .mockResolvedValueOnce({ status: 'member' })
      .mockResolvedValueOnce({ status: 'left' });
    const service = new ChannelMembershipService({ getChatMember }, '@yeneshop_et');

    await expect(service.hasJoined(1n)).resolves.toBe(false);
    await expect(service.hasJoined(1n)).resolves.toBe(true);
    await expect(service.hasJoined(1n)).resolves.toBe(false);
    expect(getChatMember).toHaveBeenCalledTimes(3);
  });

  it('deduplicates simultaneous checks for the same customer', async () => {
    let resolveCheck!: (member: { status: string }) => void;
    const getChatMember = vi.fn(
      () =>
        new Promise<{ status: string }>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const service = new ChannelMembershipService({ getChatMember }, '@yeneshop_et');

    const first = service.hasJoined(1n);
    const second = service.hasJoined(1n);
    resolveCheck({ status: 'member' });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(getChatMember).toHaveBeenCalledTimes(1);
  });
});

describe('publicChannelUrl', () => {
  it('turns a Telegram username into its public join URL', () => {
    expect(publicChannelUrl('@yeneshop_et')).toBe('https://t.me/yeneshop_et');
  });
});
