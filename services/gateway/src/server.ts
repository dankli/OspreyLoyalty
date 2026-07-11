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
import { fetchAirport, fetchAllAirports, fetchDestinations, searchAirports, searchRoute } from "./features/routes/routesClient.js";

export function buildYoga(deps: Deps = { fetchMember, fetchTransactions, fetchPartners, fetchRewards, postRedemption, searchAirports, fetchAirport, fetchDestinations, fetchAllAirports, searchRoute, postTripRedemption, fetchBenefitActivations, postBenefitActivation }): YogaServerInstance<{}, {}> {
  // Demo stack: the portal is served from another local port, so CORS is wide open on purpose.
  // maskedErrors: false — demo BFF: members' validation messages ARE the user-facing errors
  return createYoga({ schema: schema(deps), cors: { origin: "*" }, maskedErrors: false });
}
