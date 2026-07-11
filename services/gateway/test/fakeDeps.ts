import type { Deps } from "../src/schema.js";

/**
 * A complete, inert Deps object for resolver-level tests: override only what the test
 * exercises. Exists so that adding a fetcher to Deps is a one-line change here instead
 * of a sweep through every test's object literal.
 */
export function fakeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    fetchMember: async () => null,
    fetchTransactions: async () => ({ items: [], page: 0, hasMore: false }),
    fetchPartners: async () => [],
    fetchRewards: async () => [],
    postRedemption: async (): Promise<never> => {
      throw new Error("not used");
    },
    searchAirports: async () => [],
    fetchAirport: async () => null,
    fetchDestinations: async () => [],
    fetchAllAirports: async () => [],
    searchRoute: async () => null,
    postTripRedemption: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}
