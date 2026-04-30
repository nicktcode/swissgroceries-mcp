// MCP Prompts: pre-canned conversation starters that show clients the
// canonical workflows of this server. Each prompt produces a single user
// message with arguments interpolated; the client / LLM then invokes the
// underlying tools as needed to fulfil the request.

export interface PromptArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface PromptDef {
  name: string;
  description: string;
  arguments: PromptArg[];
  build(args: Record<string, string | undefined>): string;
}

function nonEmpty(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
}

export const PROMPTS: PromptDef[] = [
  {
    name: 'weekly_deals_digest',
    description: 'Summarise this week\'s best grocery deals across all configured Swiss chains, optionally filtered by category, chain, or location. Lists the top discounts by % off and absolute saving, calling out Swiss household staples (laundry, dairy, drinks) when relevant.',
    arguments: [
      { name: 'category', description: 'Optional product category or keyword to focus on (e.g. "wine", "laundry", "baby", "cheese"). If omitted, surveys all categories.' },
      { name: 'chains', description: 'Optional comma-separated chain list (e.g. "migros,coop,ottos"). Defaults to all chains.' },
      { name: 'near', description: 'Optional Swiss ZIP or city to weight results geographically (e.g. "5430" or "Wettingen").' },
    ],
    build(a) {
      const category = nonEmpty(a.category);
      const chains = nonEmpty(a.chains);
      const near = nonEmpty(a.near);

      const lines = [
        'Use the `get_promotions` tool to pull current promotional deals across the configured Swiss grocery chains.',
        chains
          ? `Restrict the query to these chains: ${chains}.`
          : 'Survey all configured chains (Migros, Coop, Aldi, Denner, Lidl, Farmy, Volgshop, Otto\'s).',
        category
          ? `Focus on the "${category}" category — pass it as the \`query\` parameter to filter promotions, and ignore unrelated hits.`
          : 'Cover food, drugstore, drinks, and household categories.',
        '',
        'Then produce a digest with these sections:',
        '1. **Headline deals** — the top 5 by % off, where each item shows: chain, product name, current price, was-price, percentage discount, and per-kg/per-l unit price when available.',
        '2. **Biggest absolute savings** — the top 5 by CHF saved (regular minus current).',
        '3. **Pantry staples worth stockpiling** — call out any laundry detergent, toothpaste, soft drinks, wine, pasta/rice, or canned goods at >40% off, since these store well.',
        near ? `4. **Near ${near}** — for chains that support \`find_stock\`, briefly note whether headline items are likely in stock at the closest store. Use \`find_stores\` with the user's location first to identify the nearest branches.` : '',
        '',
        'Format prices as "CHF 1.95" (no decimals stripped). Skip generic items where the discount is < 20% — they are not worth highlighting.',
      ].filter(Boolean);

      return lines.join('\n');
    },
  },
  {
    name: 'compare_basket_across_chains',
    description: 'Compare the cost of a shopping basket across all configured Swiss grocery chains and recommend where to shop. Returns a per-chain total, identifies which chain is cheapest for each item, and produces a multi-store split-cart plan if it materially beats single-store shopping.',
    arguments: [
      { name: 'items', description: 'Required. Comma-separated list of items with optional quantities (e.g. "milk 2L, bananas 1kg, brot, eggs 12, butter 250g"). German, French, Italian, or English keywords all work — chains accept different languages.', required: true },
      { name: 'near', description: 'Optional Swiss ZIP, city, or address to factor in store proximity (e.g. "8001" or "Bahnhofstrasse 1, Zürich"). Without it, the comparison is price-only.' },
      { name: 'preferred_chain', description: 'Optional chain whose price the others should be benchmarked against (e.g. "migros"). Defaults to no benchmark.' },
    ],
    build(a) {
      const items = nonEmpty(a.items);
      const near = nonEmpty(a.near);
      const preferred = nonEmpty(a.preferred_chain);

      const itemList = items
        ? items.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const lines = [
        items
          ? `Compare prices for this basket across all configured Swiss grocery chains: ${itemList.map((i) => `"${i}"`).join(', ')}.`
          : 'Compare prices for the basket the user described across all configured Swiss grocery chains.',
        '',
        'Use `plan_shopping` as the primary tool — pass the items as a list, and run all three strategies:',
        '- `single_store` — cheapest single-chain trip',
        '- `split_cart` — cheapest multi-chain trip with a small per-stop time penalty',
        '- `absolute_cheapest` — multi-chain trip with no penalty (theoretical floor)',
        '',
        near
          ? `Set \`near\` to "${near}". If the user wants stock validation, call \`find_stock\` for each pinned SKU after the plan is built.`
          : 'Without a location, skip the geographic check and treat all chains equally.',
        '',
        'In the response:',
        '1. Show a **per-chain total** if the basket were bought entirely at that chain (single_store strategy output).',
        '2. List **item-by-item winners** — for each basket item, which chain has the cheapest match, with unit price.',
        preferred
          ? `3. Benchmark every alternative against ${preferred}. Express savings as "vs ${preferred}: -CHF X.XX (-Y%)". Mark items where ${preferred} is cheapest as "✓ ${preferred} wins".`
          : '3. Highlight which chain wins overall and by how much (CHF and %).',
        '4. **Split-cart recommendation**: if the split_cart total is more than CHF 5 cheaper than single_store, recommend it and list which stops are needed. Otherwise note that single_store is the better trade-off.',
        '5. **Caveats**: flag any items where no exact match was found, where only a generic substitute is available, or where the cheapest match is only available in bulk (e.g. multipacks).',
        '',
        'Always show CHF prices with two decimals. Use the unit price (CHF/kg, CHF/l) when sizes differ — comparing a 500 g and a 1 kg pack on raw price alone is misleading.',
      ];

      return lines.join('\n');
    },
  },
  {
    name: 'cheapest_recipe_ingredients',
    description: 'Given a recipe (list of ingredients with quantities, or a recipe URL), find the cheapest place to buy each ingredient across all configured Swiss grocery chains and produce a consolidated shopping plan.',
    arguments: [
      { name: 'ingredients', description: 'Required if no `recipe_url`. Newline-, comma-, or semicolon-separated ingredient list with quantities (e.g. "500g pasta\\n200g parmesan\\n2 eggs\\n100ml milk").' },
      { name: 'recipe_url', description: 'Optional URL of a recipe page to fetch and parse. If provided, extract the ingredient list from the page first.' },
      { name: 'servings', description: 'Optional number of servings to scale to. If the recipe is for 4 and you want 6, pass "6" here.' },
      { name: 'near', description: 'Optional Swiss ZIP or address. When provided, the plan also factors in store proximity (split_cart strategy).' },
    ],
    build(a) {
      const ingredients = nonEmpty(a.ingredients);
      const recipe_url = nonEmpty(a.recipe_url);
      const servings = nonEmpty(a.servings);
      const near = nonEmpty(a.near);

      const lines = [
        recipe_url
          ? `Fetch the recipe at ${recipe_url} and extract the ingredient list.`
          : ingredients
          ? `Use this ingredient list: ${ingredients.replace(/\n/g, '; ')}`
          : 'Ask the user for the ingredient list (or a recipe URL) before proceeding.',
        servings ? `Scale the quantities to ${servings} servings before searching.` : '',
        '',
        'For each ingredient:',
        '1. Search for it via `search_products` across all configured chains.',
        '2. Match the cheapest exact-or-equivalent product, using **unit price** (CHF/kg or CHF/l) for comparisons across different pack sizes.',
        '3. If a quantity (e.g. "500g pasta") is given but only a 1 kg pack exists, note that the user will buy more than the recipe needs and adjust the cost share accordingly.',
        '',
        'Then build a single shopping plan with `plan_shopping`:',
        '- Pass each ingredient as an item with its scaled quantity.',
        near ? `- Set \`near\` to "${near}" so the planner respects store proximity.` : '- Run without location; price-only optimisation.',
        '- Try both `single_store` and `split_cart` strategies. Pick whichever is cheaper after factoring stop count.',
        '',
        'Output:',
        '- **Per-ingredient table**: ingredient | quantity needed | cheapest chain | exact product | size | price | unit price',
        '- **Total recipe cost** (and per-serving cost if servings were given)',
        '- **Recommended trip**: which store(s) to visit and what to buy at each',
        '- **Pantry leftover note**: ingredients where you must buy more than needed (and roughly how much will be left over for next time)',
        '',
        'Be conservative on substitutions — flag a "no exact match" rather than picking a similar-sounding wrong product (e.g. don\'t substitute mascarpone for ricotta).',
      ].filter(Boolean);

      return lines.join('\n');
    },
  },
];

export function listPrompts(): Array<{ name: string; description: string; arguments: PromptArg[] }> {
  return PROMPTS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

export function getPrompt(name: string, args: Record<string, string | undefined> = {}): {
  description: string;
  messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }>;
} {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  for (const arg of prompt.arguments) {
    if (arg.required && !nonEmpty(args[arg.name])) {
      throw new Error(`Prompt "${name}" requires argument "${arg.name}"`);
    }
  }
  return {
    description: prompt.description,
    messages: [
      { role: 'user', content: { type: 'text', text: prompt.build(args) } },
    ],
  };
}
