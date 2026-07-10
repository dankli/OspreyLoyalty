// A crafted graph where the hop-optimal and weight-optimal answers differ:
//   PPP→QQQ direct: 1 hop, 1000 km, 50 min   (hop- and min-optimal)
//   PPP→RRR→QQQ:    2 hops, 200 km, 400 min  (km-optimal)
// QQQ has no outbound edges, so QQQ→RRR is unreachable.
function airport(iata: string, routes: object[]): object {
  return {
    city_name: `${iata} City`,
    continent: "EU",
    country: "Testland",
    country_code: "TL",
    display_name: `${iata} City (${iata}), Testland`,
    elevation: 10,
    iata,
    icao: null,
    latitude: "59.0",
    longitude: "18.0",
    name: `${iata} Airport`,
    routes,
    timezone: "Europe/Stockholm",
  };
}

export const routeFixture = JSON.stringify({
  PPP: airport("PPP", [
    { carriers: [{ iata: "T1", name: "Test Direct" }], iata: "QQQ", km: 1000, min: 50 },
    { carriers: [{ iata: "T2", name: "Test Hopper" }], iata: "RRR", km: 100, min: 200 },
  ]),
  QQQ: airport("QQQ", []),
  RRR: airport("RRR", [{ carriers: [{ iata: "T2", name: "Test Hopper" }], iata: "QQQ", km: 100, min: 200 }]),
});
