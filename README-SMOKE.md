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


## mechanic-test.js — the trigger-word mechanic, tested directly

`node mechanic-test.js` — 4 checks, seconds, no driving.

**What it proves:** a note the PLAYER writes containing a trigger word reaches the reset ending at the
checkpoint; the SAME words in the game's own orientation note do not; a player note without trigger words
does not; and with no notes at all there is no reset.

**Why it is not a UI drive.** Driving works, but it took three hours and eight separate harness bugs: wake 1
is a hub whose rooms loop, the dialogue wants specific answers, prompts and clicks are two more interaction
modes, and every one of my loops got one of those wrong in turn. The game exposes everything this mechanic
needs — `state` is reachable through `eval`, `goTo` is global — so a checkpoint can be entered with a note
already in place:

```js
w.eval("state.notes = " + JSON.stringify(notes));
w.goTo('wake001_end');
```

**Seven seconds, and no interaction model to get wrong.** The rule this produced, which generalises: when a
system provides an API, test through the API. Re-implementing its behaviour means every mistake you make is a
mistake about your model of it, not about the thing itself.

**Retired:** `trigger-test.js`, the UI drive. It was superseded by this and was failing for reasons about my
harness rather than the game. It is in the history if the slow path is ever wanted.


## path-search.js — is a scene reachable IN PLAY

`CAP=250000 node path-search.js` — a state-carrying search from wake 1, exploring every path and carrying the
game's own flags and notes forward. This answers the question a scene-by-scene walk cannot: **which scenes a
player can actually reach.**

```
scenes reached IN PLAY: 44 of 60      scenes beyond wake 1: 33
  wake 1: 11/12   wake 2: 9/10   wake 3: 8/9   wake 4: 13/24   wake 5: 3/4
```

It reports whether the search **finished** or hit its cap, because an unfinished search makes scenes *unproven*
rather than unreachable — the same line the Aside auditor draws between CLEAN and INCONCLUSIVE.

Two things it knows that are worth knowing before changing it:

- **A transient scene is never observable.** `wake001_end` runs its scan and advances inside one synchronous
  `goTo`, so no search can see it as a current scene. Its absence from the reached list is correct.
- **The console must stay silenced.** Every transition renders and every render calls `scrollTo`; leaving
  jsdom's virtual console active emitted **74 MB** of "not implemented" warnings in one run, which slowed the
  search enough that it was killed before finishing. `path-search.js` passes a `VirtualConsole` with no
  listeners. Do not remove it.

**Retired:** `reachability.js`, the scene-by-scene walker. It reported 28 of 60 scenes unreachable, and most of
that was its own method — it visits each scene from a cleared state, so transient scenes and flag-gated edges
both read as stranded. The path search supersedes it entirely. It is in the history if the per-scene choice
catalogue is ever wanted.
