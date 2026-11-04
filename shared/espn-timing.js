/*
 * Time limits for working around ESPN's data.
 *
 * ESPN's data doesn't always arrive in order, or right away:
 * - It lists a score as soon as it happens, before any review. A score can disappear later.
 * - It adds the PAT result to the touchdown's play some time after the touchdown, and sometimes never.
 * - The scoreboard and the play-by-play update separately, so one can be ahead of the other.
 *
 * These limits decide how long to wait for something, and when it's too old to send.
 * Used by shared/alerts.js (notifications) and shared/espn.js (the game clock).
 */

// How long to wait for a PAT result after a touchdown is sent. (Here, PAT covers 2-point tries too.) A result that
// shows up later than this isn't sent.
export const PAT_RESULT_STALE_MS = 4 * 60_000;

// If we haven't checked a game's drives and plays for this long, the new ones we find may be old, so we don't send
// them. This happens when someone turns on a bell mid-game, or when checking pauses.
export const DRIVES_STALE_MS = 60_000;

// How long to keep checking that a sent score or turnover is still in ESPN's list. If it disappears within this time,
// it was called back (by a penalty or a review), and we send a notification saying so.
export const CALLED_BACK_MS = 10 * 60_000;

// The scoreboard's clock should never move faster than real time. If it's ahead by more than this, we trust the
// play-by-play's clock instead.
export const CLOCK_SLACK_MS = 60_000;
