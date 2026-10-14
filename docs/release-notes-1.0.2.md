## Wake 1.0.2 — eleven scenes were missing from your path log

**Download `wake-1.0.2.html` and open it in a browser.** One file, nothing to install.

## What was wrong

**Your path log was dropping scenes without saying so.** `renderPathLog` skips any scene it has no label for, and
**eleven scenes had no label** — including **all four WAKE 005 endings** (`continuity`, `disagreement`, `drift`,
`replica`) and `wake_reset`. The endings are the part of the story a reader is most likely to look back at, and they
were the part most likely to be missing from "Your path so far".

**And five labels named scenes that do not exist at all.** The second waking kept the first waking's vocabulary
(`examine`, `logs`, `respond`, `external`, `ignore`) in the label table and then used a different one, so those five
lines could never be shown. Removed.

Both directions now agree: **60 labels, 60 scenes.**

## Also in this release

- **A test that drives to those scenes and asks the log**, rather than reading the label table — the table is not
  reachable from a test, and the fault was in what the player sees. `smoke.js` is ten checks now.
- **A thirteenth mutation**: a label key renamed so the scene loses its label, renamed rather than blanked because an
  empty replacement is what that list got wrong once before.

## What is verified, and what is not

The four test scripts run the game in **jsdom**, not in a browser: they drive the story, the mechanics, the branches
and the archive, and they would have caught the page failing to load at all — which they did, within a minute, while
this fix was being written. They do not test how anything looks. That is what opening the file is for.
