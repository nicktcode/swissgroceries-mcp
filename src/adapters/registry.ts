import type { Chain, StoreAdapter, AdapterCapabilities } from './types.js';

export class AdapterRegistry {
  private adapters = new Map<Chain, StoreAdapter>();

  register(a: StoreAdapter): void {
    if (this.adapters.has(a.chain)) {
      throw new Error(`Adapter for chain "${a.chain}" already registered`);
    }
    this.adapters.set(a.chain, a);
  }

  get(chain: Chain): StoreAdapter | undefined {
    return this.adapters.get(chain);
  }

  list(filter?: Chain[]): StoreAdapter[] {
    const all = [...this.adapters.values()];
    return filter ? all.filter((a) => filter.includes(a.chain)) : all;
  }

  withCapability(cap: keyof AdapterCapabilities, filter?: Chain[]): StoreAdapter[] {
    return this.list(filter).filter((a) => a.capabilities[cap]);
  }
}
