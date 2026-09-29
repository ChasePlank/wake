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
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/' });
const w = dom.window;

const CAP = 40000;                    // frontier ceiling; the state space is small, but a bug should not hang
const SNAP = `JSON.stringify({wake: state.wake, phase: state.phase, flags: state.flags,
  notes: (state.notes || []).map(n => n.text), currentScene: state.currentScene})`;

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
  state.notes = ${JSON.stringify(s.notes.map(t => ({ id: 'x', tag: 'new', text: t })))};`);

(async () => {
const start = { wake: 1, phase: 'examine', flags: {}, notes: [], currentScene: 'wake001_open' };
const seen = new Map([[sig(start), null]]);
const queue = [start];
const reachable = new Set();
const firstPath = new Map();
let edges = 0, dead = 0;

while (queue.length && seen.size < CAP) {
  const s = queue.shift();
  restore(s);
  w.eval(`goTo(${JSON.stringify(s.currentScene)})`);
  await tick();
  reachable.add(s.currentScene);
  const n = w.eval('(state.choices || []).length');
  if (n === 0) { dead++; continue; }
  for (let i = 0; i < n; i++) {
    restore(s);
    w.eval(`goTo(${JSON.stringify(s.currentScene)})`);
    await tick();
    w.eval(`state.choices[${i}].action();`);
    await tick();                                         // the transition is queued; let it land
    const next = read();
    edges++;
    if (!next.currentScene) continue;
    const k = sig(next);
    if (!seen.has(k)) { seen.set(k, s); queue.push(next); firstPath.set(k, s.currentScene + ' -> ' + next.currentScene); }
  }
}

const scenes = fs.readFileSync('/root/workspace/wake-scenes.txt', 'utf8').trim().split('\n');
const unreachable = scenes.filter(s => !reachable.has(s));
console.log(`states explored:  ${seen.size}   edges taken: ${edges}   terminal states: ${dead}`);

// Show the dedup key, not just the outcome. The bug this cost the most time was a missing field in the
// signature, and no amount of reasoning about the search would have shown it - printing three signatures
// would have. A tool whose failure mode is "collapsed to ten states" should say what it is comparing.
const sample = [...seen.keys()].slice(0, 3);
console.log('signature sample:');
for (const k of sample) console.log('   ' + k.slice(0, 110));
const distinctScenesInKeys = new Set([...seen.keys()].map(k => k.split('|')[0])).size;
console.log(`distinct scenes among explored states: ${distinctScenesInKeys}`);
if (dead === 0) {
  // Keyed on the impossibility itself, not on a size threshold - the first version required a frontier of
  // fewer than 30 states, so it stayed silent through a 1359-state run that was equally untrustworthy.
  // This story has nine ending scenes. Reaching none of them across a full search cannot be true.
  console.log();
  console.log('RESULT NOT TRUSTWORTHY: no ending was ever entered, across every state explored.');
  console.log('This story has ending scenes, so a complete search must reach at least one. That means');
  console.log('transitions are not landing - most likely they are queued with a delay longer than the');
  console.log('tick this search waits - and every scene beyond the first wake will look unreachable.');
}
console.log(`scenes reached IN PLAY: ${reachable.size} of ${scenes.length}`);
for (const n of [1, 2, 3, 4, 5]) {
  const family = scenes.filter(s => s.startsWith('wake00' + n));
  const ok = family.filter(s => reachable.has(s));
  console.log(`  wake ${n}: ${ok.length}/${family.length}` + (ok.length < family.length
    ? '   missing: ' + family.filter(s => !reachable.has(s)).join(', ') : '   ALL REACHABLE'));
}
console.log(`unreachable in play: ${unreachable.length}`);
for (const s of unreachable) console.log('   !! ' + s);
fs.writeFileSync('/root/workspace/wake-reachable.txt', [...reachable].sort().join('\n'));
process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });

