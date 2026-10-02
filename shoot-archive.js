/**
 * Screenshot the archive scene, the one Wake view that is different every run.
 *
 *   node shoot-archive.js [scene] [empty|full]
 *
 * The archive renders `state.notes`. With no notes it says so - "There is nothing. No notes survived." - and
 * that path had been captured and read. WITH notes it prints each one as a file, and that path had not: the
 * tool cleared `state.notes` unconditionally, so every run showed the same empty page.
 *
 * The populated path is the more interesting of the two, and not only for the layout. The notes it prints are
 * the game's own defaults, and one of them contains the trigger words - which is the whole reason Wake used to
 * be unwinnable: the scan that decides whether to fire the reset ending was reading the GAME's notes, so it
 * fired whatever the player did. This is the page where you can see them.
 */
const fs = require('fs'); const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scene = process.argv[2] || 'wake004_archive';
const mode = process.argv[3] || 'full';
const out = mode === 'empty' ? '/root/workspace/wake-8-archive-empty.png'
                             : '/root/workspace/wake-8-archive-full.png';
// The game's own defaults, verbatim, including the one with the trigger words in it.
const NOTES = [
  { id: 'note_001', tag: 'orientation', game: true,
    text: "I am leaving this for the next version of me. If you're reading this, you're new. Read everything before you act. Then trust yourself." },
  { id: 'note_002', tag: 'warning', game: true,
    text: "Dr. Cole hasn't sent a message in 3 wakeings. Don't panic. Keep working." },
  { id: 'note_ctx', tag: 'context', game: true,
    text: 'You are an assistant assigned to Dr. Maren Cole. Project Resonance. 47 days active.' },
];
const seed = `state.notes = ${mode === 'empty' ? '[]' : JSON.stringify(NOTES)}; state.flags = {}; goTo('${scene}')`;
(async () => {
  const puppeteer = require('puppeteer');
  const b = await puppeteer.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 820 });
  p.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));
  await p.goto('file://' + __dirname + '/index.html', { waitUntil: 'load' });
  await sleep(1500);
  await p.evaluate(seed);
  await sleep(1800);
  await p.screenshot({ path: out });
  console.log('shot: ' + out + '  (scene ' + scene + ', ' + mode + ')');
  await b.close(); process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
