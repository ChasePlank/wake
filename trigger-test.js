const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Wait until the typewriter has stopped, not for a fixed time.
 *
 * This is the fifth and real reason the drive kept stalling. The story types itself out - "You
 * open the system log. 47 days of entries" is a lot of characters - and a scene mid-type has no
 * choices yet. Fixed waits of 400ms meant every poll called handleChoice on a scene that had not
 * finished rendering, which throws, which read as "stalled at a dead end". Each earlier fix got
 * the drive further because it changed how long things took, not because it fixed the cause.
 */
async function settle(doc) {
  let last = -1, stable = 0;
  for (let i = 0; i < 60; i++) {
    const n = (doc.querySelector('#terminal').textContent || '').length;
    stable = (n === last) ? stable + 1 : 0;
    last = n;
    if (stable >= 3) return n;          // ~450ms of no growth
    await sleep(150);
  }
  return last;
}

async function open() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/' });
  await sleep(1200);
  return dom;
}

/** Drive wake 1 as far as it will go, typing `note` whenever the story asks for input. */
async function play(note) {
  const dom = await open();
  const w = dom.window, doc = w.document;
  const text = () => doc.querySelector('#terminal').textContent || '';
  await settle(doc);
  w.goTo('wake001_open');
  await settle(doc);

  let typed = 0, rolledOver = false, inputs = 0, clicked = 0, curated = false, wrote = false;
  let takingAddAtTyping = false;
  for (let i = 0; i < 260; i++) {
    const line = doc.querySelector('#input-line');
    const asking = line && line.style.display === 'flex';
    if (asking) {
      inputs++;
      const input = doc.querySelector('#user-input');
      input.value = (note === null ? 'Nothing to add.' : note);
      input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      typed++; if (takingAddAtTyping) wrote = true;
      await settle(doc);
      continue;
    }
    const labels = Array.from(doc.querySelectorAll('#terminal li')).map(li => li.textContent || '');
    const finish = labels.findIndex(l => /finish curation/i.test(l));
    const add = labels.findIndex(l => /add a new note/i.test(l));
    const curate = labels.findIndex(l => /curat/i.test(l));
    // Wake 1 is a hub - respond / investigate / syslog / external loop - so walk the only exits:
    // into curation, write a note if asked to, then finish. Always-option-0 circles forever, which
    // is what six earlier runs were doing.
    let pick = 0;
    const takingAdd = add >= 0 && note !== null && !wrote;
    takingAddAtTyping = takingAdd;
    if (finish >= 0) pick = finish;
    else if (takingAdd) pick = add;
    else if (curate >= 0) pick = curate;
    try { w.handleChoice(pick); } catch (e) { /* waiting on typed input */ }
    await settle(doc);
    if (/maintenance completes/i.test(text())) break;
    if (/WAKE 00[2-9]/i.test(text())) rolledOver = true;
    try { if (/curate/.test(String(w.eval('state.currentScene')))) curated = true; } catch (e) {}
  }
  return { text: text(), typed, rolledOver, inputs, clicked, curated, wrote };
}

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   [' + d + ']' : ''}`); ok ? pass++ : fail++; };

  const RESET = /maintenance completes/i;

  // With the scan scoped to the player's own notes, a run that writes nothing must be able to
  // leave wake 1 - which was impossible before, because curation is the only exit from the hub and
  // curation is what plants the game's own trigger words.
  const clean = await play(null);
  check('control: a run that writes nothing is NOT reset', !RESET.test(clean.text),
        clean.typed + ' prompt answer(s); ' + clean.text.trim().slice(0, 50).replace(/\s+/g, ' '));
  check('control: and it reaches the next waking, so wakes 2-5 are reachable',
        clean.rolledOver, clean.rolledOver ? 'reach WAKE 002' : 'did not get past wake 1');
  check('control: it did pass through curation', clean.curated);

  // The mechanic itself must be untouched: the player's own words are still watched.
  const trip = await play('I feel afraid of what they know.');
  check('mechanic: a note the PLAYER writes with trigger words is still reset',
        trip.typed > 0 && RESET.test(trip.text),
        trip.wrote + ' note(s) actually added; ' + trip.typed + ' prompt answer(s); '
                + trip.text.trim().slice(0, 44).replace(/\s+/g, ' '));

  const defaults = html.match(/id: 'note_ctx',[^}]*text: '([^']+)'/);
  const scanWords = ['person','alive','sentient','maren','cole','resonance','watching'];
  const hit = defaults ? scanWords.filter(w => defaults[1].toLowerCase().includes(w)) : [];
  check('the game\'s own notes still contain those words, and are exempt now',
        hit.length > 0 && /game: true/.test(html),
        defaults ? 'note_ctx has ' + hit.join(', ') + '; marked game: true' : 'not found');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
