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
    "\n  query AirportSearch($query: String!) {\n    airports(query: $query) {\n      iata\n      name\n      city\n      country\n      degree\n    }\n  }\n": typeof types.AirportSearchDocument,
    "\n  query Destinations($iata: ID!) {\n    airportDestinations(iata: $iata) {\n      airport {\n        iata\n        name\n        city\n        country\n      }\n      km\n      min\n      carriers {\n        name\n      }\n    }\n  }\n": typeof types.DestinationsDocument,
    "\n  query MapAirports {\n    mapAirports {\n      iata\n      latitude\n      longitude\n      degree\n    }\n  }\n": typeof types.MapAirportsDocument,
    "\n  query MapAirportDetails($iata: ID!) {\n    airport(iata: $iata) {\n      iata\n      name\n      city\n      country\n    }\n  }\n": typeof types.MapAirportDetailsDocument,
    "\n  mutation BookTrip($memberId: ID!, $from: ID!, $to: ID!, $optimize: RouteOptimize!, $idempotencyKey: String!) {\n    bookTrip(memberId: $memberId, from: $from, to: $to, optimize: $optimize, idempotencyKey: $idempotencyKey) {\n      fromIata\n      toIata\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n": typeof types.BookTripDocument,
    "\n  query RouteSearch($from: ID!, $to: ID!, $optimize: RouteOptimize!) {\n    routeSearch(from: $from, to: $to, optimize: $optimize) {\n      hops\n      totalKm\n      totalMin\n      estimatedPoints\n      legs {\n        from {\n          iata\n          name\n          city\n          country\n        }\n        to {\n          iata\n          name\n          city\n          country\n        }\n        km\n        min\n        carriers {\n          name\n        }\n      }\n    }\n  }\n": typeof types.RouteSearchDocument,
};
const documents: Documents = {
    "\n  query AirportSearch($query: String!) {\n    airports(query: $query) {\n      iata\n      name\n      city\n      country\n      degree\n    }\n  }\n": types.AirportSearchDocument,
    "\n  query Destinations($iata: ID!) {\n    airportDestinations(iata: $iata) {\n      airport {\n        iata\n        name\n        city\n        country\n      }\n      km\n      min\n      carriers {\n        name\n      }\n    }\n  }\n": types.DestinationsDocument,
    "\n  query MapAirports {\n    mapAirports {\n      iata\n      latitude\n      longitude\n      degree\n    }\n  }\n": types.MapAirportsDocument,
    "\n  query MapAirportDetails($iata: ID!) {\n    airport(iata: $iata) {\n      iata\n      name\n      city\n      country\n    }\n  }\n": types.MapAirportDetailsDocument,
    "\n  mutation BookTrip($memberId: ID!, $from: ID!, $to: ID!, $optimize: RouteOptimize!, $idempotencyKey: String!) {\n    bookTrip(memberId: $memberId, from: $from, to: $to, optimize: $optimize, idempotencyKey: $idempotencyKey) {\n      fromIata\n      toIata\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n": types.BookTripDocument,
    "\n  query RouteSearch($from: ID!, $to: ID!, $optimize: RouteOptimize!) {\n    routeSearch(from: $from, to: $to, optimize: $optimize) {\n      hops\n      totalKm\n      totalMin\n      estimatedPoints\n      legs {\n        from {\n          iata\n          name\n          city\n          country\n        }\n        to {\n          iata\n          name\n          city\n          country\n        }\n        km\n        min\n        carriers {\n          name\n        }\n      }\n    }\n  }\n": types.RouteSearchDocument,
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
export function graphql(source: "\n  query AirportSearch($query: String!) {\n    airports(query: $query) {\n      iata\n      name\n      city\n      country\n      degree\n    }\n  }\n"): (typeof documents)["\n  query AirportSearch($query: String!) {\n    airports(query: $query) {\n      iata\n      name\n      city\n      country\n      degree\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Destinations($iata: ID!) {\n    airportDestinations(iata: $iata) {\n      airport {\n        iata\n        name\n        city\n        country\n      }\n      km\n      min\n      carriers {\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query Destinations($iata: ID!) {\n    airportDestinations(iata: $iata) {\n      airport {\n        iata\n        name\n        city\n        country\n      }\n      km\n      min\n      carriers {\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MapAirports {\n    mapAirports {\n      iata\n      latitude\n      longitude\n      degree\n    }\n  }\n"): (typeof documents)["\n  query MapAirports {\n    mapAirports {\n      iata\n      latitude\n      longitude\n      degree\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MapAirportDetails($iata: ID!) {\n    airport(iata: $iata) {\n      iata\n      name\n      city\n      country\n    }\n  }\n"): (typeof documents)["\n  query MapAirportDetails($iata: ID!) {\n    airport(iata: $iata) {\n      iata\n      name\n      city\n      country\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation BookTrip($memberId: ID!, $from: ID!, $to: ID!, $optimize: RouteOptimize!, $idempotencyKey: String!) {\n    bookTrip(memberId: $memberId, from: $from, to: $to, optimize: $optimize, idempotencyKey: $idempotencyKey) {\n      fromIata\n      toIata\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n"): (typeof documents)["\n  mutation BookTrip($memberId: ID!, $from: ID!, $to: ID!, $optimize: RouteOptimize!, $idempotencyKey: String!) {\n    bookTrip(memberId: $memberId, from: $from, to: $to, optimize: $optimize, idempotencyKey: $idempotencyKey) {\n      fromIata\n      toIata\n      pointsSpent\n      spendablePoints\n      alreadyApplied\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query RouteSearch($from: ID!, $to: ID!, $optimize: RouteOptimize!) {\n    routeSearch(from: $from, to: $to, optimize: $optimize) {\n      hops\n      totalKm\n      totalMin\n      estimatedPoints\n      legs {\n        from {\n          iata\n          name\n          city\n          country\n        }\n        to {\n          iata\n          name\n          city\n          country\n        }\n        km\n        min\n        carriers {\n          name\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query RouteSearch($from: ID!, $to: ID!, $optimize: RouteOptimize!) {\n    routeSearch(from: $from, to: $to, optimize: $optimize) {\n      hops\n      totalKm\n      totalMin\n      estimatedPoints\n      legs {\n        from {\n          iata\n          name\n          city\n          country\n        }\n        to {\n          iata\n          name\n          city\n          country\n        }\n        km\n        min\n        carriers {\n          name\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;