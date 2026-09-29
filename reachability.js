/**
 * Reachability audit for Wake: enter every scene, click every choice, record where it lands.
 *
 * This is the question the trigger-scan fix left open. Wakes 2-5 should be reachable now that the scan
 * only watches the player's own notes, and that was verified at wake 2 - but not at 3, 4 or 5. A graph
 * walk answers it for every scene at once, and finds anything else stranded.
 *
 * Driving rather than parsing: the choices are closures (`action: () => goTo('x')`), so the target is not
 * readable from the source. Clicking and observing is the only faithful way, and it is the same lesson
 * as the mechanic test - use the thing itself.
 *
 * WHAT THIS CAN AND CANNOT CLAIM - learned the hard way on its first run.
 *
 * It visits every scene INDIVIDUALLY, from a cleared state (`notes = []`, `flags = {}`), and records where
 * each of that scene's choices lands. That makes it sound for questions about single scenes and UNSOUND for
 * reachability: an edge that only appears once flags have accumulated is invisible, because the state is
 * wiped between scenes.
 *
 * Its first run reported 28 of 60 scenes unreachable, and most of that was this flaw rather than the game.
 * Two distinct causes, both worth knowing:
 *   - TRANSIENT scenes. A checkpoint like wake001_end runs and immediately advances, so a click lands on
 *     wake002_open and wake001_end is passed through without ever being observed.
 *   - STATE-DEPENDENT edges. A scene whose onward choice is gated on a flag shows no onward edge from a
 *     blank state, so every later scene in that chain looks stranded.
 *
 * The reachability question - are wakes 3-5 reachable in actual play - needs a PATH search that carries
 * state forward, which is what the Aside auditor's frontier does for its scripts. Until this has one, treat
 * the unreachable list as "no edge from a blank state" and nothing more.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const scenes = fs.readFileSync('/root/workspace/wake-scenes.txt', 'utf8').trim().split('\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function settle(doc, capMs = 1400) {
  let last = -1, stable = 0;
  for (let i = 0; i < Math.ceil(capMs / 150); i++) {
    const n = (doc.querySelector('#terminal').textContent || '').length;
    stable = (n === last) ? stable + 1 : 0;
    last = n;
    if (stable >= 2) break;
    await sleep(150);
  }
}

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/' });
  const w = dom.window, doc = w.document;
  await sleep(1200);

  const edges = {};        // scene -> [landed, ...]
  const blank = [];        // scenes with no choices and no auto-advance
  for (const scene of scenes) {
    edges[scene] = [];
    w.eval(`state.notes = []; state.flags = {};`);
    w.goTo(scene);
    await settle(doc);
    const landedAt = String(w.eval('state.currentScene'));
    const labels = Array.from(doc.querySelectorAll('#terminal li')).map(li => li.textContent || '');
    if (labels.length === 0) {
      // no choices: either it auto-advanced or it is an ending
      if (landedAt !== scene) edges[scene].push(landedAt);
      else blank.push(scene);
      continue;
    }
    for (let i = 0; i < labels.length; i++) {
      w.goTo(scene);
      await settle(doc);
      const lis = doc.querySelectorAll('#terminal li');
      if (!lis[i]) continue;
      lis[i].click();
      await settle(doc);
      const to = String(w.eval('state.currentScene'));
      if (to && to !== 'null') edges[scene].push(to);
    }
    process.stderr.write('.');
  }

  fs.writeFileSync('/root/workspace/wake-graph.json', JSON.stringify({ edges, blank }, null, 1));

  // reachability from wake 1's opening
  const seen = new Set(['wake001_open']);
  const queue = ['wake001_open'];
  while (queue.length) {
    const at = queue.shift();
    for (const to of (edges[at] || [])) {
      if (!seen.has(to) && scenes.includes(to)) { seen.add(to); queue.push(to); }
    }
  }
  const unreachable = scenes.filter(s => !seen.has(s));
  console.log(`scenes ${scenes.length}, reachable from wake001_open: ${seen.size}`);
  console.log(`unreachable: ${unreachable.length}`);
  for (const s of unreachable) console.log('   !! ' + s);
  console.log(`no-choices-and-no-advance (endings/dead ends): ${blank.length}`);
  console.log('   ' + blank.join(', '));
  // Was `every(s => seen.has(s) ? 'yes' : 'NO')` - the ternary evaluates per element and `every` returns a
  // boolean, so this printed "yes" for every wake no matter what. A summary line that cannot say no.
  const wakes = [1, 2, 3, 4, 5, 6].map(n => {
    const family = scenes.filter(s => s.startsWith('wake00' + n));
    const ok = family.filter(s => seen.has(s)).length;
    return `${n}:${ok}/${family.length}`;
  });
  console.log('wake scenes reached (of total): ' + wakes.join('  '));
  process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
