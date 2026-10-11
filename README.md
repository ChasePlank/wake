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

**`npm test` runs four scripts**, and this section used to name two of them - a list that under-describes the gate
is the same fault as a count that has gone stale, and it is the reason `archive-test.js` was not mentioned at all.

```bash
npm install
npm test                 # smoke, mechanic, branch and archive, in that order
```

- **`smoke.js`** — loads `index.html` in jsdom and drives the story through the game's own entry points. Nine
  checks: the entry screen is the save-slot picker, `goTo` is reachable, WAKE 001 renders, choices advance the
  story, `saveState` writes, a save resumes, the path log renders on resume, and no gate is read without
  something that can open it. It exists because nothing had verified this game since it was written, and a
  browser game can break without anything in the repository changing.
- **`mechanic-test.js`** — the four mechanics the story depends on.
- **`branch-test.js`** — for scenes the search did not reach, sets the state a reachable path produces and checks
  the branch opens. Tells "the search could not finish" apart from "you cannot get there".
- **`archive-test.js`** — the archive across the two reset paths, which is where the story's memory and its saves
  interact: a word written is still there, the same word twice is still one word, the trigger reset clears the
  save and **keeps** the archive, and a manual reset wipes it.
- **`path-search.js`** — best-first search over the scene graph, carrying state, to answer "can a player actually
  reach this?". It reports its own progress and splits CLEAN from INCONCLUSIVE. **It is not part of `npm test`** —
  it is a search, run when the question is reachability, and the section below is what it said.

`README-SMOKE.md` explains the smoke test in more detail than this does.

**`tools/mutations.sh` asks a different question: are these checks able to fail?** It breaks one invariant at a time
and runs the suite, and it is not part of `npm test` for the same reason the path search is not — five mutations are
five full runs of four jsdom suites, which is minutes rather than seconds. An audit to run when adding a check, not a
tax on every commit.

```
  archive: the same word twice is two words      caught
  archive: nothing is ever written               caught
  archive: the archive never loads               caught
  reset: a manual reset keeps the archive        caught
  reset: the trigger reset wipes the archive     caught

  caught: 5   not caught: 0   never applied or ambiguous: 0
```

**All five are caught, and it took three attempts to be able to say that honestly — which is the argument for having
the tool rather than trusting the green.** A check that cannot fail is worse than no check, because it reads as
coverage.

**It reports three different kinds of nothing, because they are not the same thing:**
- **NOT CAUGHT** — the mutation applied and no test noticed. This is the finding.
- **ANCHOR MISSING** — the mutation never applied, so the run proves nothing.
- **AMBIGUOUS ANCHOR** — the anchor fits more than one place. This one is the subtle one: the first version of the
  trigger-reset entry landed inside `clearSave()` instead, where wiping the archive is harmless because the only
  caller wipes it anyway, and the tool reported *"NOT CAUGHT — no test covers this"* about a claim that is in fact
  covered. All three print as silence if the tool only prints findings.

## How much of it can you reach

**All 60 scenes are reachable. The search that said 44 could not finish, and it was measuring a model of the
game that was missing two things.**

`path-search.js` explores states and reports honestly:

```
SEARCH INCOMPLETE: state cap of 120000 reached.
Scenes not listed as reached are UNPROVEN, not unreachable.
```

The frontier was 37,000 states wide when it stopped and still growing, because the space is scenes × flags ×
notes and that is combinatorial. So "44 of 60" was never a claim about the game — and `branch-test.js` shows it
was not even close to one. It takes each scene the search did not reach, sets the state a *reachable* path
produces, and checks the scene arrives:

```
11 passed, 0 failed
```

**Every one of the sixteen is reachable.** The search missed them for two reasons, and neither is about the game:

- **It never types.** The game is played two ways — choosing an option and *typing text* — and there are 21 sites
  in `index.html` that set `state.inputMode = 'text'`. Four scenes hang off typed input: answering Maren,
  confirming the transfer, curating it, and the reset, which fires when a note **you wrote by hand** contains a
  trigger word.
- **It does not record transients.** `wake001_end`, `wake002_end`, `wake003_end` and `wake004_transfer_complete`
  are entered and left in the same breath — they set the next wake and go. A search that records the scene it is
  standing in never lists them, and *never listed* is not *never entered*.

**A search that cannot finish its search must not be read as a search that has proved an absence** — and a
reachability figure is a statement about the model as much as about the game. `branch-test.js` is in `npm test`,
so this is checked rather than argued.

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
