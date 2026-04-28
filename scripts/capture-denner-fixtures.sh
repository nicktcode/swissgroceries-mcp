#!/usr/bin/env bash
set -euo pipefail
mkdir -p tests/fixtures/denner

if [ -z "${DENNER_JWT:-}" ]; then
  echo "DENNER_JWT not set; skipping live capture"
  exit 0
fi

UA='ch.denner.mobile.Denner/6.1.00+ios/26.3.1'

curl -s -H "Authorization: Bearer $DENNER_JWT" -A "$UA" -H 'Accept-Language: de' \
  'https://app-api.denner.ch/api/m/content/v2?v=0' \
  > tests/fixtures/denner/content-full.json

curl -s -H "Authorization: Bearer $DENNER_JWT" -A "$UA" -H 'Accept-Language: de' \
  'https://app-api.denner.ch/api/m/stores' \
  > tests/fixtures/denner/stores.json
