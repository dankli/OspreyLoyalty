import { readFileSync } from "node:fs";
import { GraphQLError } from "graphql";
import { createSchema } from "graphql-yoga";
import type { GraphQLSchemaWithContext, YogaInitialContext } from "graphql-yoga";
import { env } from "./env.js";
import type { Member } from "./features/member/membersClient.js";
import type { TransactionsPage } from "./features/member/transactionsClient.js";
import type { Partner } from "./features/partner/partnersClient.js";
import type { Reward } from "./features/reward/rewardsClient.js";
import type { RedemptionOutcome } from "./features/reward/redeemClient.js";
import type { Airport, Destination, MapAirport, RouteOptimize, RoutePath } from "./features/routes/routesClient.js";

export type Deps = {
  fetchMember: (baseUrl: string, id: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Member | null>;
  fetchTransactions: (baseUrl: string, memberId: string, page: number, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<TransactionsPage>;
  fetchPartners: (baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Partner[]>;
  fetchRewards: (baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Reward[]>;
  postRedemption: (baseUrl: string, memberId: string, rewardId: string, idempotencyKey: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<RedemptionOutcome>;
  searchAirports: (baseUrl: string, query: string, limit: number, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Airport[]>;
  fetchAirport: (baseUrl: string, iata: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Airport | null>;
  fetchDestinations: (baseUrl: string, iata: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<Destination[]>;
  fetchAllAirports: (baseUrl: string, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<MapAirport[]>;
  searchRoute: (baseUrl: string, from: string, to: string, optimize: RouteOptimize, correlationId?: string, authorization?: string, acceptLanguage?: string) => Promise<RoutePath | null>;
};

const typeDefs = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");

type RequestContext = { request: Request };

const correlationIdOf = (context: RequestContext): string | undefined =>
  context.request.headers.get("x-correlation-id") ?? undefined;

// Forward the caller's bearer token downstream so each service enforces zero-trust itself.
const authorizationOf = (context: RequestContext): string | undefined =>
  context.request.headers.get("authorization") ?? undefined;

// Forward the caller's language so downstream services localize their own error messages.
const acceptLanguageOf = (context: RequestContext): string | undefined =>
  context.request.headers.get("accept-language") ?? undefined;

export function schema(deps: Deps): GraphQLSchemaWithContext<YogaInitialContext> {
  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        member: (_parent: unknown, args: { id: string }, context: RequestContext) =>
          deps.fetchMember(env.MEMBERS_URL, args.id, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        transactions: (_parent: unknown, args: { memberId: string; page: number }, context: RequestContext) =>
          deps.fetchTransactions(env.MEMBERS_URL, args.memberId, args.page, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        partners: (_parent: unknown, _args: unknown, context: RequestContext) =>
          deps.fetchPartners(env.PARTNERS_URL, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        dashboard: async (_parent: unknown, args: { memberId: string }, context: RequestContext) => {
          // Fan-out: both legs run concurrently, each bounded by its client's own 2s timeout.
          const correlationId = correlationIdOf(context);
          const authorization = authorizationOf(context);
          const acceptLanguage = acceptLanguageOf(context);
          const [member, partners] = await Promise.all([
            deps.fetchMember(env.MEMBERS_URL, args.memberId, correlationId, authorization, acceptLanguage),
            deps.fetchPartners(env.PARTNERS_URL, correlationId, authorization, acceptLanguage),
          ]);
          return { member, partners };
        },
        rewards: (_parent: unknown, _args: unknown, context: RequestContext) =>
          deps.fetchRewards(env.MEMBERS_URL, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        airports: (_parent: unknown, args: { query: string; limit: number }, context: RequestContext) =>
          deps.searchAirports(env.ROUTES_URL, args.query, args.limit, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        airport: (_parent: unknown, args: { iata: string }, context: RequestContext) =>
          deps.fetchAirport(env.ROUTES_URL, args.iata, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        airportDestinations: (_parent: unknown, args: { iata: string }, context: RequestContext) =>
          deps.fetchDestinations(env.ROUTES_URL, args.iata, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        mapAirports: (_parent: unknown, _args: unknown, context: RequestContext) =>
          deps.fetchAllAirports(env.ROUTES_URL, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
        routeSearch: (_parent: unknown, args: { from: string; to: string; optimize: "KM" | "MIN" | "HOPS" }, context: RequestContext) =>
          deps.searchRoute(env.ROUTES_URL, args.from, args.to, args.optimize.toLowerCase() as RouteOptimize, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context)),
      },
      Mutation: {
        redeem: async (
          _parent: unknown,
          args: { memberId: string; rewardId: string; idempotencyKey: string },
          context: RequestContext,
        ) => {
          const outcome = await deps.postRedemption(env.MEMBERS_URL, args.memberId, args.rewardId, args.idempotencyKey, correlationIdOf(context), authorizationOf(context), acceptLanguageOf(context));
          if (outcome.ok) return outcome.result;
          // Expected refusal (unknown member / insufficient / unknown reward) → the GraphQL error
          // edge, carrying members' already-localized message. Genuine faults threw upstream.
          throw new GraphQLError(outcome.message);
        },
      },
    },
  });
}
