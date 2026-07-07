import { readFileSync } from "node:fs";
import { createSchema } from "graphql-yoga";
import type { GraphQLSchemaWithContext, YogaInitialContext } from "graphql-yoga";
import { env } from "./env.js";
import type { Member } from "./features/member/membersClient.js";
import type { TransactionsPage } from "./features/member/transactionsClient.js";
import type { Partner } from "./features/partner/partnersClient.js";
import type { Reward } from "./features/reward/rewardsClient.js";
import type { RedemptionResult } from "./features/reward/redeemClient.js";

export type Deps = {
  fetchMember: (baseUrl: string, id: string, correlationId?: string) => Promise<Member | null>;
  fetchTransactions: (baseUrl: string, memberId: string, page: number, correlationId?: string) => Promise<TransactionsPage>;
  fetchPartners: (baseUrl: string, correlationId?: string) => Promise<Partner[]>;
  fetchRewards: (baseUrl: string, correlationId?: string) => Promise<Reward[]>;
  postRedemption: (baseUrl: string, memberId: string, rewardId: string, idempotencyKey: string, correlationId?: string) => Promise<RedemptionResult>;
};

const typeDefs = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");

type RequestContext = { request: Request };

const correlationIdOf = (context: RequestContext): string | undefined =>
  context.request.headers.get("x-correlation-id") ?? undefined;

export function schema(deps: Deps): GraphQLSchemaWithContext<YogaInitialContext> {
  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        member: (_parent: unknown, args: { id: string }, context: RequestContext) =>
          deps.fetchMember(env.MEMBERS_URL, args.id, correlationIdOf(context)),
        transactions: (_parent: unknown, args: { memberId: string; page: number }, context: RequestContext) =>
          deps.fetchTransactions(env.MEMBERS_URL, args.memberId, args.page, correlationIdOf(context)),
        partners: (_parent: unknown, _args: unknown, context: RequestContext) =>
          deps.fetchPartners(env.PARTNERS_URL, correlationIdOf(context)),
        dashboard: async (_parent: unknown, args: { memberId: string }, context: RequestContext) => {
          // Fan-out: both legs run concurrently, each bounded by its client's own 2s timeout.
          const correlationId = correlationIdOf(context);
          const [member, partners] = await Promise.all([
            deps.fetchMember(env.MEMBERS_URL, args.memberId, correlationId),
            deps.fetchPartners(env.PARTNERS_URL, correlationId),
          ]);
          return { member, partners };
        },
        rewards: (_parent: unknown, _args: unknown, context: RequestContext) =>
          deps.fetchRewards(env.MEMBERS_URL, correlationIdOf(context)),
      },
      Mutation: {
        redeem: (
          _parent: unknown,
          args: { memberId: string; rewardId: string; idempotencyKey: string },
          context: RequestContext,
        ) =>
          deps.postRedemption(env.MEMBERS_URL, args.memberId, args.rewardId, args.idempotencyKey, correlationIdOf(context)),
      },
    },
  });
}
