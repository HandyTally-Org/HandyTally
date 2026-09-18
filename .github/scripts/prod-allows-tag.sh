#!/usr/bin/env bash
# HT-41: a customer never runs a build newer than prod.handytally.com.
#
#   prod-allows-tag.sh v1.5.0 [https://prod.handytally.com]
#
# Exits non-zero when <tag> sorts after the version prod reports. Equal is
# fine (the normal case: promote what prod runs) and older is fine (a
# rollback). When prod has no release.json yet, only a warning is printed:
# the very first tagged release lands on a prod that predates HT-41.
set -euo pipefail

tag="${1:?release tag}"
prod_origin="${2:-https://prod.handytally.com}"

if ! [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::'$tag' is not a release tag (expected vMAJOR.MINOR.PATCH)"
  exit 1
fi

prod="$(curl -sS --max-time 15 "$prod_origin/release.json?check=$RANDOM" | jq -r '.version // empty' 2>/dev/null || true)"
if [ -z "$prod" ]; then
  echo "::warning::$prod_origin has no release.json; cannot compare $tag against prod"
  exit 0
fi

if [ "$prod" = "$tag" ]; then
  echo "prod runs $prod; promoting the same build"
  exit 0
fi

newest="$(printf '%s\n%s\n' "$prod" "$tag" | sort -V | tail -n 1)"
if [ "$newest" = "$tag" ]; then
  echo "::error::$tag is newer than prod ($prod). Push the tag first so prod runs it, or tick 'skip_prod_check' for an emergency."
  exit 1
fi

echo "prod runs $prod; $tag is older (rollback)"
