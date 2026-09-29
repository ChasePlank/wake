# smoke.js — headless check that the game still boots and plays

`node smoke.js` loads `index.html` in jsdom and drives the story through the game's own
entry points. It exists because nothing had verified this game since it was written, and a
browser game can break without anything in the repo changing.

What it establishes, all measured:

- the entry screen is the save-slot picker
- `goTo` is a global, so the story is drivable past the picker (the picker's items navigate,
  which jsdom refuses — that is why the test does not click them)
- WAKE 001 renders
- choices advance the story, 10 out of 10 clicks
- `saveState()` writes slot data (`wake_save_1`)

Also:

- **`saveState()` writes slot data**, and a save that is present **before the page's script
  runs** resumes the game — "Save found. Wake 1, phase: examine." — with the **path log
  rendering on resume**.

One thing it records rather than asserts, because a zero is not a failure: the path log draws
at checkpoints, endings and resumes, not mid-scene.

## The open question, resolved

Last revision left this open: carrying a save across jsdom instances, slot 1 still read
"(empty)" — the harness setting storage too late, or a slot-UI bug?

**It was the harness.** jsdom's `beforeParse` hook seeds storage *before* the page's script
runs, and with that the game resumes correctly. Setting storage after load can never reach an
entry screen that reads it at load time. The check is now real, and the code says why.

jsdom gives every instance its own `localStorage`, so persistence is carried across by hand.
That is the browser's job in reality and the harness's here.
