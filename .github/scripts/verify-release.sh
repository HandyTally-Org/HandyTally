#!/usr/bin/env bash
# HT-41: after a deploy, confirm the host really serves the expected build.
#
#   verify-release.sh https://demo.handytally.com master-3f2a1c9
#
# Reads <origin>/release.json (written by web/scripts/release-json.mjs) and
# compares its `version`. Retries for about two minutes because a fresh
# Worker version can take a few seconds to reach every edge. A bundle from
# before HT-41 has no release.json; the SPA fallback then answers with HTML,
# which is reported as "no release.json".
set -euo pipefail

origin="${1:?origin, e.g. https://prod.handytally.com}"
expected="${2:?expected version}"

for attempt in $(seq 1 12); do
  body="$(curl -sS --max-time 15 -H 'Cache-Control: no-cache' "$origin/release.json?check=$RANDOM" || true)"
  actual="$(printf '%s' "$body" | jq -r '.version // empty' 2>/dev/null || true)"
  if [ "$actual" = "$expected" ]; then
    echo "$origin runs $actual"
    exit 0
  fi
  echo "attempt $attempt: $origin reports '${actual:-no release.json}', want '$expected'; waiting 10s"
  sleep 10
done

echo "::error::$origin did not report $expected after two minutes"
exit 1
