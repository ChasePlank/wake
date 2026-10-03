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

`README-SMOKE.md` explains the smoke test in more detail than this does.

## How much of it can you reach

**44 of 60 scenes are reachable in play**, verified by `path-search.js` across ~76,000 explored edges. The other
16 are **not proven unreachable** — they are gated by flag combinations and depth the search did not get to, and
the bottleneck is the jsdom simulator (~3ms per state), not the search. Wake 4 is the least explored at 13 of 24.
The endings are all reachable, and the best one was impossible to reach until 2026-10-03: it needed a flag that
was read and never written.

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
