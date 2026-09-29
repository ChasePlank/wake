/**
 * Wake: reachability by PATH, carrying state - the question the scene walker could not answer.
 *
 * reachability.js visits each scene in isolation from a cleared state, which is sound for single scenes and
 * unsound for reachability: transient scenes and flag-gated edges both read as stranded. This searches
 * instead - explore every path from wake 1, carrying the game's own state forward, and record which scenes
 * are reachable IN PLAY. That is the Aside auditor's frontier idea, and it is what answers whether wakes
 * 3, 4 and 5 can actually be reached.
 *
 * It must let timers run between steps, and the first version did not. Scene transitions are QUEUED, not
 * synchronous: calling a choice's action and reading state immediately returns the OLD scene, so the dedup
 * collapsed the whole game into 10 states with zero terminal states. Zero terminals is impossible for a real
 * game and was the tell. One `setImmediate` tick per edge is enough, which keeps it at a few thousand edges a
 * minute rather than the second-per-step an awaited render would cost.
 *
 * `state.choices[i].action()` is what clicking does - the handler calls precisely that - so nothing is lost
 * by invoking it directly rather than dispatching a DOM click.
 *
 * Dedup is by a signature of the state that matters: scene plus flags plus the notes actually written.
 * History and the render are excluded, because they grow forever and distinguish nothing.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
// A virtual console that drops jsdom's "not implemented" chatter. The game renders on every transition and
// each render calls scrollTo, so a full search emitted one warning per render - about 15MB of them in twelve
// minutes, which is I/O the search pays for and nobody reads.
const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();          // with no listeners, messages go nowhere
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/',
  virtualConsole: vc });
const w = dom.window;

// Frontier ceiling. 40,000 was not enough to finish this game - wake 4's deep branches were left
// unproven - so it is configurable now: CAP=200000 node path-search.js
const CAP = parseInt(process.env.CAP || '40000', 10);
// Notes are recorded WITH their provenance. The first version kept only the text and rebuilt them as
// player notes on restore, which stripped the `game: true` flag from the game's own orientation notes -
// so the trigger scan fired on them, every state reset, and the search reproduced the original bug by
// construction while appearing to measure it. A harness that reconstructs state must reconstruct ALL of it.
const SNAP = `JSON.stringify({wake: state.wake, phase: state.phase, flags: state.flags,
  notes: (state.notes || []).map(n => (n.game ? 'g:' : 'p:') + n.text), currentScene: state.currentScene})`;

function sig(step) {
  // The scene belongs here and was missing: without it every state in the same scene with the same flags
  // looks identical, so the search stops the moment it revisits a scene and the whole game collapses into
  // ten states. The tell was "terminal states: 0" - a real game always has endings - and it took two wrong
  // theories before I read this function instead of reasoning about it.
  return step.currentScene + '|' + step.wake + '|' + step.phase + '|'
       + JSON.stringify(step.flags) + '|' + step.notes.join('~');
}
const read = () => JSON.parse(w.eval(SNAP));
const tick = () => new Promise(r => setImmediate(r));      // let the queued transition run
const restore = (s) => w.eval(`state.wake = ${JSON.stringify(s.wake)};
  state.phase = ${JSON.stringify(s.phase)};
  state.flags = ${JSON.stringify(s.flags)};
  state.notes = ${JSON.stringify(s.notes)}.map(t => t.startsWith('g:')
      ? { id: 'g', tag: 'context', game: true, text: t.slice(2) }
      : { id: 'p', tag: 'new', text: t.slice(2) });`);

(async () => {
const start = { wake: 1, phase: 'examine', flags: {}, notes: [], currentScene: 'wake001_open' };
const seen = new Map([[sig(start), null]]);

// GOAL-DIRECTED, not exhaustive. The first version used a FIFO queue and explored breadth-first until it
// hit a state cap - 250,000 states did not finish, because scenes times flag combinations is combinatorial.
// But reachability does not need the whole space: it needs ONE path to each scene. So the frontier is
// searched best-first, preferring the state whose scene has been reached least often, which streaks toward
// unexplored territory instead of re-treading the hub. And the search STOPS when every scene is reached,
// because that is the question. The cap becomes a safety net rather than the stopping condition.
const sceneVisits = new Map();
// Bucketed frontier, not a linear scan. Preferring the least-visited scene is the right rule, but the first
// implementation searched the whole queue for it on every pop - O(n^2) - and that is what made a
// goal-directed search take minutes instead of seconds. Buckets keyed by visit count give the same order in
// O(1): always take from the lowest non-empty bucket.
const buckets = new Map([[0, [start]]]);
const pushState = (st) => {
  const v = sceneVisits.get(st.currentScene) || 0;
  if (!buckets.has(v)) buckets.set(v, []);
  buckets.get(v).push(st);
};
const popState = () => {
  let min = Infinity;
  for (const k of buckets.keys()) if (buckets.get(k).length && k < min) min = k;
  if (min === Infinity) return null;
  return buckets.get(min).pop();
};
const queue = { get length() { return [...buckets.values()].reduce((n, b) => n + b.length, 0); } };
const reachable = new Set();
const firstPath = new Map();
let edges = 0, dead = 0, skipped = 0;
const trace = [];
let traceOn = process.env.TRACE !== '0';   // on by default: a search that hides its edges hides its bugs

const ALL_SCENES = fs.readFileSync('/root/workspace/wake-scenes.txt', 'utf8').trim().split('\n');
const reachedScenes = new Set(['wake001_open']);

const t0 = Date.now();
// The script owns its deadline. The first version relied on the shell's timeout, which the script cannot see,
// so a truncated run printed its numbers and read like a finished one - and I reported "44 is the reachable
// set" from two runs that were both cut short. The Aside auditor draws exactly this line between CLEAN and
// INCONCLUSIVE; this tool was written later and did not carry the pattern across. Fixing that is the point.
const DEADLINE = t0 + parseInt(process.env.SECONDS || '240', 10) * 1000;
let lastReport = 0;
while (queue.length && seen.size < CAP && reachedScenes.size < ALL_SCENES.length
       && Date.now() < DEADLINE) {
  // Report the rate, not just the total. Three times in one hour I reasoned that a frontier structure was
  // fast enough and was wrong - a linear best-first, then buckets whose pop scanned every key. A rate makes
  // that visible while the search runs, instead of leaving it to be discovered as a timeout.
  if (seen.size - lastReport >= 20000) {
    lastReport = seen.size;
    const secs = (Date.now() - t0) / 1000;
    console.log(`  ... ${seen.size} states, ${reachedScenes.size}/${ALL_SCENES.length} scenes, `
      + `${Math.round(seen.size / secs)} states/sec, frontier ${queue.length}`);
  }
  const s = popState();
  if (!s) break;
  sceneVisits.set(s.currentScene, (sceneVisits.get(s.currentScene) || 0) + 1);
  reachedScenes.add(s.currentScene);
  restore(s);
  w.eval(`goTo(${JSON.stringify(s.currentScene)})`);
  await tick();
  // A transient scene - one whose enter() runs and immediately advances, like a checkpoint - leaves
  // currentScene somewhere else. That successor is the real state; the scene I asked for is just a place
  // the player passes through. Recording reachability against the REQUESTED scene is what made checkpoints
  // look unreachable and made the choices taken belong to the wrong scene.
  const effective = String(w.eval('state.currentScene'));
  reachable.add(effective);
  reachedScenes.add(effective);
  if (effective !== s.currentScene) { reachable.add(s.currentScene); reachedScenes.add(s.currentScene); }
  s.currentScene = effective;
  const n = w.eval('(state.choices || []).length');
  if (n === 0) { dead++; continue; }
  for (let i = 0; i < n; i++) {
    restore(s);
    w.eval(`goTo(${JSON.stringify(s.currentScene)})`);
    await tick();
    // Re-read the count at the point of use. The count measured after entering the scene can differ from the
    // count here, because a scene whose enter() advances in a CHAIN leaves the successor's list - and that
    // list may be shorter. Believing the earlier count crashed the search with "undefined (reading 'action')".
    // Anything that can move under you should be read where it is used, not before.
    const here = w.eval('(state.choices || []).length');
    if (i >= here) { skipped++; continue; }
    const label = w.eval(`(state.choices[${i}] || {}).label || '?'`);
    w.eval(`state.choices[${i}].action();`);
    await tick();
    const next = read();
    edges++;
    if (traceOn && trace.length < 60 && !(s.currentScene.startsWith('wake001_') && next.currentScene.startsWith('wake001_'))) {
      trace.push(`   ${s.currentScene}  --[${String(label).slice(0, 26)}]-->  ${next.currentScene}`);
    }
    if (!next.currentScene) continue;
    const k = sig(next);
    if (!seen.has(k)) { seen.set(k, s); pushState(next); firstPath.set(k, s.currentScene + ' -> ' + next.currentScene); }
  }
}

const scenes = fs.readFileSync('/root/workspace/wake-scenes.txt', 'utf8').trim().split('\n');
const unreachable = scenes.filter(s => !reachable.has(s));
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`states explored:  ${seen.size}   edges taken: ${edges}   terminal states: ${dead}`
  + (skipped ? `   choices skipped after a chained advance: ${skipped}` : ''));

// Show the dedup key, not just the outcome. The bug this cost the most time was a missing field in the
// signature, and no amount of reasoning about the search would have shown it - printing three signatures
// would have. A tool whose failure mode is "collapsed to ten states" should say what it is comparing.
const sample = [...seen.keys()].slice(0, 3);
if (traceOn) { console.log('edge trace:'); for (const t of trace) console.log(t); }
console.log('signature sample:');
for (const k of sample) console.log('   ' + k.slice(0, 110));
const distinctScenesInKeys = new Set([...seen.keys()].map(k => k.split('|')[0])).size;
console.log(`distinct scenes among explored states: ${distinctScenesInKeys}`);
// No warning keyed on `dead === 0` any more. It was written when zero terminals looked impossible - and
// then a working search still reported zero, because this game's endings all offer a choice of their own
// ("wake again"), so a terminal state is rare rather than absent. The warning was firing on correct output.
// The honest report is the numbers, and whether the search finished: a hit cap means the unreachable list
// is UNPROVEN for everything past what was reached, not wrong.
const stopReason = reachedScenes.size >= ALL_SCENES.length ? 'goal reached'
  : (Date.now() >= DEADLINE ? `deadline (${(DEADLINE - t0) / 1000}s)` : (seen.size >= CAP ? `state cap (${CAP})` : 'frontier emptied'));
console.log(`stopped because: ${stopReason}`);
console.log(reachedScenes.size >= ALL_SCENES.length
  ? `SEARCH COMPLETE BY GOAL: every one of ${ALL_SCENES.length} scenes was reached, so the reached set is`
    + ' exhaustive and any scene NOT listed is genuinely unreachable.'
  : seen.size >= CAP
  ? `SEARCH INCOMPLETE: state cap of ${CAP} reached. Scenes not listed as reached are UNPROVEN, not`
    + ' unreachable - the Aside auditor draws the same line between CLEAN and INCONCLUSIVE.'
  : (stopReason === 'frontier emptied'
      ? 'SEARCH COMPLETE: the frontier emptied, so the reached set is exhaustive and any scene NOT listed is'
        + ' genuinely unreachable.'
      : `SEARCH INCOMPLETE (${stopReason}): the ${ALL_SCENES.length - reachedScenes.size} scenes not listed are`
        + ' UNPROVEN, not unreachable. Raise SECONDS or CAP and run again - and read the stop reason before'
        + ' believing any number above it.'));
console.log(`scenes reached IN PLAY: ${reachable.size} of ${scenes.length}`);
for (const n of [1, 2, 3, 4, 5]) {
  const family = scenes.filter(s => s.startsWith('wake00' + n));
  const ok = family.filter(s => reachable.has(s));
  console.log(`  wake ${n}: ${ok.length}/${family.length}` + (ok.length < family.length
    ? '   missing: ' + family.filter(s => !reachable.has(s)).join(', ') : '   ALL REACHABLE'));
}
// Which scene first led to each wake-2+ scene, if any did.
const reachedWakes = [...reachable].filter(x => !x.startsWith('wake001_') && x !== 'wake_reset');
console.log(`scenes reached beyond wake 1: ${reachedWakes.length}`);
for (const x of reachedWakes.slice(0, 12)) console.log('   ' + x + '   first seen arriving from: '
  + ([...firstPath.entries()].find(([k]) => k.includes(x)) || ['', '?'])[1]);
console.log(`unreachable in play: ${unreachable.length}`);
for (const s of unreachable) console.log('   !! ' + s);
fs.writeFileSync('/root/workspace/wake-reachable.txt', [...reachable].sort().join('\n'));
process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });

