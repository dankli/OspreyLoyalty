import { createYoga } from "graphql-yoga";
import type { YogaServerInstance } from "graphql-yoga";
import { schema, type Deps } from "./schema.js";
import { fetchMember } from "./features/member/membersClient.js";
import { fetchTransactions } from "./features/member/transactionsClient.js";
import { fetchPartners } from "./features/partner/partnersClient.js";
import { fetchRewards } from "./features/reward/rewardsClient.js";
import { postRedemption } from "./features/reward/redeemClient.js";
import { postTripRedemption } from "./features/trip/bookTripClient.js";
import { fetchBenefitActivations, postBenefitActivation } from "./features/benefit/benefitsClient.js";
import { withRetry } from "./retry.js";
import { fetchAirport, fetchAllAirports, fetchDestinations, searchAirports, searchRoute } from "./features/routes/routesClient.js";

// Reads get one retry (idempotent); the three mutations never do — their retry safety
// lives in members' idempotency keys, driven by the CALLER's key, not a hidden replay.
const defaultDeps: Deps = {
  fetchMember: withRetry(fetchMember),
  fetchTransactions: withRetry(fetchTransactions),
  fetchPartners: withRetry(fetchPartners),
  fetchRewards: withRetry(fetchRewards),
  postRedemption,
  searchAirports: withRetry(searchAirports),
  fetchAirport: withRetry(fetchAirport),
  fetchDestinations: withRetry(fetchDestinations),
  fetchAllAirports: withRetry(fetchAllAirports),
  searchRoute: withRetry(searchRoute),
  postTripRedemption,
  fetchBenefitActivations: withRetry(fetchBenefitActivations),
  postBenefitActivation,
};

export function buildYoga(deps: Deps = defaultDeps): YogaServerInstance<{}, {}> {
  // Demo stack: the portal is served from another local port, so CORS is wide open on purpose.
  // maskedErrors: false — demo BFF: members' validation messages ARE the user-facing errors
  return createYoga({ schema: schema(deps), cors: { origin: "*" }, maskedErrors: false });
}
