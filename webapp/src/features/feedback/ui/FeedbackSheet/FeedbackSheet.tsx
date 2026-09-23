import { AnimatePresence, motion } from 'framer-motion';
import { Check, Star, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { useSubmitFeedbackMutation } from '@entities/feedback';
import { haptics } from '@shared/lib/telegram';
import styles from './FeedbackSheet.module.css';

const STARS = [1, 2, 3, 4, 5] as const;

/** What each star means, so the scale is not left to interpretation. */
const MEANING: Record<number, string> = {
  1: 'Bad',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Very satisfied',
};

/** How long the thank-you stays up before the sheet closes itself. */
const THANK_YOU_MS = 1800;

interface FeedbackSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The satisfaction prompt: tap a star and it is sent, with no confirm step.
 *
 * Dropping the confirmation is the point — a one-tap answer is the reason
 * anyone completes this at all — so the submission is fired optimistically and
 * the thank-you shows regardless of what the network does. A rating that fails
 * to reach us is not worth putting an error in front of a customer who has
 * already done what we asked.
 */
export function FeedbackSheet({ open, onClose }: FeedbackSheetProps) {
  const [submitFeedback] = useSubmitFeedbackMutation();
  const [chosen, setChosen] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  // A reopened sheet must not still be showing the previous thank-you.
  useEffect(() => {
    if (open) {
      setChosen(null);
      setHovered(null);
    }
  }, [open]);

  useEffect(() => {
    if (chosen === null) return;

    const timer = setTimeout(onClose, THANK_YOU_MS);
    return () => clearTimeout(timer);
  }, [chosen, onClose]);

  const pick = (rating: number) => {
    if (chosen !== null) return;

    setChosen(rating);
    haptics.notify('success');
    // Deliberately not awaited: the thank-you is already on screen.
    void submitFeedback({ rating });
  };

  // Filled up to the star being touched, so dragging across them previews the
  // rating before a finger lifts.
  const lit = hovered ?? chosen ?? 0;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            className={styles.sheet}
            role="dialog"
            aria-label="How satisfied are you?"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className={styles.grabber} />

            {chosen === null ? (
              <>
                {/* Only offered before answering: once a rating is in, the
                    sheet is a receipt and closes on its own. */}
                <button type="button" className={styles.close} onClick={onClose} aria-label="Not now">
                  <X size={18} weight="bold" />
                </button>

                <div className={styles.body}>
                  <h2 className={styles.title}>How satisfied are you?</h2>
                  <p className={styles.subtitle}>Tap a star — that is the whole survey.</p>

                  <div
                    className={styles.stars}
                    role="radiogroup"
                    aria-label="Rating out of 5"
                    onPointerLeave={() => setHovered(null)}
                  >
                    {STARS.map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        role="radio"
                        aria-checked={false}
                        aria-label={`${rating} star${rating === 1 ? '' : 's'} — ${MEANING[rating]}`}
                        className={styles.star}
                        onPointerEnter={() => setHovered(rating)}
                        onPointerDown={() => {
                          setHovered(rating);
                          haptics.select();
                        }}
                        onClick={() => pick(rating)}
                      >
                        <Star
                          size={38}
                          weight={rating <= lit ? 'fill' : 'regular'}
                          className={rating <= lit ? styles.starLit : styles.starDim}
                        />
                      </button>
                    ))}
                  </div>

                  {/* Height is held whether or not a label is showing, so the
                      sheet does not jump as a finger moves across the row. */}
                  <p className={styles.meaning}>{lit > 0 ? MEANING[lit] : ' '}</p>
                </div>
              </>
            ) : (
              <div className={styles.body}>
                <motion.div
                  className={styles.tick}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 18 }}
                >
                  <Check size={34} weight="bold" />
                </motion.div>
                <h2 className={styles.title}>Thank you for your feedback</h2>
                <p className={styles.subtitle}>
                  You rated us {chosen} star{chosen === 1 ? '' : 's'}.
                </p>
              </div>
            )}
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
