// English-only for v1. Gathered in one module so retrofitting the fleet's five-language
// i18n is a mechanical swap. TODO(ADR-0009): wire i18next like the other portals.
export const strings = {
  title: "Route Explorer",
  tabExplore: "Explore",
  searchPlaceholder: "Search airports by name, city or IATA…",
  searchEmpty: "No airports match.",
  destinationsHeading: "Direct destinations from",
  colDestination: "Destination",
  colCountry: "Country",
  colDistance: "Distance",
  colDuration: "Flight time",
  colCarriers: "Carriers",
  noCarriers: "—",
  loadFailed: "Something went wrong talking to the gateway. Try again.",
  loading: "Loading…",
} as const;
