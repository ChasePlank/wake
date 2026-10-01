const fs = require('fs'); const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGE ERROR: ' + e.message));
  await p.goto('file://' + __dirname + '/index.html', { waitUntil: 'load' });
  await sleep(800);
  // start it the way a user would
  await p.mouse.click(50, 50);
  await sleep(300);
  console.log(await p.evaluate(`(() => {
    const c = Sound.ensure();
    if (!c) return 'NO CONTEXT';
    const out = { state: c.state, sampleRate: c.sampleRate, muted: Sound.muted };
    Sound.blip(); Sound.choice();
    return JSON.stringify(out);
  })()`));
  // and the reset path, which should also drop the hum
  console.log(await p.evaluate(`(() => { Sound.reset(); return 'reset ok, muted=' + Sound.muted; })()`));
  console.log(await p.evaluate(`(() => { const m = Sound.toggle(); return 'toggled, muted=' + m; })()`));
  await sleep(400);
  await b.close(); process.exit(0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
