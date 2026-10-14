#!/usr/bin/env bash
#
# release.sh - every step of a Wake release except the one that publishes.
#
#   tools/release.sh 1.0.2
#
# WHY THIS EXISTS. `aside` has had a guarded release path for its game and now for its library; Wake was released
# three times BY HAND (v1.0, v1.0.1, and this one), and the second time is the signal this project keeps acting on:
# a process done twice by hand is a process that will be done wrong the third time. Every step here already had a
# guard somewhere - the suite, the mutation list, the artefact comparison - and the point is to RUN them in order
# and stop at the first failure.
#
# IT DOES NOT PUBLISH. Publishing is a decision, and a script that can publish is a script that can publish by
# accident. It prints the command instead.
set -u
cd "$(dirname "$0")/.." || exit 2

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo "usage: tools/release.sh <version>   e.g. 1.0.2" >&2; exit 2; }

ASSET="wake-$VERSION.html"
NOTES="docs/release-notes-$VERSION.md"

step() { printf '\n=== %s ===\n' "$1"; }
die()  { printf '\nSTOPPED: %s\n' "$1" >&2; exit 1; }

step "1/5  is there anything to release, and is the tree clean?"
if [ -n "$(git status --porcelain)" ]; then
  die "the working tree is dirty - commit first, so the release is a thing that exists"
fi
echo "  tree is clean at $(git rev-parse --short HEAD)"

step "2/5  the tests"
npm test 2>&1 | tail -6 || die "the tests failed"

step "3/5  the mutation list, which is the other half of the gate"
tools/mutations.sh 2>&1 | tail -3 || die "a mutation was not caught"

step "4/5  the asset, and is it actually different from the published one?"
# THE DOWNLOAD IS THE GAME: index.html is the declared range, and the release attaches a copy of it under the
# version's name, which is what the notes tell a reader to download.
cp index.html "$ASSET" || die "could not copy index.html to $ASSET"
# THE ARTEFACT COMPARISON LIVES IN THE ENGINE REPOSITORY, which is where the release note that needed it was
# written. Resolved rather than hardcoded: a checkout somewhere else should not need this file edited.
COMPARE="${COMPARE:-$(cd ../aside/tools 2>/dev/null && pwd)/artifact-changed.sh}"
[ -x "$COMPARE" ] || die "no artifact-changed.sh at $COMPARE - set COMPARE="
"$COMPARE" ChasePlank/wake "$ASSET" \
  || die "this is byte-identical to the published asset - there is nothing to release"

step "5/5  do the notes name the file that will be attached?"
[ -f "$NOTES" ] || die "no notes at $NOTES - write them before building anything"
if ! grep -q "$ASSET" "$NOTES"; then
  die "the notes do not name $ASSET, which is what this release attaches"
fi
echo "  the notes name $ASSET"

cat <<EOF

=== everything that can be checked here has passed ===

NOT VERIFIED: how it looks in a real browser. The four scripts run the game in jsdom.

TO PUBLISH, which is a decision and not a step:

  gh release create v$VERSION -R ChasePlank/wake \\
     --title "Wake $VERSION - <one line about this one>" \\
     --notes-file $NOTES \\
     $ASSET
EOF
