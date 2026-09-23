import { useEffect, useRef, useState } from 'react';

import { useGetFeedbackStatusQuery } from '@entities/feedback';

/**
 * Decides whether to put the satisfaction prompt in front of this visit.
 *
 * Both gates live on the server: the customer must have bought something —
 * there is nothing to rate otherwise — and must not have rated already, which
 * retires the prompt for good. There is no local cooldown, so closing it
 * without answering means it comes back next time the app is opened.
 *
 * The decision is latched the first time the status arrives, which is what
 * makes this "on open" rather than "whenever the status changes". The store
 * has refetchOnFocus enabled, so without the latch a customer returning to a
 * backgrounded tab, or buying something mid-session, would have the sheet
 * appear under their thumb.
 */
export function useFeedbackPrompt(): { open: boolean; close: () => void } {
  const { data } = useGetFeedbackStatusQuery();
  const [open, setOpen] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (!data || decided.current) return;

    decided.current = true;
    if (data.hasPurchased && !data.submitted) setOpen(true);
  }, [data]);

  return { open, close: () => setOpen(false) };
}
