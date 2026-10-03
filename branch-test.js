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

// THE OTHER HALF OF THE ACTION MODEL. The game is played two ways - choosing an option and TYPING text - and
// path-search.js only models the first. Twenty-one sites in index.html set `state.inputMode = 'text'`, and four
// scenes hang off them. That is why the search reports them unreached: not because a player cannot get there,
// but because the search cannot type.
const TYPED = [
  {
    what: 'answering Maren reaches wake004_maren_response',
    flags: { silent: true, silencePath: true },
    scene: 'wake004_ask_maren',
    set: `state.awaitingQuestion = true`,
    type: 'yes',
    expectScene: 'wake004_maren_response',
  },
  {
    what: 'confirming the transfer reaches wake004_transfer_confirmed',
    flags: { silent: true, silencePath: true },
    scene: 'wake004_choose_transfer',
    set: `state.awaitingConfirmation = true`,
    type: 'sure',
    expectScene: 'wake004_transfer_confirmed',
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

  for (const c of TYPED) {
    w.eval(`state.flags = ${JSON.stringify(c.flags)}; state.notes = []; state.wake = 4;`);
    w.eval(`goTo('${c.scene}')`);
    await sleep(400);
    w.eval(c.set);
    w.eval(`handleTextInput(${JSON.stringify(c.type)})`);
    await sleep(600);
    const at = w.eval('state.currentScene');
    check(`${c.what}   (typed "${c.type}", landed on ${at})`, at === c.expectScene);
  }

  // The transient scenes. They are reached DURING play and do not stay - `wake001_end` sets the next wake and
  // then runs the trigger scan - so a search that records the scene it is standing in never lists them, and
  // "never listed" is not "never entered".
  {
    w.eval(`state.flags = {}; state.notes = []; state.wake = 1;`);
    w.eval(`goTo('wake001_end')`);
    await sleep(500);
    const wake = w.eval('state.wake');
    check(`wake001_end is entered and advances to wake 2 (wake is now ${wake})`, wake === 2);
  }
  {
    // And the reset: it fires when the player's OWN notes contain a trigger word. That is typed input again -
    // the note is written by hand - which is the second thing the search cannot do.
    w.eval(`state.flags = {}; state.wake = 1;`);
    w.eval(`state.notes = [{ id: 'note_probe', tag: 'new', text: 'Project Resonance' }]`);
    w.eval(`goTo('wake001_end')`);
    await sleep(500);
    const at = w.eval('state.currentScene');
    check(`a note with a trigger word fires the reset (landed on ${at})`, at === 'wake_reset');
  }

  {
    // The transfer chain: confirming leads to a curation step, and typing anything there completes it.
    w.eval(`state.flags = { silent: true, silencePath: true }; state.notes = []; state.wake = 4;`);
    w.eval(`goTo('wake004_transfer_confirmed')`);
    await sleep(400);
    w.eval(`state.awaitingCuration = true`);
    w.eval(`handleTextInput('a few sentences')`);
    // ONE assertion, not two. `wake004_transfer_complete` is transient as well - it sets the ending and goes -
    // so "did we land on it" is a race with the timer, and the first version of this lost that race and reported
    // a failure for a chain that works. What matters is where the chain ENDS.
    await sleep(1200);
    const at = w.eval('state.currentScene');
    check(`curating the transfer leads to the continuity ending (landed on ${at})`, at === 'wake005_continuity');
  }
  for (const w0 of [2, 3]) {
    w.eval(`state.flags = {}; state.notes = []; state.wake = ${w0};`);
    w.eval(`goTo('wake00${w0}_end')`);
    await sleep(500);
    const wake = w.eval('state.wake');
    check(`wake00${w0}_end is entered and advances to wake ${w0 + 1} (wake is now ${wake})`, wake === w0 + 1);
  }

  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('ERROR: ' + e.message); process.exit(1); });
