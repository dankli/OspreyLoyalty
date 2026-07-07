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
  fetchMember: (baseUrl: string, id: string) => Promise<Member | null>;
  fetchTransactions: (baseUrl: string, memberId: string, page: number) => Promise<TransactionsPage>;
  fetchPartners: (baseUrl: string) => Promise<Partner[]>;
  fetchRewards: (baseUrl: string) => Promise<Reward[]>;
  postRedemption: (baseUrl: string, memberId: string, rewardId: string, idempotencyKey: string) => Promise<RedemptionResult>;
};

const typeDefs = readFileSync(new URL("../schema.graphql", import.meta.url), "utf8");

export function schema(deps: Deps): GraphQLSchemaWithContext<YogaInitialContext> {
  return createSchema({
    typeDefs,
    resolvers: {
      Query: {
        member: (_parent: unknown, args: { id: string }) => deps.fetchMember(env.MEMBERS_URL, args.id),
        transactions: (_parent: unknown, args: { memberId: string; page: number }) =>
          deps.fetchTransactions(env.MEMBERS_URL, args.memberId, args.page),
        partners: () => deps.fetchPartners(env.PARTNERS_URL),
        dashboard: async (_parent: unknown, args: { memberId: string }) => {
          // Fan-out: both legs run concurrently, each bounded by its client's own 2s timeout.
          const [member, partners] = await Promise.all([
            deps.fetchMember(env.MEMBERS_URL, args.memberId),
            deps.fetchPartners(env.PARTNERS_URL),
          ]);
          return { member, partners };
        },
        rewards: () => deps.fetchRewards(env.MEMBERS_URL),
      },
      Mutation: {
        redeem: (_parent: unknown, args: { memberId: string; rewardId: string; idempotencyKey: string }) =>
          deps.postRedemption(env.MEMBERS_URL, args.memberId, args.rewardId, args.idempotencyKey),
      },
    },
  });
}
