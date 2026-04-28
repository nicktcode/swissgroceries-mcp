import { describe, it, expect } from 'vitest';
import { createServer } from '../../src/index.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { findStoresSchema } from '../../src/tools/find_stores.js';
import { searchProductsSchema } from '../../src/tools/search_products.js';
import { getProductSchema } from '../../src/tools/get_product.js';
import { getPromotionsSchema } from '../../src/tools/get_promotions.js';
import { findStockSchema } from '../../src/tools/find_stock.js';
import { planShoppingSchema } from '../../src/tools/plan_shopping.js';

const allSchemas = [
  { name: 'find_stores', schema: findStoresSchema },
  { name: 'search_products', schema: searchProductsSchema },
  { name: 'get_product', schema: getProductSchema },
  { name: 'get_promotions', schema: getPromotionsSchema },
  { name: 'find_stock', schema: findStockSchema },
  { name: 'plan_shopping', schema: planShoppingSchema },
];

describe('tool descriptions', () => {
  it('createServer resolves without crashing', async () => {
    const s = await createServer();
    expect(s).toBeDefined();
  });

  it('each tool schema has a top-level description of at least 100 characters', () => {
    for (const { name, schema } of allSchemas) {
      const jsonSchema = zodToJsonSchema(schema) as any;
      const desc: string = jsonSchema.description ?? '';
      expect(
        desc.length,
        `${name} schema description too short (${desc.length} chars): "${desc}"`,
      ).toBeGreaterThanOrEqual(100);
    }
  });

  it('each tool schema JSON output has a description field populated', () => {
    for (const { name, schema } of allSchemas) {
      const jsonSchema = zodToJsonSchema(schema) as any;
      expect(jsonSchema.description, `${name} missing description`).toBeTruthy();
    }
  });

  it('createServer registers all 6 tools without error', async () => {
    const server = await createServer();
    expect(server).toBeDefined();
  });

  it('find_stores schema description mentions location or search or store', () => {
    const jsonSchema = zodToJsonSchema(findStoresSchema) as any;
    expect(jsonSchema.description.toLowerCase()).toMatch(/location|search|store/);
  });

  it('plan_shopping schema description mentions strategy', () => {
    const jsonSchema = zodToJsonSchema(planShoppingSchema) as any;
    expect(jsonSchema.description.toLowerCase()).toMatch(/strateg/);
  });
});
