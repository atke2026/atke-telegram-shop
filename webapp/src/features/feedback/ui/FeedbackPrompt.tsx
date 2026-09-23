import { useFeedbackPrompt } from '../lib/useFeedbackPrompt';
import { FeedbackSheet } from './FeedbackSheet/FeedbackSheet';

/**
 * Mounted once at the app root. Owns nothing but the decision of when to ask;
 * the sheet itself is a plain controlled component, so it can also be opened
 * deliberately from somewhere else later without going through the coin flip.
 */
export function FeedbackPrompt() {
  const { open, close } = useFeedbackPrompt();

  return <FeedbackSheet open={open} onClose={close} />;
}
