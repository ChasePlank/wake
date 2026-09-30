const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(seed) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/',
    // beforeParse runs BEFORE the page's own script. The entry screen reads storage at load,
    // so seeding afterwards can never reach it - which is what made a working save look
    // ignored, and cost an hour to understand.
    beforeParse(window) { if (seed) for (const k of Object.keys(seed)) window.localStorage.setItem(k, seed[k]); },
  });
  await sleep(1300);
  return dom;
}
const text = d => d.window.document.querySelector('#terminal').textContent || '';
const logLines = d => d.window.document.querySelectorAll('.path-log-line').length;

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d2 = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d2 ? '   [' + d2 + ']' : ''}`); ok ? pass++ : fail++; };

  const dom = await open();
  const w = dom.window;
  check('entry screen is the save-slot picker', /select a save slot/i.test(text(dom)),
        text(dom).trim().slice(0, 46).replace(/\s+/g, ' '));

  // drive the story by its own entry point, past the picker's navigations
  check('goTo exists as a global, so the story is drivable', typeof w.goTo === 'function');
  w.goTo('wake001_open');
  await sleep(1600);
  check('WAKE 001 renders', /WAKE 001/i.test(text(dom)), text(dom).trim().slice(0, 44).replace(/\s+/g, ' '));

  let advanced = 0;
  for (let i = 0; i < 10; i++) {
    const before = text(dom);
    try { w.handleChoice(0); } catch (e) { break; }
    await sleep(1100);
    if (text(dom) !== before) advanced++;
  }
  check('choices advance the story', advanced >= 4, advanced + '/10 advanced');
  // The path log draws at checkpoints/endings, not mid-scene, so a zero here is not a
  // failure - recorded rather than asserted.
  console.log('     (path log lines mid-scene: ' + logLines(dom) + ')');

  // persistence: save, then a fresh page must offer to continue
  w.saveState();
  const saved = Object.keys(w.localStorage).map(k => k + '=' + String(w.localStorage.getItem(k)).slice(0, 12)).join(' | ');
  // wake_save_<n> is the SLOT DATA; wake_slot is only the current slot index, set by the
  // picker. The first version of this looked for wake_slot and failed on a working save.
  check('saveState writes slot data', /wake_save_/.test(saved), saved.slice(0, 70));

  // Persistence, tested the way a browser does it: the save is present BEFORE the page's
  // script runs. The previous version seeded storage after load and read "(empty)", which
  // looked like a slot-UI bug and was this harness's fault - resolved by re-testing with
  // beforeParse, where the page resumes with "Save found".
  const carried = {};
  for (const k of Object.keys(w.localStorage)) carried[k] = w.localStorage.getItem(k);
  const domFresh = await open(carried);
  const tf = domFresh.window.document.querySelector('#terminal').textContent || '';
  check('a save present at load resumes the game', /save found/i.test(tf),
        tf.trim().split('\n')[0].slice(0, 64));
  check('and the path log renders on resume', /path so far/i.test(tf),
        tf.trim().replace(/\s+/g, ' ').slice(30, 96));

  // The Maren class, guarded. A flag READ but never WRITTEN is a gate nothing can open, and it hides content
  // silently - it made the game's best ending unexplainable on every playthrough. Seventeen flags are written
  // but never consulted; those are known bookkeeping, so this asserts the READ count cannot shrink rather than
  // demanding zero. A new flag that gated content and was never set would fail here.
  {
    const src = fs.readFileSync('index.html', 'utf8');
    const writes = new Set([...src.matchAll(/state\.flags\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=[^=]|\+=|\+\+|--)/g)].map(m => m[1]));
    const mentions = {};
    for (const m of src.matchAll(/state\.flags\.([A-Za-z_][A-Za-z0-9_]*)/g)) mentions[m[1]] = (mentions[m[1]] || 0) + 1;
    const unopenable = Object.keys(mentions).filter(f => !writes.has(f)).sort();
    const KNOWN_UNOPENABLE = [];   // was ['knowsAboutMaren'] before it was wired
    const newOnes = unopenable.filter(f => !KNOWN_UNOPENABLE.includes(f));
    check('no gate is read without anything that can open it', newOnes.length === 0,
          newOnes.length ? 'unset gates: ' + newOnes.join(', ') : unopenable.length + ' known');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
