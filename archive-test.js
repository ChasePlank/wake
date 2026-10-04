/**
 * The hidden archive - the thing the whole game is about, and the one part nothing tested.
 *
 * <p>Wake's premise is that a word you learn by dying survives the reset, so the next version of you starts
 * knowing something you were never told. `index.html` line 225 says so in a comment - "Trigger-reset: the hidden
 * archive survives. The save does not." - and until now that comment was the only thing holding it up. All three
 * existing suites pass with zero references to `archive` in any of them.
 *
 * <p>It was found the usual way: by looking. `shoot.js` claimed in its own comment to capture "the last of Wake's
 * views never looked at", then called goTo('wake_archive') and photographed an error - there is no such scene,
 * wake_archive is a localStorage KEY. Looking in the wrong place is a way of never looking, and a comment saying
 * a thing has been seen is how it goes unnoticed.
 *
 * <p>Tested directly rather than by driving the UI, for the reason mechanic-test.js gives: driving is slow and
 * fragile, and the game exposes what the mechanic needs.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   (' + detail + ')' : '')); }
}

(async () => {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/',
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  await sleep(1200);

  // A fresh browser has no archive, and the game must cope with that rather than throwing.
  check('a fresh start has an empty archive', w.eval('loadArchive().length') === 0);

  w.eval("addWordToArchive('maren')");
  check('a word written to the archive is there', w.eval("loadArchive().includes('maren')"));

  w.eval("addWordToArchive('maren')");
  check('the same word twice is still one word', w.eval('loadArchive().length') === 1,
        'length ' + w.eval('loadArchive().length'));

  w.eval("addWordToArchive('resonance')");
  check('and a second word joins it', w.eval('loadArchive().length') === 2);

  // THE ONE THAT MATTERS. startFreshAfterReset is what a trigger-reset calls: it drops the save and reloads.
  // If the archive went with it, the game would have no memory and the whole premise would be decoration.
  // CALL THE FUNCTION, NOT SOMETHING ADJACENT TO IT.
  //
  // The first version of this called clearSave(), which is only PART of what a trigger-reset does, and it passed
  // with the archive being wiped on purpose. Injecting the fault is what showed it: a check that does not run the
  // code it is about cannot fail, and a check that cannot fail is worse than none because it reads as coverage.
  //
  // startFreshAfterReset() calls location.reload(), which jsdom does not implement. That is caught here rather
  // than allowed to end the test, because the line before it is the one under test.
  const before = w.eval('loadArchive().length');
  try { w.eval('startFreshAfterReset()'); } catch (e) { /* jsdom may or may not implement reload */ }
  // NO CHECK ON THE RELOAD ITSELF, and the reason is worth keeping. I wrote one - `reloaded || true` first, which
  // cannot fail, and then `reloaded`, which FAILED, because jsdom implements location.reload() as a no-op rather
  // than throwing. So the check was testing jsdom, not the game, and it would have been wrong in both directions.
  // What is testable is what the function does to storage before it reloads, and that is the next two lines.
  check('the trigger-reset clears the save', w.eval("localStorage.getItem(slotKey())") === null);
  check('AND KEEPS THE ARCHIVE', w.eval('loadArchive().length') === before,
        before + ' before, ' + w.eval('loadArchive().length') + ' after');

  // The manual reset is meant to wipe it. It was three statements inline in the menu, so this could only check
  // the two operations side by side - not the path itself, which meant if either were reordered or dropped the
  // test would still pass. It is a named function now, so the test calls the thing the menu calls.
  w.eval('wipeEverything()');
  check('a manual reset wipes the archive', w.eval('loadArchive().length') === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
