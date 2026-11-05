// The kinds of notification, by name. The page lists them in each game's notification settings (js/notify-settings.js)
// and the admin's test button (js/admin.js); the program on Cloudflare uses them to decide who gets what
// (shared/alerts.js, worker/phones.js).

/**
 * Every kind of notification, in the order Notification settings (js/notify-settings.js) list them, grouped. Each notification
 * names its kind; a device gets the kinds it chose (worker/phones.js), or DEFAULT_KINDS. A lead change rides on the
 * score that made it ("TD Cardinals · Lead change") and also lets that score through on its own.
 */
export const NOTIFY_KINDS = [
  ["Scores", { touchdown: "Touchdown", "field-goal": "Field goal", safety: "Safety", "lead-change": "Lead change" }],
  ["After a touchdown", { "missed-pat": "Missed PAT", "two-point": "2-pt conversion", "failed-two-point": "Failed 2-pt" }],
  ["Possession", { turnover: "Interception or lost fumble", downs: "Turnover on downs", "missed-fg": "Missed field goal" }],
  ["Game", { kickoff: "Kickoff", "quarter-start": "Start of a quarter", "quarter-end": "End of a quarter", halftime: "Halftime",
    "two-minute": "Two-minute warning", final: "Final" }],
];

/** What every device gets until it chooses otherwise (js/notify-settings.js). */
export const DEFAULT_KINDS = ["touchdown", "field-goal", "safety", "missed-pat", "two-point", "failed-two-point", "turnover",
  "kickoff", "quarter-start", "quarter-end", "halftime", "two-minute", "final"];

/** The kinds of sample notification the admin's test button can send (shared/alerts.js sampleAlert), in the order its chooser lists them. */
export const SAMPLE_KINDS = {
  test: "Test", touchdown: "Touchdown", "missed-pat": "Missed PAT", "two-point": "2-pt conversion",
  "failed-two-point": "Failed 2-pt", "field-goal": "Field goal", "lead-change": "Lead change", turnover: "Interception",
  downs: "Turnover on downs", "missed-fg": "Missed field goal", "two-minute": "Two-minute warning",
  kickoff: "Kickoff", "quarter-start": "Start of quarter", "quarter-end": "End of quarter", halftime: "Halftime", final: "Final",
};
