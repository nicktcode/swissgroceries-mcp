#!/usr/bin/env bash
set -euo pipefail
mkdir -p tests/fixtures/aldi

UA='ALDI iOS App CH 9.2614.1 8'

curl -s -A "$UA" -H 'Accept-Language: de_CH' \
  'https://api.aldi-suisse.ch/v3/product-search?q=milch&servicePoint=E172&serviceType=walk-in&offset=0&limit=16' \
  > tests/fixtures/aldi/search-milch.json

# Product detail: use a real SKU from the search results (not the original plan's placeholder)
curl -s -A "$UA" -H 'Accept-Language: de_CH' \
  'https://api.aldi-suisse.ch/v2/products/000000000000525709' \
  > tests/fixtures/aldi/product-detail.json

# Stores: real endpoint is /v2/service-points with lat=/lng= params (not /v3/stores)
curl -s -A "$UA" -H 'Accept-Language: de_CH' \
  'https://api.aldi-suisse.ch/v2/service-points?lat=47.376&lng=8.541&radius=10' \
  > tests/fixtures/aldi/stores.json

echo "Captured:"
wc -c tests/fixtures/aldi/*.json
