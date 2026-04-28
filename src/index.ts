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
import { ToolError } from './tools/errors.js';
import { logger } from './util/log.js';

import { zodToJsonSchema } from 'zod-to-json-schema';

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
  {
    name: 'find_stores',
    description: [
      'Find grocery stores near a location, filtered by chain and search radius.',
      'Accepts a Swiss ZIP code, GPS coordinates, or a free-text address as the search center.',
      'Returns store name, address, chain, location, and opening hours where available.',
      'Use for "find a Migros near me", "which Coop branches are in 8001?", or before checking stock.',
    ].join(' '),
    schema: findStoresSchema,
    handler: findStoresHandler,
  },
  {
    name: 'search_products',
    description: [
      'Search for products across configured Swiss grocery chains (Migros, Coop, Aldi, Denner, Lidl) by keyword.',
      'Supports optional filters for price, size range, and product tags (organic, vegan, budget, etc.).',
      'Returns results grouped by chain with normalised price, unit price, size, and promotion info.',
      'Use for "find organic milk under 2 CHF", "compare pasta prices", or "search for gluten-free bread".',
    ].join(' '),
    schema: searchProductsSchema,
    handler: searchProductsHandler,
  },
  {
    name: 'get_product',
    description: [
      'Fetch full product details for a specific chain + product ID pair.',
      'Returns price, brand, size, unit price, tags, category, image URL, and active promotions.',
      'Obtain product IDs from search_products. Useful for drilling into a search result.',
      'Use for "get details for this Migros product" or "what is the unit price of this item?".',
    ].join(' '),
    schema: getProductSchema,
    handler: getProductHandler,
  },
  {
    name: 'get_promotions',
    description: [
      'List current promotional deals across configured Swiss grocery chains.',
      'Filter by chain, keyword, store ID, or how many days until the promotion expires.',
      'Returns promotion name, discount, validity dates, and applicable stores.',
      'Use for "what is on sale this week?", "any Migros deals on cheese?", or "promotions ending today".',
    ].join(' '),
    schema: getPromotionsSchema,
    handler: getPromotionsHandler,
  },
  {
    name: 'find_stock',
    description: [
      'Check which stores of a given chain have a specific product in stock.',
      'Optionally filter by proximity to GPS coordinates or query a single store by ID.',
      'Not all chains support per-store stock queries; unsupported chains return a clear error.',
      'Use for "is this product available near Zurich HB?", "which Coop has item X in stock?".',
    ].join(' '),
    schema: findStockSchema,
    handler: findStockHandler,
  },
  {
    name: 'plan_shopping',
    description: [
      'Plan a multi-store shopping trip near a location, picking the best products across configured Swiss grocery chains.',
      'Items can be generic ("milch", "pasta") or pinned to a specific SKU. Returns a primary plan plus alternatives.',
      'Use when the user gives a list of items and asks "where should I shop?" or "what\'s cheapest?".',
      'Strategies: single_store (one chain), split_cart (multi-chain with stop penalty), absolute_cheapest (no penalty).',
    ].join(' '),
    schema: planShoppingSchema,
    handler: planShoppingHandler,
  },
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
    try {
      const args = tool.schema.parse(req.params.arguments ?? {});
      const result = await (tool.handler as any)(registry, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      if (e instanceof ToolError) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({ error: e.code, message: e.message, hint: e.hint }, null, 2),
          }],
        };
      }
      throw e;
    }
  });

  return server;
}

async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('swissgroceries-mcp running on stdio');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);
    try {
      await server.close();
    } catch (e) {
      logger.info('Error during shutdown:', e);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { logger.info(e); process.exit(1); });
}
