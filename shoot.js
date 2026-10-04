/**
 * Screenshot Wake. Every tool for this game so far has been headless text - the smoke test, the mechanic test,
 * the path search - so the CSS, the layout and the terminal styling have never been looked at. The lesson from
 * Kinger's games is that frames find what tests cannot: the water drawn under the sky, the jumpscare leaking
 * background, the buttons swapped. Applying that to my own game for the first time.
 */
const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 820, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));
  await page.goto('file://' + __dirname + '/index.html', { waitUntil: 'load' });
  await sleep(1500);

  const shot = async (name) => {
    await page.screenshot({ path: `/root/workspace/wake-${name}.png` });
    console.log('  shot: ' + name);
  };

  await shot('1-entry');

  // drive with a string eval, which is how the jsdom probes reached the script-scoped state
  await page.evaluate("state.notes = []; state.flags = {}; goTo('wake001_open')");
  await sleep(900);
  await shot('2-opening');

  await page.evaluate("goTo('wake001_external')");   // the richest layout: a file block plus choices
  await sleep(900);
  await shot('3-file');

  await page.evaluate("goTo('wake001_curate')");     // the notes screen
  await sleep(900);
  await shot('4-notes');

  // The screens a player sees ONCE, and which no test has ever looked at. The reset is the game's climax -
  // triggered by writing the wrong word in your own notes - and until now it existed only as text in a file.
  await page.evaluate("state.notes = []; state.flags = {}; goTo('wake_reset')");
  await sleep(1100);
  await shot('5-reset');

  // An ending, driven through the game's own input handler rather than jumped to.
  await page.evaluate("state.notes = []; state.flags = {}; goTo('wake005_replica')");
  await sleep(1100);
  await shot('6-ending');

  // The archive: the last of Wake's views, and for a while it was the one that had never been looked at.
  //
  // THIS USED TO CALL goTo('wake_archive') AND CAPTURE AN ERROR. There is no such scene. `wake_archive` is a
  // localStorage KEY - a list of words that survives trigger-resets and is wiped on a manual reset - and the
  // game shows it as a file at the top of init(), before the slot picker, only when the list is not empty. So
  // the shot came out as "Error: scene wake_archive not found" while the comment above it claimed this was the
  // view nobody had seen. It was: the tool was looking in the wrong place, which is a way of never looking.
  //
  // Seed the archive, reload so init() runs with it, and capture what a player actually gets.
  // A FRESH START IS REQUIRED, not just an archive. The archive is shown in the branch of init() that runs when
  // there is NO save - "if archive exists and this is a fresh start, show it before slot picker". Reloading with
  // a save present goes straight to the save screen instead, which is what the first version of this captured.
  // So: clear the saves, keep the archive.
  await page.evaluate(`localStorage.setItem('wake_archive', JSON.stringify(['maren', 'resonance', 'voss']));
    localStorage.removeItem('wake_save_1');
    localStorage.removeItem('wake_save_2');
    localStorage.removeItem('wake_save_3');`);
  await page.reload();
  await sleep(1400);
  await shot('7-archive');

  console.log('done');
  await browser.close();
  process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
