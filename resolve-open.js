const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(seed) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/',
    // BEFORE the page's own script runs, which is the whole point: the entry screen reads
    // storage at load, so seeding it afterwards can never reach it.
    beforeParse(window) { if (seed) for (const k of Object.keys(seed)) window.localStorage.setItem(k, seed[k]); },
  });
  await sleep(1300);
  return dom;
}

(async () => {
  // 1. play, and capture what a save actually looks like
  const d1 = await open();
  d1.window.goTo('wake001_open');
  await sleep(1400);
  for (let i = 0; i < 8; i++) { try { d1.window.handleChoice(0); } catch (e) { break; } await sleep(900); }
  d1.window.saveState();
  const seed = {};
  for (const k of Object.keys(d1.window.localStorage)) seed[k] = d1.window.localStorage.getItem(k);
  console.log('=== captured save keys ===');
  for (const k of Object.keys(seed)) console.log('   ' + k + ' = ' + seed[k].slice(0, 90));

  // 2. a fresh page, with that save present BEFORE its script runs
  const d2 = await open(seed);
  const t = d2.window.document.querySelector('#terminal').textContent || '';
  console.log('\n=== fresh page with the save pre-seeded ===');
  console.log('   ' + t.trim().split('\n')[0].slice(0, 100));
  const empty = /slot 1 \(empty\)/i.test(t);
  console.log('\nVERDICT: ' + (empty
    ? 'the slot still reads empty with the save present before load - NOT a harness timing problem.'
    : 'the slot sees the save. Last hour\'s reading was my harness setting storage too late.'));
  process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
