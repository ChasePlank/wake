#!/usr/bin/env node
/**
 * check-readme-runs.js - is every run the README quotes a run the tool can still produce?
 *
 *   node tools/check-readme-runs.js
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
  console.error('check-readme-runs: found no SEARCH verdicts in path-search.js - this check is reading nothing');
  process.exit(2);
}

// AND ONLY INSIDE FENCED BLOCKS, WHICH IS THE FIRST THING THIS GOT WRONG. The first version read every `SEARCH ...`
// in the file, so a SENTENCE THAT *NAMES* THE VERDICTS - which the paragraph above now does, in backticks - was read
// as a QUOTED RUN and reported stale. A MENTION IS NOT A QUOTE. Runs live in fences; prose does not.
const fenced = [...README.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(m => m[1]).join('\n');
const quoted = [];
for (const m of fenced.matchAll(/(SEARCH [A-Z]+[^\n]*)/g)) quoted.push(m[1].trim());
if (quoted.length === 0) {
  console.log('=== the README quotes no search verdicts ===');
  process.exit(0);
}

let bad = 0;
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

console.log('=== ' + forms.size + ' verdict(s) the tool can print, ' + quoted.length + ' quoted, ' + bad + ' stale ===');
process.exit(bad ? 1 : 0);
