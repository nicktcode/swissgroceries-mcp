#!/usr/bin/env bash
set -euo pipefail
mkdir -p tests/fixtures/lidl

UA='LidlSocialInternacional/16.47.15 (com.lidl.eci.lidl.plus; build:1445; iOS 26.3.1) Alamofire/5.10.2'
HEADERS=(-A "$UA" -H 'Brand: Apple' -H 'App: com.lidl.eci.lidl.plus' -H 'Operating-System: iOS' -H 'Accept-Language: DE')

curl -s "${HEADERS[@]}" \
  'https://digital-leaflet.lidlplus.com/api/v1/CH/campaignGroups' \
  > tests/fixtures/lidl/campaignGroups.json

# Campaign IDs come from campaignGroups; 10091030 is "Dauerhaft günstiger"
curl -s "${HEADERS[@]}" \
  'https://digital-leaflet.lidlplus.com/api/v1/CH/campaigns/10091030' \
  > tests/fixtures/lidl/campaign-10091030.json

# Product detail uses compound id: campaignId_productId
curl -s "${HEADERS[@]}" \
  'https://digital-leaflet.lidlplus.com/api/v1/CH/products/10091030_10050172' \
  > tests/fixtures/lidl/product-detail.json

# Store detail: use v2/CH endpoint (schedule endpoint only returns hours, not address)
# The v2/CH endpoint returns all stores; we extract the one for CH0149
TODAY=$(date '+%Y-%m-%d')
curl -s "${HEADERS[@]}" \
  "https://stores.lidlplus.com/api/v2/CH?countryCode=CH&latitude=47.46&longitude=8.31&radius=2" \
  | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const s=j.find(s=>s.storeKey==='CH0149');
      if (s) { require('fs').writeFileSync('tests/fixtures/lidl/store-CH0149.json', JSON.stringify(s,null,2)); console.log('Saved CH0149'); }
      else { console.error('CH0149 not found'); process.exit(1); }
    })"
