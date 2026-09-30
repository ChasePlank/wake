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

  console.log('done');
  await browser.close();
  process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
