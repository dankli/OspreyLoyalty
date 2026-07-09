# Load & soak testing (k6)

Two [k6](https://k6.io) scripts that drive the **real** Osprey Loyalty user
journeys against the running stack and gate the result on SLO-style thresholds:

| Script | Question it answers | Load model |
|--------|--------------------|------------|
| `smoke.js` | "Does a short burst pass the SLOs right now?" | Closed model: a constant pool of VUs for a short duration. |
| `soak.js`  | "Does the stack stay healthy under sustained, modest load?" | Open model: `constant-arrival-rate` — steady request pressure that does **not** back off when latency climbs. |

Both walk the same three journeys, copied from `infra/e2e-smoke.sh` so the load
mirrors the demo flow:

1. **Earn** — `POST {PARTNERS_URL}/partners/{partner}/purchases` (partners
   service, publishes to RabbitMQ; members consumes and updates the ledger).
2. **Redeem** — the gateway GraphQL `redeem` mutation (each iteration uses a
   fresh idempotency key so it is a genuine burn, not an idempotent no-op).
3. **Read** — the gateway GraphQL `dashboard` query **and** the members
   `GET /api/members/{id}` profile — the two read paths a portal actually hits.

The default per-iteration mix is read-heavy with earns/redeems sprinkled in,
which is closer to a real portal than an even split.

## Run it

### Locally with the k6 binary

```bash
# 1. Bring the stack up (from the repo root)
docker compose -f infra/docker-compose.yml up --build -d

# 2. Smoke / load run (short, uses localhost defaults)
k6 run infra/load/smoke.js

# 3. Soak run (short by default; bump DURATION/RATE for a real soak)
k6 run infra/load/soak.js
```

### Locally with Docker (no k6 install)

The scripts read localhost URLs by default, so point the container at the host
network (Linux) or `host.docker.internal` (Docker Desktop):

```bash
# Linux
docker run --rm --network host -v "$PWD/infra/load:/scripts" grafana/k6 run /scripts/smoke.js

# Docker Desktop (macOS/Windows)
docker run --rm -v "$PWD/infra/load:/scripts" \
  -e GATEWAY_URL=http://host.docker.internal:4000 \
  -e PARTNERS_URL=http://host.docker.internal:8081 \
  -e MEMBERS_URL=http://host.docker.internal:5080 \
  grafana/k6 run /scripts/smoke.js
```

### Validate a script without running load

`k6 inspect` parses the script and prints its options **without executing**:

```bash
docker run --rm -v "$PWD/infra/load:/scripts" grafana/k6 inspect /scripts/smoke.js
```

## Configuration (`__ENV`)

| Var | Default | Meaning |
|-----|---------|---------|
| `GATEWAY_URL` | `http://localhost:4000` | Gateway GraphQL BFF base URL |
| `PARTNERS_URL` | `http://localhost:8081` | Partners service base URL |
| `MEMBERS_URL` | `http://localhost:5080` | Members service base URL |
| `PARTNER` | `cardco` | Partner slug used for earns |
| `REWARD_ID` | `lounge-pass` | Reward redeemed in the redeem journey |
| `VUS` / `DURATION` | `5` / `30s` | Smoke: virtual users and run length |
| `RATE` / `DURATION` | `5` / `2m` | Soak: iterations/sec and hold time |
| `PRE_VUS` / `MAX_VUS` | `10` / `50` | Soak: pre-allocated and max VUs |

Override for a clustered target (Traefik host routing, ADR-0011):

```bash
k6 run -e GATEWAY_URL=http://api.osprey.localtest.me \
       -e PARTNERS_URL=http://partners.osprey.localtest.me \
       -e MEMBERS_URL=http://members.osprey.localtest.me infra/load/smoke.js
```

## Thresholds — the SLO gates

A threshold breach makes k6 exit non-zero, so the run has a pass/fail verdict
(this is what CI checks, not just a graph). Latency is split **per journey**
via custom `Trend` metrics so a slow redeem cannot hide behind a fast read in
the aggregate:

| Metric | Gate | Rationale |
|--------|------|-----------|
| `http_req_failed` | `rate<0.01` | < 1% transport-level errors overall. |
| `earn_errors` | `rate<0.01` | Earn is fire-and-forget HTTP; it should almost never fail. |
| `redeem_errors` | `rate<0.05` | Wider budget: a business refusal ("Insufficient spendable points") still returns HTTP 200 and is a valid outcome, not a transport error — only 5xx/transport failures count here. |
| `read_errors` | `rate<0.01` | Reads should be rock-solid. |
| `earn_latency` | `p(95)<800ms` | One service hop + broker publish. |
| `redeem_latency` | `p(95)<1000ms` | Gateway → members conditional update. |
| `read_latency` | `p(95)<500ms` | Read paths should be the fastest. |
| `http_req_duration` | `p(95)<1000ms` (soak also `p(99)<2000ms`) | Coarse backstop. |

These numbers are **demo defaults**, deliberately generous for a laptop running
the whole fleet plus observability under Docker. They demonstrate the *pattern*
— codifying an SLO as an executable gate — rather than a production target. On a
real cluster you would tighten them to match the SLOs in your error budget and
tie them to the alerting in `infra/observability` (see ADR-0008). The FinOps
and load-testing rationale is recorded in `docs/decisions/0015-load-testing-and-finops.md`
and `docs/finops.md`.

## Where this runs in CI

`.github/workflows/load-test.yml` runs `smoke.js` against a freshly booted
compose stack on a **weekly schedule** and on **manual dispatch** — never on
push/PR. Load tests are too slow to gate every push and must never turn `main`
red; per-push correctness is covered by `infra/e2e-smoke.sh` in the `e2e`
workflow instead.
