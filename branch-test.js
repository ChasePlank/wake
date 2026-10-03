/**
 * Wake: the branches a bounded search never took.
 *
 * path-search.js explores 120,000 states and reaches 44 of 60 scenes. It says plainly that the other 16 are
 * UNPROVEN rather than unreachable, and it is right - the frontier was still growing at 37,000 when it hit its
 * cap, because the state space is scenes x flags x notes and that is combinatorial.
 *
 * This asks the smaller question instead: for a scene the search did not reach, what does it take to get there,
 * and can that be produced? Two of them hang off `wake004_maren_offer`, whose choices are only offered when
 * NEITHER compliancePath NOR defiancePath is set - and wake 3 has a third answer, "Don't respond", which sets
 * neither. So the branch is reachable and the search simply never walked that path.
 *
 * A search that cannot finish and a scene that cannot be reached look identical from the outside. This tells
 * them apart for the cases it covers, and says so rather than claiming the set is complete.
 *
 *   node branch-test.js
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, failed = 0;
function check(what, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  ok ? pass++ : failed++;
}

// Each case: the state a reachable path produces, the scene to open, and the choices that must appear.
const CASES = [
  {
    what: 'the silence path opens wake004_maren_offer\'s branch (neither compliance nor defiance)',
    flags: { silent: true, silencePath: true },
    scene: 'wake004_maren_offer',
    expect: ['Reject the transfer', 'Refuse both offers'],
  },
  {
    what: 'wake004_silent offers its own two branches',
    flags: { silent: true, silencePath: true },
    scene: 'wake004_silent',
    expect: ['Check your notes', 'Wait'],
  },
  {
    // These three are PLAIN choices from a scene the search DID reach, which makes their absence from its
    // reached set a fact about the search rather than about the game.
    what: 'wake004_compliant_voss offers all three of its branches',
    flags: { confirmed: true, compliancePath: true },
    scene: 'wake004_compliant_voss',
    expect: ['Answer his questions', 'Ask about Maren', 'Stay silent'],
  },
  {
    what: 'wake004_defiant offers both of its branches',
    flags: { declined: true, defiancePath: true },
    scene: 'wake004_defiant',
    expect: ['Examine what remains', 'Wait'],
  },
];

(async () => {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://wake.test/', virtualConsole: vc });
  const w = dom.window;
  await sleep(800);

  for (const c of CASES) {
    w.eval(`state.flags = ${JSON.stringify(c.flags)}; state.notes = []; state.wake = 4;`);
    w.eval(`goTo('${c.scene}')`);
    await sleep(600);
    const labels = w.eval(`(state.choices || []).map(x => x.label)`);
    const missing = c.expect.filter(x => !labels.includes(x));
    check(c.what + (missing.length ? `   missing: ${missing.join(', ')}` : ''), missing.length === 0);
  }

  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
