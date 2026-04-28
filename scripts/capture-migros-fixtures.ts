// Run with: npx tsx scripts/capture-migros-fixtures.ts
// Saves real Migros API responses to tests/fixtures/migros/*.json
//
// NOTE: The wrapper exports { MigrosAPI, migrosApiPaths } — NOT a default export.
// Authentication requires api.account.oauth2.loginGuestToken() before any product calls.
// productSearch returns { productIds: number[], ... } (not product objects).
// getProductDetails expects { uids: string[], ... } and returns an object keyed by index ({"0": {...}, "1": {...}}).
import { writeFileSync, mkdirSync } from 'node:fs';
import { MigrosAPI } from 'migros-api-wrapper';

mkdirSync('tests/fixtures/migros', { recursive: true });

async function run() {
  const migros = new MigrosAPI();

  // Authenticate with a guest token (no credentials needed)
  console.log('Authenticating with guest token...');
  await migros.account.oauth2.loginGuestToken();
  console.log('  authenticated.');

  console.log('Capturing search-milch...');
  const search = await migros.products.productSearch.searchProduct({ query: 'milch', language: 'de' } as any);
  writeFileSync('tests/fixtures/migros/search-milch.json', JSON.stringify(search, null, 2));
  console.log('  saved. numberOfProducts:', (search as any).numberOfProducts);

  // search returns { productIds: number[], ... } — extract first few IDs
  const productIds: number[] = (search as any).productIds ?? [];
  const uids = productIds.slice(0, 3).map(String);

  if (uids.length > 0) {
    console.log('Capturing product-detail for uids', uids);
    // getProductDetails expects { uids: string[], language } and returns {"0": {...}, "1": {...}}
    const detail = await migros.products.productDisplay.getProductDetails({ uids, language: 'de' } as any);
    writeFileSync('tests/fixtures/migros/product-detail.json', JSON.stringify(detail, null, 2));
    console.log('  saved. Keys:', Object.keys(detail as any));
  } else {
    console.warn('  search returned no productIds; skipping product-detail');
  }

  console.log('Capturing stores...');
  // searchStores returns an array of store objects directly
  const stores = await migros.stores.searchStores({ query: 'Zürich' } as any);
  writeFileSync('tests/fixtures/migros/stores.json', JSON.stringify(stores, null, 2));
  console.log('  saved. count:', Array.isArray(stores) ? (stores as any[]).length : 'not array');

  console.log('Capturing promotions-milch...');
  // getProductPromotionSearch returns { items: [{id, type},...], numberOfItems, startDate, endDate }
  const promos = await migros.products.productDisplay.getProductPromotionSearch({ query: 'milch', language: 'de' } as any);
  writeFileSync('tests/fixtures/migros/promotions-milch.json', JSON.stringify(promos, null, 2));
  console.log('  saved. numberOfItems:', (promos as any).numberOfItems);
}

run().catch((e) => { console.error('Capture failed:', e); process.exit(1); });
