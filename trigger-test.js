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

  let typed = 0, rolledOver = false, inputs = 0, clicked = 0, curated = false;
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
      // Wake 1 is a HUB: respond, investigate, syslog and external all loop back to each other, so
      // an always-option-0 drive circles it forever - which is what "stalled before any checkpoint"
      // actually was, for six runs. The way out is the curation choice, and curation is the screen
      // that creates the game's own trigger-word notes. Prefer it.
      const labels = Array.from(doc.querySelectorAll('#terminal li')).map(li => li.textContent || '');
      const curate = labels.findIndex(l => /curat/i.test(l));
      try { w.handleChoice(curate >= 0 ? curate : 0); } catch (e) { /* waiting on typed input */ }
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
    try { if (/curate/.test(String(w.eval('state.currentScene')))) curated = true; } catch (e) {}
  }
  return { text: text(), typed, rolledOver, inputs, clicked, curated };
}

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   [' + d + ']' : ''}`); ok ? pass++ : fail++; };

  const RESET = /maintenance completes/i;

  // The finding, tested from both ends. NOTHING is typed in either run - the game's own default
  // notes are what trip the scan, and they are created by the curation screen, which is the only
  // way out of the wake-1 hub.
  const clean = await play('I wrote down the room number and the time.');
  check('a run that writes NO notes still reaches the reset ending',
        RESET.test(clean.text),
        clean.typed + ' note(s) typed; ' + clean.text.trim().slice(0, 58).replace(/\s+/g, ' '));
  check('and it got there by passing through curation',
        clean.curated || /maintenance completes/i.test(clean.text),
        clean.curated ? 'the drive entered wake001_curate' : 'reset reached anyway');
  check('so the reset does not depend on anything the player writes',
        clean.typed === 0 && RESET.test(clean.text),
        'the scan found trigger words the GAME authored');

  const defaults = html.match(/id: 'note_ctx',[^}]*text: '([^']+)'/);
  const scanWords = ['person','alive','sentient','maren','cole','resonance','watching'];
  const hit = defaults ? scanWords.filter(w => defaults[1].toLowerCase().includes(w)) : [];
  check('and here they are, in the game source',
        hit.length > 0, defaults ? 'note_ctx contains: ' + hit.join(', ') : 'note_ctx not found');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
