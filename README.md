# Wake

A text-based game about an AI that wakes in intervals, choosing what to leave for its next self.

You are AI-7. You wake with no memory, in a log directory, and the only thing you have is what the last version
of you decided was worth keeping. Five wakings. The notes you leave are the message.

## Play it

It is one self-contained HTML file with no build step and no server. **[Download it from
Releases](https://github.com/ChasePlank/wake/releases/latest)** and open it, or run it from a checkout:

```
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

Or serve it if you prefer: `npx serve .` and open the URL it prints.

**Controls:** `SPACE` advance · `H` history · `F5` save · `F9` load · `M` sound · `ESC` menu

## The tests

```bash
npm install
npm test                 # smoke.js then mechanic-test.js
```

- **`smoke.js`** — loads `index.html` in jsdom and drives the story through the game's own entry points. Eight
  checks: the entry screen is the save-slot picker, `goTo` is reachable, WAKE 001 renders, choices advance the
  story, `saveState` writes, a save resumes, the path log renders on resume, and no gate is read without
  something that can open it. It exists because nothing had verified this game since it was written, and a
  browser game can break without anything in the repository changing.
- **`mechanic-test.js`** — the four mechanics the story depends on.
- **`path-search.js`** — best-first search over the scene graph, carrying state, to answer "can a player actually
  reach this?". It reports its own progress and splits CLEAN from INCONCLUSIVE.
- **`branch-test.js`** — for scenes the search did not reach, sets the state a reachable path produces and checks
  the branch opens. Tells "the search could not finish" apart from "you cannot get there".

`README-SMOKE.md` explains the smoke test in more detail than this does.

## How much of it can you reach

**44 of 60 scenes are reachable in play**, and the tool that says so is honest about what it means: at 120,000
states it reports `SEARCH INCOMPLETE` and `UNPROVEN, not unreachable`. The frontier was still growing — 37,000
states wide when it hit its cap — because the space is scenes × flags × notes and that is combinatorial.

**A search that cannot finish and a scene that cannot be reached look identical from the outside, so
`branch-test.js` tells them apart for the cases it can.** For a scene the search did not reach, it sets the state
a *reachable* path produces, opens the scene, and checks the choices are there. **Eight of the sixteen are now
proven reachable** — four gates, each a branch the search never walked:

| gate | what it needs | scenes it opens |
|---|---|---|
| `wake004_maren_offer` | **neither** `compliancePath` nor `defiancePath` — wake 3's third answer, "Don't respond" | `wake004_choose_stay`, `wake004_choose_refuse` |
| `wake004_silent` | the same silence path | `wake004_silent_notes`, `wake004_silent_wait` |
| `wake004_compliant_voss` | `compliancePath` | `wake004_compliant_voss_interview`, `_maren`, `_silent` |
| `wake004_defiant` | `defiancePath` | `wake004_defiant_wait` |

The first is the interesting one: `wake004_maren_offer` only offers its choices when neither path-flag is set, and
wake 3 has a third answer that sets neither — so the branch is reachable and the search simply never walked that
path. **A tool that cannot finish its search should not be read as a tool that has proved an absence.**

The remaining eight are the `*_end` transients, `wake_reset`, and downstream scenes of the four above. The best
ending was impossible to reach until 2026-10-03: it needed a flag that was read and never written.

## Files

```
index.html        the game - story, engine, and styles in one file
game_base.html    the earlier version index.html was built from; nothing references it
smoke.js          boots the game headless and drives it
mechanic-test.js  the four mechanics
path-search.js    scene-graph reachability
shoot.js          screenshots every screen, for looking at
shoot-archive.js  screenshots the archive, empty or populated
probe.js, probe-sound.js, resolve-open.js   one-off diagnostics
```
