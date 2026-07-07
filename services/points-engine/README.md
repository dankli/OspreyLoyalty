# points-engine

Pure points calculation with promotions over HTTP: `POST /calculate` returns `floor(amount × rate × Π promotion multipliers)`, bounds-checked, with no state, no clocks and no I/O anywhere in the core crate.

**Why Rust:** the calculation is a hot, allocation-sensitive, pure path — exactly where Rust earns its keep. The criterion bench puts one calculation at ~36 ns with no promotions and ~202 ns with five (`cargo bench`).

**Why members does not call it:** at this repo's scale a network hop costs orders of magnitude more than the three-line floor members already has, so wiring it into the earn path would worsen the system to demonstrate a pattern ([docs/decisions/0006](../../docs/decisions/0006-rust-points-engine.md)). The e2e parity check asserts both implementations agree for the no-promotion case, which keeps them honest without a runtime dependency.

## Run

```bash
cargo run
```

Listens on http://localhost:8082 (override with `PORT`); same port in the compose stack. `/health` is the liveness probe, and every request logs one JSON line with a correlation id (`X-Correlation-Id` accepted or generated). There is no `/metrics` endpoint and the engine is not on the RED dashboard — it has no consumers to measure (see the ADR).

## Test

```bash
cargo test    # 17 tests: 4 unit, 6 proptest properties, 7 API
cargo bench   # criterion benchmark of the pure calculation
```

## Try it

```bash
curl -X POST http://localhost:8082/calculate \
  -H "Content-Type: application/json" \
  -d '{"amount":"40000","rate":"0.5","promotions":[{"multiplier":"2.0"}]}'
# {"points":40000}
```

Amounts and rates are accepted as JSON numbers too, but plain numbers pass through
f64 on the way in — send them as strings when exact decimal precision matters.
