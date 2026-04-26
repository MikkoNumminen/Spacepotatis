#!/usr/bin/env bash
# Vercel ignoreCommand. Exit 0 to SKIP the build, exit 1 to PROCEED.
#
# We skip the build when every change in the deploy diff is documentation
# (any *.md anywhere), GitHub Actions config, local Claude tooling, or this
# script itself — none of those affect the runtime bundle.
#
# Vercel runs this at the repo root with the new commit checked out. The
# previous deploy SHA is in $VERCEL_GIT_PREVIOUS_SHA when known; first-time
# builds (no previous SHA) always proceed.
set -e

if [ -z "${VERCEL_GIT_PREVIOUS_SHA:-}" ]; then
  exit 1
fi

# `git diff --quiet` returns 0 when there's NO diff (after exclusions), 1 when
# there IS. We want to skip when nothing relevant changed, so a 0 here means
# "skip" — exactly the contract Vercel expects.
if git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA}" HEAD -- \
  ':(exclude)*.md' \
  ':(exclude)**/*.md' \
  ':(exclude).github/**' \
  ':(exclude).claude/**' \
  ':(exclude)scripts/vercel-ignore.sh'; then
  exit 0
fi
exit 1
