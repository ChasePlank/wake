#!/usr/bin/env node
/**
 * check-readme-quotes.js - is every run the README quotes STILL what the tool prints?
 *
 *   node tools/check-readme-quotes.js
 *
 * WHY. The README quotes this project's own tools, and A QUOTED RUN IS A CLAIM NOBODY RE-RUNS. On 2026-10-16 the
 * `path-search.js` block was quoting `SEARCH INCOMPLETE: state cap of 120000 reached` with no CAP and no SECONDS
 * recorded - so nobody could run it again and get that. **The quote was not impossible, which is what I first
 * assumed from one run on this machine; reading the code showed the cap branch is perfectly alive, and the real
 * fault was that THE PARAMETERS WERE MISSING.** Both halves of that are the point: a quote needs its command to be
 * reproducible, AND a verdict has to be one the tool can actually emit.
 *
 * WHAT IT CHECKS: every `SEARCH ...` verdict quoted in the README is one of the verdicts `path-search.js` can print.
 * WHAT IT CANNOT SEE, said plainly rather than left implied: THE NUMBERS. `44 of 60` and the frontier width move
 * with the machine, because the search stops on a 240-second clock rather than a fixed amount of work - so this
 * cannot tell you a quoted number is still right, and no checker could. It catches a quote surviving the removal of
 * the verdict it names, which is the failure this project keeps finding: a document describing something the tree
 * no longer has.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'path-search.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

// The verdicts the tool can print, taken from the tool rather than listed here: each is the literal prefix of a
// template it emits. A list in this file would be the same fault as a list in the README.
const forms = new Set();
for (const m of SRC.matchAll(/`(SEARCH [A-Z ]+[^`$]*)/g)) forms.add(m[1].trim());
for (const m of SRC.matchAll(/'(SEARCH [A-Z ]+[^']*)'/g)) forms.add(m[1].trim());
if (forms.size === 0) {
  console.error('check-readme-quotes: found no SEARCH verdicts in path-search.js - this check is reading nothing');
  process.exit(2);
}

// AND ONLY INSIDE FENCED BLOCKS, WHICH IS THE FIRST THING THIS GOT WRONG. The first version read every `SEARCH ...`
// in the file, so a SENTENCE THAT *NAMES* THE VERDICTS - which the paragraph above now does, in backticks - was read
// as a QUOTED RUN and reported stale. A MENTION IS NOT A QUOTE. Runs live in fences; prose does not.
const fenced = [...README.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(m => m[1]).join('\n');
const quoted = [];
for (const m of fenced.matchAll(/(SEARCH [A-Z]+[^\n]*)/g)) quoted.push(m[1].trim());
// AND AN EMPTY HALF IS A FAILURE, NOT AN EXIT. THIS USED TO `process.exit(0)` HERE - written when the checker had
// only this one half - WHICH MADE THE TWO GUARDS ADDED BELOW IT UNREACHABLE: measured 2026-10-16, a README with no
// quoted blocks at all printed "the README quotes no search verdicts" AND EXITED 0, so the case the guards exist for
// was short-circuited by an earlier exit. A GUARD THAT CANNOT FIRE IS THE FAULT THIS FILE WAS WRITTEN TO CATCH,
// reproduced inside it. Each half now reports its own emptiness and the exit code follows.

let bad = 0;
if (quoted.length === 0) {
  console.error('  the README quotes no search verdicts - this half is reading nothing, which is not the same as passing');
  bad++;
}
for (const q of quoted) {
  // Match on the verdict's fixed prefix, because the quoted run fills in numbers: an emitted form starts with the
  // same words up to its first substitution.
  const ok = [...forms].some(f => {
    const fixed = f.split('${')[0].trim();
    return fixed.length > 0 && q.startsWith(fixed);
  });
  if (!ok) {
    console.error('  the README quotes "' + q.slice(0, 58) + '" and path-search.js cannot print it');
    bad++;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// AND TWO MORE SHAPES THE README QUOTES, BOTH MEASURED BY HAND THIS HOUR AND BOTH CORRECT - WHICH IS LUCK, NOT
// COVERAGE, BECAUSE NOTHING RE-RAN THEM: `11 passed, 0 failed` attributed to `branch-test.js`, and a mutation verdict
// from `tools/mutations.sh`. One is seconds to re-run and one is minutes, so they are checked differently:
//
//   * A QUOTED TEST COUNT IS RE-RUN AND COMPARED. The suite named in the prose above the block is executed and its
//     last line compared, so the quote is either current or this fails.
//   * A QUOTED MUTATION NAME IS CHECKED FOR EXISTENCE IN THE LIST, not re-run. `tools/mutations.sh` runs four jsdom
//     suites per mutation and the README says so itself - minutes, not seconds - so re-running it here would make
//     `npm test` the tax the README says it is not. The NAME is the fragile part: a mutation renamed in the list
//     leaves the README quoting something that no longer exists.
const { execFileSync } = require('child_process');
const suiteFor = /`([a-z-]+-test\.js)`[\s\S]{0,400}?```\n(\d+ passed, \d+ failed)/g;
let suiteQuotes = 0;
for (const m of README.matchAll(suiteFor)) {
  const file = m[1], claimed = m[2];
  let actual = '';
  try { actual = execFileSync(process.execPath, [path.join(ROOT, file)], { encoding: 'utf8' }).trim().split('\n').pop().trim(); }
  catch (e) { actual = '(it did not run)'; }
  suiteQuotes++;
  if (actual !== claimed) {
    console.error('  the README quotes "' + claimed + '" for ' + file + ' and it prints "' + actual + '"');
    bad++;
  }
}
if (suiteQuotes === 0) {
  console.error('  found no quoted test counts - this half is reading nothing, which is not the same as passing');
  bad++;
}

const muts = fs.readFileSync(path.join(ROOT, 'tools/mutations.sh'), 'utf8');
let mutQuotes = 0;
for (const m of README.matchAll(/^\s{2}([a-z][^\n]{6,60}?)\s{2,}(caught|not caught)\s*$/gm)) {
  mutQuotes++;
  if (!muts.includes(m[1].trim())) {
    console.error('  the README quotes the mutation "' + m[1].trim() + '" and the list no longer has it');
    bad++;
  }
}
if (mutQuotes === 0) {
  console.error('  found no quoted mutation verdicts - this half is reading nothing either');
  bad++;
}

console.log('=== ' + forms.size + ' verdict(s) the tool can print, ' + quoted.length + ' quoted, '
  + suiteQuotes + ' suite quote(s) re-run, ' + mutQuotes + ' mutation quote(s) checked, ' + bad + ' stale ===');
process.exit(bad ? 1 : 0);
