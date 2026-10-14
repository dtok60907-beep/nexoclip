// When a user's credits are running out. 100 is what the AI Director needs to start a project and about three
// seconds of 720p video; at 1 or less nothing can be generated.
export const LOW_BALANCE_CREDITS = 100;
export const EMPTY_BALANCE_CREDITS = 1;

export function lowBalanceLevel(balance) {
  if (balance === null || balance === undefined || balance === '') return null;
  const credits = Number(balance);
  if (!Number.isFinite(credits)) return null;
  if (credits < EMPTY_BALANCE_CREDITS) return 'empty';
  if (credits < LOW_BALANCE_CREDITS) return 'low';
  return null;
}

// The dialog shows once per level per browser session: again when the balance drops from low to empty, and again
// after a top-up lifts it above the threshold and it runs low another time.
export function nextLowBalanceDialog(level, seen) {
  if (!level) return { open: false, seen: null };
  if (seen === level || (seen === 'empty' && level === 'low')) return { open: false, seen };
  return { open: true, seen: level };
}
