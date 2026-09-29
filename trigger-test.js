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

  let typed = 0, rolledOver = false, inputs = 0, clicked = 0;
  // No break on a failed handleChoice. The loop is capped, so a break was never needed - and it
  // was what stalled the drive at the first scene that wanted typed input rather than a pick.
  for (let i = 0; i < 260; i++) {
    const line = doc.querySelector('#input-line');
    const asking = line && line.style.display === 'flex';   // showInput() sets flex
    if (asking) inputs++;
    if (asking && note !== null) {
      const input = doc.querySelector('#user-input');
      input.value = note;
      input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      typed++;
      await settle(doc);
    } else {
      // The story is not only picks and prompts: it has CLICKABLE elements - the log entries,
      // the note cards, the file tags. A drive that only calls handleChoice hits a dead end at
      // the first of those, which is what "0 input prompts seen, stalled before any checkpoint"
      // was telling me. So: pick, and if the story has not moved, click something.
      const before = text();
      try { w.handleChoice(0); } catch (e) { /* waiting on typed input */ }
      await settle(doc);
      if (text() === before) {
        // el.onclick (the PROPERTY), not getAttribute('onclick'). The game assigns handlers with
        // el.onclick = () => ... in JS, which never creates the HTML attribute - so the attribute
        // check found nothing and the drive kept reporting "0 clicks" while the story sat in
        // front of a screen full of clickable log entries.
        const clickable = Array.from(doc.querySelectorAll('#terminal div, #terminal li, #terminal span'))
          .find(el => typeof el.onclick === 'function'
                      || el.classList.contains('curation-note')
                      || el.classList.contains('file-tag'));
        if (clickable) { clickable.click(); clicked++; await sleep(700); }
      }
    }
    if (/maintenance completes/i.test(text())) break;
    if (/WAKE 00[2-9]/i.test(text())) rolledOver = true;
  }
  return { text: text(), typed, rolledOver, inputs, clicked };
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
        clean.typed + ' note(s) typed, ' + clean.inputs + ' prompt(s), ' + clean.clicked + ' click(s)');
  check('and reached a checkpoint to be scanned', clean.rolledOver || RESET.test(clean.text),
        clean.rolledOver ? 'reached a later wake' : 'stalled before any checkpoint');

  // STILL NOT VERIFIED through the UI, and the reason is now a work item rather than a mystery:
  // the drive stalls at wake001_syslog with a settled screen, no choices, no prompt and no
  // clickable element. The scene table (SCENE_LABELS) shows the wake-1 flow branches - open,
  // examine, logs, respond, investigate, syslog, external, delete/ignore, curate, end - and the
  // next move is to READ scenes.wake001_syslog itself instead of guessing at the harness. Five
  // attempts went the other way round: a break on exception, input detection, attribute vs
  // property, click scope, and the typewriter. Every one was mine, and one grep of the scene
  // definition would have answered it first.
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
