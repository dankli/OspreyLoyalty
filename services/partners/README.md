# partners

Partner earn simulations: a purchase POSTed here becomes an `EarnEvent` on RabbitMQ at the partner's rate, plus the duplicate-delivery demo that deliberately publishes the same event twice.

**Why Java:** partner integrations are the classic enterprise seam, and Spring Boot is what you meet there. The service stays thin — validate, convert amount to points, publish — and lets the framework carry the HTTP and AMQP plumbing.

## Run

```bash
./mvnw spring-boot:run
```

Listens on http://localhost:8080; expects RabbitMQ on `localhost:5672` (override with `RABBITMQ_HOST`/`RABBITMQ_PORT`). In the compose stack it lands on http://localhost:8081.

Every request logs one JSON line with a correlation id (`X-Correlation-Id` is accepted or generated, and rides the earn event); Prometheus metrics are at `/actuator/prometheus`.

## Test

```bash
./mvnw test
```

12 tests: purchase-to-event publishing with partner rates, the duplicate-demo publishing the same idempotency key twice, validation failures, the correlation filter, and the rates catalogue.
