/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type MemberDashboardQueryVariables = Exact<{
  id: string | number;
}>;


export type MemberDashboardQuery = { member: { id: string, name: string, tier: string, qualifyingPoints: number, spendablePoints: number, pointsToNextTier: number | null, benefits: Array<string> } | null };


export const MemberDashboardDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MemberDashboard"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"member"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tier"}},{"kind":"Field","name":{"kind":"Name","value":"qualifyingPoints"}},{"kind":"Field","name":{"kind":"Name","value":"spendablePoints"}},{"kind":"Field","name":{"kind":"Name","value":"pointsToNextTier"}},{"kind":"Field","name":{"kind":"Name","value":"benefits"}}]}}]}}]} as unknown as DocumentNode<MemberDashboardQuery, MemberDashboardQueryVariables>;