/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query MemberDashboard($id: ID!) {\n    member(id: $id) {\n      id\n      name\n      tier\n      qualifyingPoints\n      spendablePoints\n      pointsToNextTier\n      benefits\n    }\n  }\n": typeof types.MemberDashboardDocument,
    "\n  query RewardsCatalog {\n    rewards {\n      id\n      name\n      cost\n    }\n  }\n": typeof types.RewardsCatalogDocument,
    "\n  query MemberBalance($id: ID!) {\n    member(id: $id) {\n      id\n      spendablePoints\n    }\n  }\n": typeof types.MemberBalanceDocument,
    "\n  mutation RedeemReward($memberId: ID!, $rewardId: String!, $idempotencyKey: String!) {\n    redeem(memberId: $memberId, rewardId: $rewardId, idempotencyKey: $idempotencyKey) {\n      rewardId\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n": typeof types.RedeemRewardDocument,
    "\n  query MemberTransactions($memberId: ID!, $page: Int!) {\n    transactions(memberId: $memberId, page: $page) {\n      items {\n        id\n        type\n        points\n        source\n        occurredAtUtc\n      }\n      page\n      hasMore\n    }\n  }\n": typeof types.MemberTransactionsDocument,
};
const documents: Documents = {
    "\n  query MemberDashboard($id: ID!) {\n    member(id: $id) {\n      id\n      name\n      tier\n      qualifyingPoints\n      spendablePoints\n      pointsToNextTier\n      benefits\n    }\n  }\n": types.MemberDashboardDocument,
    "\n  query RewardsCatalog {\n    rewards {\n      id\n      name\n      cost\n    }\n  }\n": types.RewardsCatalogDocument,
    "\n  query MemberBalance($id: ID!) {\n    member(id: $id) {\n      id\n      spendablePoints\n    }\n  }\n": types.MemberBalanceDocument,
    "\n  mutation RedeemReward($memberId: ID!, $rewardId: String!, $idempotencyKey: String!) {\n    redeem(memberId: $memberId, rewardId: $rewardId, idempotencyKey: $idempotencyKey) {\n      rewardId\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n": types.RedeemRewardDocument,
    "\n  query MemberTransactions($memberId: ID!, $page: Int!) {\n    transactions(memberId: $memberId, page: $page) {\n      items {\n        id\n        type\n        points\n        source\n        occurredAtUtc\n      }\n      page\n      hasMore\n    }\n  }\n": types.MemberTransactionsDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MemberDashboard($id: ID!) {\n    member(id: $id) {\n      id\n      name\n      tier\n      qualifyingPoints\n      spendablePoints\n      pointsToNextTier\n      benefits\n    }\n  }\n"): (typeof documents)["\n  query MemberDashboard($id: ID!) {\n    member(id: $id) {\n      id\n      name\n      tier\n      qualifyingPoints\n      spendablePoints\n      pointsToNextTier\n      benefits\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RewardsCatalog {\n    rewards {\n      id\n      name\n      cost\n    }\n  }\n"): (typeof documents)["\n  query RewardsCatalog {\n    rewards {\n      id\n      name\n      cost\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MemberBalance($id: ID!) {\n    member(id: $id) {\n      id\n      spendablePoints\n    }\n  }\n"): (typeof documents)["\n  query MemberBalance($id: ID!) {\n    member(id: $id) {\n      id\n      spendablePoints\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RedeemReward($memberId: ID!, $rewardId: String!, $idempotencyKey: String!) {\n    redeem(memberId: $memberId, rewardId: $rewardId, idempotencyKey: $idempotencyKey) {\n      rewardId\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n"): (typeof documents)["\n  mutation RedeemReward($memberId: ID!, $rewardId: String!, $idempotencyKey: String!) {\n    redeem(memberId: $memberId, rewardId: $rewardId, idempotencyKey: $idempotencyKey) {\n      rewardId\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MemberTransactions($memberId: ID!, $page: Int!) {\n    transactions(memberId: $memberId, page: $page) {\n      items {\n        id\n        type\n        points\n        source\n        occurredAtUtc\n      }\n      page\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query MemberTransactions($memberId: ID!, $page: Int!) {\n    transactions(memberId: $memberId, page: $page) {\n      items {\n        id\n        type\n        points\n        source\n        occurredAtUtc\n      }\n      page\n      hasMore\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;