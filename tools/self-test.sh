#!/usr/bin/env bash
#
# self-test.sh - break each half of check-readme-quotes.js and require it to notice.
#
#   tools/self-test.sh
#
# WHY. The checker has four ways to fail - a quoted verdict the tool cannot print, a quoted test count that no longer
# matches, a quoted mutation the list no longer has, and any half that reads nothing - and UNTIL NOW EVERY ONE OF THEM
# HAD BEEN INJECTED BY HAND, ONCE. Hand-injection is not coverage: it proves the branch worked on the afternoon
# somebody tried it.
#
# AND IT IS NOT HYPOTHETICAL. An hour after the checker was written it HAD A DEAD GUARD: an early `process.exit(0)`
# for the empty case, written before the later guards existed, made them unreachable - so a README that quoted nothing
# at all printed "the README quotes no search verdicts" AND EXITED 0. A GUARD THAT CANNOT FIRE IS THE FAULT THIS
# PROJECT KEEPS FINDING, and it was reproduced inside the checker built to catch it. This script is what would have
# found it in the gate rather than by luck.
#
# EACH INJECTION RESTORES BEFORE THE NEXT, and the whole file restores from a trap, so a failure leaves the tree as it
# found it.
set -u
cd "$(dirname "$0")/.." || exit 2

CHECK="tools/check-readme-quotes.js"
[ -f "$CHECK" ] || { echo "self-test: no $CHECK" >&2; exit 2; }
[ -f README.md ] || { echo "self-test: no README.md" >&2; exit 2; }

BAK=$(mktemp)
cp README.md "$BAK"
trap 'cp "$BAK" README.md; rm -f "$BAK"' EXIT

pass=0; fail=0
expect() { # expect <name> <substring the failure must mention>
  out=$(node "$CHECK" 2>&1); rc=$?
  if [ $rc -ne 0 ] && grep -qF "$2" <<<"$out"; then
    printf '  ok   %s\n' "$1"; pass=$((pass + 1))
  else
    printf '  FAIL %s\n       rc=%s, and nothing matching "%s"\n' "$1" "$rc" "$2"; fail=$((fail + 1))
  fi
  cp "$BAK" README.md
}

echo "=== check-readme-quotes.js, four ways to fail ==="

python3 - <<'PY'
import io
p = 'README.md'; s = io.open(p, encoding='utf-8').read()
io.open(p, 'w', encoding='utf-8').write(s.replace('SEARCH INCOMPLETE (deadline (240s)):', 'SEARCH ABANDONED (deadline (240s)):', 1))
PY
expect "notices a quoted verdict the tool cannot print" "cannot print it"

python3 - <<'PY'
import io
p = 'README.md'; s = io.open(p, encoding='utf-8').read()
io.open(p, 'w', encoding='utf-8').write(s.replace('11 passed, 0 failed', '12 passed, 0 failed', 1))
PY
expect "notices a quoted test count that no longer matches" "and it prints"

python3 - <<'PY'
import io
p = 'README.md'; s = io.open(p, encoding='utf-8').read()
old = 'archive: the same word twice is two words'
assert old in s, 'the mutation quoted in the README is gone - fix this entry rather than letting it pass'
io.open(p, 'w', encoding='utf-8').write(s.replace(old, 'archive: a mutation that was renamed', 1))
PY
expect "notices a quoted mutation the list no longer has" "the list no longer has it"

printf '# Wake\n\nNo quoted blocks at all.\n' > README.md
expect "refuses to pass when it is reading nothing" "reading nothing"

cp "$BAK" README.md
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
