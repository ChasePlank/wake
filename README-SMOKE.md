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

Two things it records rather than asserts, because a zero is not a failure:

- the path log draws at checkpoints and endings, not mid-scene
- **an open question:** carrying a save across jsdom instances, slot 1 still reads "(empty)".
  Either the harness sets storage after the page has already run its script, or the entry
  screen ignores existing saves. Unexplained, and stated as such.

jsdom gives every instance its own `localStorage`, so persistence is carried across by hand.
That is the browser's job in reality and the harness's here.
