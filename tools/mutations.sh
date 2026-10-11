#!/usr/bin/env bash
#
# Break one invariant at a time and ask the tests whether they notice.
#
#   tools/mutations.sh            run them all
#   tools/mutations.sh archive    only those whose label matches
#   tools/mutations.sh --list     show them without running anything
#
# WHY. A check that has never been seen to fail is unverified, and this game's checks had never been asked. The
# sibling project spent a week learning this one at a time - a suite that passed while its code was broken, a check
# comparing a measurement to the constant that defined it, two constants that 636 checks could not see at all, and a
# landing-sound rate limit that gated the log line instead of the queue. The lesson it kept arriving at is that the
# discipline has to be a LIST rather than a habit, because a habit does not survive the session that had it.
#
# The file this game is made of is one 2,300-line index.html with no build step, which is why every mutation below is
# a single-line replacement in one file.
#
# A RESULT OF "NOT CAUGHT" IS THE POINT, not a failure of this script: it means an invariant the README claims is one
# no test holds. "ANCHOR MISSING" is a different thing and also a problem - the mutation never applied, which reads
# exactly like a test that cannot see it.
#
# NOT PART OF `npm test`, deliberately: five mutations are five full runs of four jsdom suites, which is minutes
# rather than seconds. An audit to run when adding a check, not a tax on every commit.
set -u
cd "$(dirname "$0")/.." || exit 2

# label | file | anchor | replacement
MUTATIONS=(
  # THE OTHER HALF OF THE GAME. The five entries above are all about the archive - the memory you leave behind -
  # and nothing here touched the save, the settings or the story rendering. These do.
  "the save writes nothing|index.html|localStorage.setItem(slotKey(), JSON.stringify(state));|void 0;|"
  "the save never loads|index.html|const saved = localStorage.getItem(slotKey());|const saved = null;|"
  "the mute never persists|index.html|localStorage.setItem('wake_muted', muted ? '1' : '0');|void 0;|"
  # A BACKTICK IN A DOUBLE-QUOTED BASH ARRAY IS A COMMAND SUBSTITUTION, which broke this list the first time it
  # was written - the third shell metacharacter to do that in one week, after a literal \n and a stray pipe.
  "the first waking does not render|index.html|typeOut(\`<div class=\"file-narrator\">WAKE 001</div>\`);|typeOut(\`\`);|"
  "archive: the same word twice is two words|index.html|if (!words.includes(word)) { words.push(word); saveArchive(words); }|if (true) { words.push(word); saveArchive(words); }"
  "archive: nothing is ever written|index.html|try { localStorage.setItem('wake_archive', JSON.stringify(words)); } catch(e) {}|try { } catch(e) {}"
  "archive: the archive never loads|index.html|try { return JSON.parse(localStorage.getItem('wake_archive')) || []; } catch(e) { return []; }|try { return []; } catch(e) { return []; }"
  # ONE LINE PER ENTRY, which the sibling project's list had to learn too: a multi-line anchor in a bash array is a
  # literal backslash-n, not a newline, so the mutation silently never applies and reports as "no test notices it" -
  # which is the worst possible false signal from a tool whose job is finding those.
  "reset: a manual reset keeps the archive|index.html|  localStorage.removeItem('wake_archive');|  void 0;"
  "reset: the trigger reset wipes the archive|index.html|function startFreshAfterReset() {\n  // Trigger-reset: the hidden archive survives. The save does not.\n  localStorage.removeItem(slotKey());|function startFreshAfterReset() {\n  localStorage.removeItem('wake_archive');\n  localStorage.removeItem(slotKey());"
)

if [ "${1:-}" = "--list" ]; then
  for m in "${MUTATIONS[@]}"; do echo "  ${m%%|*}"; done
  exit 0
fi

# THE TREE HAS TO BE CLEAN BEFORE THIS RUNS AND CLEAN WHEN IT FINISHES, the same two guards the other two lists
# have and for the same reason: a trap restores on a clean exit, and NOTHING restores on a SIGKILL. Two interrupted
# runs in the release's list left four mutated files in its tree in one hour, and `git status` was the only thing
# that said so.
if [ -n "$(git status --porcelain -- index.html)" ]; then
  echo "mutations: index.html is already modified - commit or discard first, so a leftover from this run can be told" >&2
  echo "           apart from a change that was already here." >&2
  exit 2
fi

filter="${1:-}"
caught=0; missed=0; broken=0
for m in "${MUTATIONS[@]}"; do
  label="${m%%|*}"; rest="${m#*|}"
  file="${rest%%|*}"; rest="${rest#*|}"
  anchor="${rest%%|*}"; repl="${rest##*|}"
  if [ -n "$filter" ] && [[ "$label" != *"$filter"* ]]; then continue; fi
  printf '  %-46s ' "$label"
  BAK="$(mktemp)"; cp "$file" "$BAK"
  trap 'cp "$BAK" "$file" 2>/dev/null; rm -f "$BAK"' EXIT
  # \n IN AN ENTRY MEANS A NEWLINE. A bash array cannot hold one literally, and the sibling project's list carries
  # a note about that - so this converts it instead, which is one less thing to remember when writing an entry.
  ANCHOR="$(printf '%b' "$anchor")" REPL="$(printf '%b' "$repl")" FILE="$file" node -e '
    const fs = require("fs");
    const p = process.env.FILE, a = process.env.ANCHOR, r = process.env.REPL;
    const s = fs.readFileSync(p, "utf8");
    const n = s.split(a).length - 1;
    if (n === 0) process.exit(3);
    // MORE THAN ONE MATCH IS REFUSED, NOT RESOLVED. An anchor that fits two places mutates whichever comes first,
    // and a mutation that changes nothing observable reports identically to one no test covers: on 10 October the
    // trigger-reset entry landed in clearSave() instead, where wiping the archive is harmless because the only
    // caller wipes it anyway, and the tool said "NOT CAUGHT - no test covers this" about a claim that IS covered.
    // That is the third way this script can lie, after "the anchor never applied" and "the test was not run".
    if (n > 1) process.exit(4);
    fs.writeFileSync(p, s.replace(a, r));
  ' 2>/dev/null; rc=$?
  if [ "$rc" -eq 3 ] || [ "$rc" -eq 4 ]; then
    if [ "$rc" -eq 4 ]; then
      printf 'AMBIGUOUS ANCHOR - it fits more than one place, so this proves nothing\n'
    else
      printf 'ANCHOR MISSING - the mutation never applied, so this proves nothing\n'
    fi
    broken=$((broken + 1)); cp "$BAK" "$file"; rm -f "$BAK"; continue
  fi
  if timeout 600 npm test >/tmp/wake-mutation.log 2>&1; then
    printf 'NOT CAUGHT - no test covers this\n'
    missed=$((missed + 1))
  else
    printf 'caught\n'
    caught=$((caught + 1))
  fi
  cp "$BAK" "$file"; rm -f "$BAK"
done

if [ -n "$(git status --porcelain -- index.html)" ]; then
  echo "  THIS RUN LEFT index.html MODIFIED - a restore did not happen:" >&2
  git status --porcelain -- index.html >&2
  broken=$((broken + 1))
fi

echo
echo "  caught: $caught   not caught: $missed   never applied or ambiguous: $broken"
if [ "$missed" -eq 0 ] && [ "$broken" -eq 0 ]; then
  echo "  OK every invariant listed here is one the tests would notice breaking"
  exit 0
fi
echo "  A mutation nobody notices is a claim nobody is checking."
exit 1
