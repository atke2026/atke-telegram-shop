interface ChatMemberResult {
  status: string;
  is_member?: boolean;
}

interface TelegramMembershipApi {
  getChatMember(chatId: string | number, userId: number): Promise<ChatMemberResult>;
}

/** Telegram statuses which still represent an active channel member. */
export function hasJoinedChannel(member: ChatMemberResult): boolean {
  switch (member.status) {
    case 'creator':
    case 'administrator':
    case 'member':
      return true;
    case 'restricted':
      return member.is_member === true;
    default:
      return false;
  }
}

export function publicChannelUrl(channel: string): string {
  return `https://t.me/${channel.trim().replace(/^@/, '')}`;
}

/**
 * One membership authority shared by the bot and Mini App.
 *
 * Concurrent checks for one user share a request because a Mini App screen can
 * issue several API calls at once. Results are not retained: existing
 * customers who leave the channel must lose access on their next interaction,
 * and the "I've joined" button must work immediately after joining.
 */
export class ChannelMembershipService {
  readonly joinUrl: string;
  private readonly pending = new Map<bigint, Promise<boolean>>();

  constructor(
    private readonly telegram: TelegramMembershipApi,
    readonly channel: string,
  ) {
    this.joinUrl = publicChannelUrl(channel);
  }

  async hasJoined(telegramId: bigint): Promise<boolean> {
    const inFlight = this.pending.get(telegramId);
    if (inFlight) return inFlight;

    const check = this.telegram
      .getChatMember(this.channel, Number(telegramId))
      .then(hasJoinedChannel);
    this.pending.set(telegramId, check);

    try {
      return await check;
    } finally {
      if (this.pending.get(telegramId) === check) this.pending.delete(telegramId);
    }
  }
}
