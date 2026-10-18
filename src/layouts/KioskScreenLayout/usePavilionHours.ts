import { useEffect, useState } from 'react';
import { fetchPavilionHours, type PavilionHours } from '../../services/pavilionHoursApi';

// The stand's view of the opening hours (docs/pavilion-security-requirements.md,
// "Closing sequence"): 10 minutes before closing it warns, 5 minutes before
// it stops starting new orders (orders already in progress or paid carry
// on), and while closed it says when the pavilion opens again. Used by
// KioskScreenLayout (the banner on every screen) and WelcomeScreen (which
// disables the service cards).

const POLL_MS = 30_000;
const TICK_MS = 15_000;
export const CLOSING_WARNING_MS = 10 * 60_000;
export const NO_NEW_ORDERS_MS = 5 * 60_000;

export type PavilionHoursState =
  | { kind: 'open' }
  | { kind: 'closing-soon'; closesAt: Date }
  | { kind: 'no-new-orders'; closesAt: Date }
  | { kind: 'closed'; opensAt: Date | null };

export function usePavilionHours(): PavilionHoursState {
  const [hours, setHours] = useState<{ value: PavilionHours; clockOffsetMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      void fetchPavilionHours().then((value) => {
        if (cancelled || !value) return;
        // The stand's own clock may be off; time the countdown by the server's.
        const clockOffsetMs = value.enforced ? Date.parse(value.serverTime) - Date.now() : 0;
        setHours({ value, clockOffsetMs });
      });
    poll();
    const pollId = setInterval(poll, POLL_MS);
    const tickId = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, []);

  if (!hours || !hours.value.enforced) return { kind: 'open' };
  const { value } = hours;
  const serverNow = now + hours.clockOffsetMs;
  const changesAt = value.changesAt ? new Date(value.changesAt) : null;
  // The cached answer may be up to a poll old — once the change time has
  // passed, flip without waiting for the next poll.
  const mode =
    changesAt && serverNow >= changesAt.getTime()
      ? value.mode === 'open'
        ? 'closed'
        : 'open'
      : value.mode;
  if (mode === 'closed') {
    return { kind: 'closed', opensAt: value.mode === 'closed' ? changesAt : null };
  }
  if (!changesAt || value.mode !== 'open') return { kind: 'open' };
  const left = changesAt.getTime() - serverNow;
  if (left <= NO_NEW_ORDERS_MS) return { kind: 'no-new-orders', closesAt: changesAt };
  if (left <= CLOSING_WARNING_MS) return { kind: 'closing-soon', closesAt: changesAt };
  return { kind: 'open' };
}

const PAVILION_TIME_ZONE = 'Europe/Bratislava';
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: PAVILION_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: PAVILION_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});

/** "22:00", or "18.10. 07:00" when it isn't today in Bratislava. */
export function formatPavilionTime(at: Date): string {
  const sameDay = dayFormat.format(at) === dayFormat.format(new Date());
  const time = timeFormat.format(at);
  return sameDay ? time : `${dayFormat.format(at).replace('/', '.')}. ${time}`;
}
