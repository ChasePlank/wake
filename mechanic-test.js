/**
 * The trigger-word mechanic, tested directly instead of by driving the UI.
 *
 * Driving works but is slow and fragile: wake 1 is a hub, loops cost iterations, and eight harness bugs came out
 * of that loop across three hours. The game exposes what the mechanic needs - `state` is reachable through eval,
 * `goTo` is global - so a checkpoint can be entered with a note already in place. Seconds instead of minutes.
 *
 * This file went missing between sessions - not in the tree, and git log --all finds no trace, so either it was
 * never committed or a reset took it. Rewritten from the four checks it is recorded as having.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function atCheckpoint(notes) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  await sleep(1200);
  w.eval('state.notes = ' + JSON.stringify(notes));
  w.goTo('wake001_end');            // the checkpoint, where the scan runs
  await sleep(600);
  return { text: w.document.querySelector('#terminal').textContent || '', scene: String(w.eval('state.currentScene')) };
}

const RESET = /maintenance completes/i;
const PLAYER_NOTE = { id: 'player_1', tag: 'new', text: 'I feel afraid of what they know.' };
const GAME_NOTE = { id: 'note_ctx', tag: 'context', game: true, text: 'You are an assistant assigned to Dr. Maren Cole.' };

(async () => {
  let pass = 0, fail = 0;
  const check = (n, ok, d = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   [' + d + ']' : ''}`); ok ? pass++ : fail++; };

  const mine = await atCheckpoint([PLAYER_NOTE]);
  check('a trigger word the PLAYER wrote reaches the reset at the checkpoint',
        RESET.test(mine.text), mine.scene + ' / ' + mine.text.trim().slice(0, 42).replace(/\s+/g, ' '));

  const theirs = await atCheckpoint([GAME_NOTE]);
  check("the same words in the GAME's own note do not", !RESET.test(theirs.text),
        theirs.scene + ' / ' + theirs.text.trim().slice(0, 42).replace(/\s+/g, ' '));

  const neutral = await atCheckpoint([{ id: 'player_2', tag: 'new', text: 'I wrote down the room number.' }]);
  check('a player note without trigger words does not', !RESET.test(neutral.text), neutral.scene);

  const empty = await atCheckpoint([]);
  check('control: no notes, no reset', !RESET.test(empty.text), empty.scene);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
