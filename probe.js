const fs = require('fs'); const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://wake.test/' });
  const w = dom.window, doc = w.document;
  await sleep(1500);
  const text = () => doc.querySelector('#terminal').textContent || '';
  const lis = () => doc.querySelectorAll('#terminal li').length;

  console.log('after load:                li=' + lis() + '  scene state=' + w.eval('state && state.currentScene'));
  w.goTo('wake001_open');
  await sleep(2500);
  console.log('after goTo(wake001_open):  li=' + lis() + '  scene=' + w.eval('state.currentScene'));
  console.log('  text: ' + text().trim().slice(0, 60).replace(/\s+/g, ' '));

  for (let step = 1; step <= 8; step++) {
    const before = w.eval('state.currentScene');
    try { w.handleChoice(0); } catch (e) { console.log('  handleChoice threw: ' + e.message); }
    await sleep(1500);
    const after = w.eval('state.currentScene');
    console.log(`step ${step}: ${before} -> ${after}   li=${lis()}`);
    if (before === after && lis() === 0) { console.log('  (no movement and no choices: ' + text().trim().slice(-70).replace(/\s+/g, ' ') + ')'); break; }
  }
  process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
