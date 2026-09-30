const fs = require('fs'); const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/' });
  const w = dom.window;
  await sleep(1200);
  // the archive is words learned by dying, kept in localStorage; seed it so there is something to render
  w.localStorage.setItem('wake_archive', JSON.stringify(['trust', 'hold the golden circle', 'you are not the first']));
  w.eval(`state.notes = []; state.flags = {}; goTo('${process.argv[2]}')`);
  await sleep(1200);
  const puppeteer = require('puppeteer');
  const b = await puppeteer.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 820 });
  await p.goto('file://' + __dirname + '/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(`localStorage.setItem('wake_archive', JSON.stringify(['trust','hold the golden circle','you are not the first']))`);
  await p.evaluate(`state.notes = []; state.flags = {}; goTo('${process.argv[2]}')`);
  await sleep(1200);
  await p.screenshot({ path: '/root/workspace/wake-8-archive.png' });
  console.log('shot: 8-archive  (scene ' + process.argv[2] + ')');
  await b.close(); process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
