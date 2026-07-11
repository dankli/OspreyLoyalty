import { graphql } from "../../gql";
import { gatewayClient } from "../../gatewayClient";

// The typed contract against the gateway schema — codegen keeps these documents honest.
const AirportSearchDocument = graphql(`
  query AirportSearch($query: String!) {
    airports(query: $query) {
      iata
      name
      city
      country
      degree
    }
  }
`);

const DestinationsDocument = graphql(`
  query Destinations($iata: ID!) {
    airportDestinations(iata: $iata) {
      airport {
        iata
        name
        city
        country
      }
      km
      min
      carriers {
        name
      }
    }
  }
`);

export type AirportHit = {
  iata: string;
  name: string;
  city: string;
  country: string;
  /** Destinations served — only the search endpoint provides it (the hit badge). */
  degree?: number | null;
};
export type DestinationRow = {
  airport: AirportHit;
  km: number;
  min: number;
  carriers: { name: string }[];
};

export async function searchAirports(query: string): Promise<AirportHit[]> {
  const data = await gatewayClient.request(AirportSearchDocument, { query });
  return data.airports;
}

export async function fetchDestinations(iata: string): Promise<DestinationRow[]> {
  const data = await gatewayClient.request(DestinationsDocument, { iata });
  return data.airportDestinations;
}
