#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { AdapterRegistry } from './adapters/registry.js';
import { MigrosAdapter } from './adapters/migros/index.js';
import { CoopAdapter } from './adapters/coop/index.js';
import { AldiAdapter } from './adapters/aldi/index.js';
import { DennerAdapter } from './adapters/denner/index.js';
import { LidlAdapter } from './adapters/lidl/index.js';

import { findStoresHandler, findStoresSchema } from './tools/find_stores.js';
import { searchProductsHandler, searchProductsSchema } from './tools/search_products.js';
import { getProductHandler, getProductSchema } from './tools/get_product.js';
import { getPromotionsHandler, getPromotionsSchema } from './tools/get_promotions.js';
import { findStockHandler, findStockSchema } from './tools/find_stock.js';
import { planShoppingHandler, planShoppingSchema } from './tools/plan_shopping.js';

import { z } from 'zod';

export function buildRegistry(): AdapterRegistry {
  const r = new AdapterRegistry();
  r.register(new MigrosAdapter());
  r.register(new CoopAdapter());
  r.register(new AldiAdapter());
  if (process.env.DENNER_JWT) r.register(new DennerAdapter());
  r.register(new LidlAdapter());
  return r;
}

const TOOLS = [
  { name: 'find_stores',     description: 'Find grocery stores near a location.', schema: findStoresSchema,     handler: findStoresHandler },
  { name: 'search_products', description: 'Search products across configured chains.', schema: searchProductsSchema, handler: searchProductsHandler },
  { name: 'get_product',     description: 'Get product details by chain+id.',     schema: getProductSchema,     handler: getProductHandler },
  { name: 'get_promotions',  description: 'List current promotions.',             schema: getPromotionsSchema,  handler: getPromotionsHandler },
  { name: 'find_stock',      description: 'Find stores with a product in stock.', schema: findStockSchema,      handler: findStockHandler },
  { name: 'plan_shopping',   description: 'Plan a shopping route across chains.', schema: planShoppingSchema,   handler: planShoppingHandler },
] as const;

export async function createServer(registry: AdapterRegistry = buildRegistry()) {
  const server = new Server(
    { name: 'swissgroceries-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    const args = tool.schema.parse(req.params.arguments ?? {});
    const result = await (tool.handler as any)(registry, args);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

// Minimal zod → JSON Schema converter for tool input descriptions.
// Permissive shape so the MCP loads. Replace with the `zod-to-json-schema`
// package before final v1 release for richer schemas.
function zodToJsonSchema(_schema: z.ZodTypeAny): Record<string, unknown> {
  return { type: 'object', properties: {}, additionalProperties: true };
}

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('swissgroceries-mcp running on stdio');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
