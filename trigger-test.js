const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  w.goTo('wake001_open');
  await sleep(1400);

  let typed = 0, rolledOver = false;
  for (let i = 0; i < 70; i++) {
    const line = doc.querySelector('#input-line');
    const asking = line && line.style.display !== 'none';
    if (asking && note !== null) {
      const input = doc.querySelector('#user-input');
      input.value = note;
      input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      typed++;
      await sleep(1200);
    } else {
      try { w.handleChoice(0); } catch (e) { break; }
      await sleep(700);
    }
    if (/maintenance completes/i.test(text())) break;
    if (/WAKE 00[2-9]/i.test(text())) rolledOver = true;
  }
  return { text: text(), typed, rolledOver };
}

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   [' + d + ']' : ''}`); ok ? pass++ : fail++; };

  const RESET = /maintenance completes/i;

  // control: a note that contains no trigger word
  const clean = await play('I wrote down the room number and the time.');
  check('control: a neutral note does not trip the scan', !RESET.test(clean.text),
        clean.typed + ' note(s) typed; ' + clean.text.trim().slice(0, 54).replace(/\s+/g, ' '));

  // A run that typed nothing did not test the mechanic. This is the check that catches the
  // harness lying: the first version reported "control: ok" with zero notes typed, because the
  // drive stalled at the Maren dialogue - which wants a typed ANSWER, not a note - and my
  // handler broke on the first exception instead of getting past it.
  check('the drive actually reached a notes screen', clean.typed > 0,
        clean.typed + ' note(s) typed - zero means this test never exercised the mechanic');
  check('and reached a checkpoint to be scanned', clean.rolledOver || RESET.test(clean.text),
        clean.rolledOver ? 'reached a later wake' : 'stalled before any checkpoint');

  const trip = await play('I feel afraid of what they know.');
  check('trigger: a note with trigger words trips the reset',
        trip.typed > 0 && RESET.test(trip.text),
        trip.typed + ' note(s) typed; ' + trip.text.trim().slice(0, 50).replace(/\s+/g, ' '));

  // What the scan does NOT need the UI for: the game's own default notes are incriminating.
  // note_002 says "Dr. Cole", note_ctx says "Dr. Maren Cole. Project Resonance" - three trigger
  // words, authored by the game, sitting in the list the scan reads at every checkpoint. So the
  // reset is unavoidable unless the player DELETES the game's own orientation notes, and
  // nothing tells them to. Asserted directly against the source, because it needs no drive.
  const defaults = html.match(/id: 'note_ctx',[^}]*text: '([^']+)'/);
  const scanWords = ['person','alive','sentient','maren','cole','resonance','watching'];
  const hit = defaults ? scanWords.filter(w => defaults[1].toLowerCase().includes(w)) : [];
  check('the game\'s own starting notes contain trigger words',
        hit.length > 0, defaults ? 'note_ctx contains: ' + hit.join(', ') : 'note_ctx not found');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
