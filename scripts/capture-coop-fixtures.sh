#!/usr/bin/env bash
set -euo pipefail
mkdir -p tests/fixtures/coop

UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

curl -s -A "$UA" -H 'Accept-Language: de-CH,de;q=0.9' \
  'https://www.coop.ch/rest/v2/coopathome/products/search/milch?currentPage=0&pageSize=20&query=availableOnline%3Afalse&language=de' \
  > tests/fixtures/coop/search-milch.json

curl -s -A "$UA" -H 'Accept-Language: de-CH,de;q=0.9' \
  'https://www.coop.ch/rest/v2/coopathome/products/4315895?language=de' \
  > tests/fixtures/coop/product-detail.json

curl -s -A "$UA" -H 'Accept-Language: de-CH,de;q=0.9' \
  'https://www.coop.ch/rest/v2/coopathome/locations/searchAroundCoordinates?longitude=8.541&latitude=47.376&currentPage=0&language=de' \
  > tests/fixtures/coop/stores.json

curl -s -A "$UA" -H 'Accept-Language: de-CH,de;q=0.9' \
  'https://www.coop.ch/rest/v2/coopathome/cms/content-teasers-aktionen?language=de' \
  > tests/fixtures/coop/promotions.json
