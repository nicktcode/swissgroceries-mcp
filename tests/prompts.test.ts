import { describe, it, expect } from 'vitest';
import { listPrompts, getPrompt, PROMPTS } from '../src/prompts.js';

describe('listPrompts', () => {
  it('returns all three prompts with names + descriptions + arguments', () => {
    const ps = listPrompts();
    expect(ps).toHaveLength(3);
    const names = ps.map((p) => p.name);
    expect(names).toContain('weekly_deals_digest');
    expect(names).toContain('compare_basket_across_chains');
    expect(names).toContain('cheapest_recipe_ingredients');
    for (const p of ps) {
      expect(typeof p.description).toBe('string');
      expect(p.description.length).toBeGreaterThan(20);
      expect(Array.isArray(p.arguments)).toBe(true);
    }
  });

  it('every prompt definition has at least one argument', () => {
    for (const p of PROMPTS) {
      expect(p.arguments.length).toBeGreaterThan(0);
    }
  });
});

describe('getPrompt', () => {
  it('weekly_deals_digest with no args produces a usable user message', () => {
    const r = getPrompt('weekly_deals_digest', {});
    expect(r.messages).toHaveLength(1);
    const msg = r.messages[0];
    expect(msg.role).toBe('user');
    expect(msg.content.type).toBe('text');
    expect(msg.content.text).toContain('get_promotions');
    expect(msg.content.text).toContain('all configured chains');
  });

  it('weekly_deals_digest interpolates category + chains arguments', () => {
    const text = getPrompt('weekly_deals_digest', {
      category: 'wine',
      chains: 'coop,ottos',
    }).messages[0].content.text;
    expect(text).toContain('"wine"');
    expect(text).toContain('coop,ottos');
  });

  it('weekly_deals_digest with `near` adds the geographic section', () => {
    const text = getPrompt('weekly_deals_digest', { near: '5430' }).messages[0].content.text;
    expect(text).toContain('Near 5430');
    expect(text).toContain('find_stores');
  });

  it('weekly_deals_digest with empty-string args is treated as omitted', () => {
    const text = getPrompt('weekly_deals_digest', { category: '   ', chains: '' }).messages[0].content.text;
    expect(text).not.toContain('""');
    expect(text).toContain('Cover food');
  });

  it('compare_basket_across_chains throws when items missing', () => {
    expect(() => getPrompt('compare_basket_across_chains', {})).toThrow(/items/);
  });

  it('compare_basket_across_chains formats item list and references plan_shopping', () => {
    const text = getPrompt('compare_basket_across_chains', {
      items: 'milk 2L, bananas 1kg, brot',
    }).messages[0].content.text;
    expect(text).toContain('"milk 2L"');
    expect(text).toContain('"bananas 1kg"');
    expect(text).toContain('"brot"');
    expect(text).toContain('plan_shopping');
    expect(text).toContain('split_cart');
    expect(text).toContain('absolute_cheapest');
  });

  it('compare_basket_across_chains with preferred_chain inserts the benchmark line', () => {
    const text = getPrompt('compare_basket_across_chains', {
      items: 'pasta',
      preferred_chain: 'migros',
    }).messages[0].content.text;
    expect(text).toContain('vs migros:');
    expect(text).toContain('migros wins');
  });

  it('cheapest_recipe_ingredients with ingredients list works without recipe_url', () => {
    const text = getPrompt('cheapest_recipe_ingredients', {
      ingredients: '500g pasta\n200g parmesan\n2 eggs',
    }).messages[0].content.text;
    expect(text).toContain('500g pasta');
    expect(text).toContain('200g parmesan');
    expect(text).toContain('plan_shopping');
    expect(text).toContain('Per-ingredient table');
  });

  it('cheapest_recipe_ingredients with recipe_url instructs to fetch the page', () => {
    const text = getPrompt('cheapest_recipe_ingredients', {
      recipe_url: 'https://example.com/recipe/lasagna',
    }).messages[0].content.text;
    expect(text).toContain('Fetch the recipe at https://example.com/recipe/lasagna');
  });

  it('cheapest_recipe_ingredients with neither argument asks the user for the list', () => {
    const text = getPrompt('cheapest_recipe_ingredients', {}).messages[0].content.text;
    expect(text).toContain('Ask the user');
  });

  it('cheapest_recipe_ingredients with servings adds the scale instruction', () => {
    const text = getPrompt('cheapest_recipe_ingredients', {
      ingredients: '500g flour',
      servings: '6',
    }).messages[0].content.text;
    expect(text).toContain('Scale the quantities to 6 servings');
  });

  it('throws on unknown prompt names', () => {
    expect(() => getPrompt('not_a_real_prompt', {})).toThrow(/Unknown prompt/);
  });
});
