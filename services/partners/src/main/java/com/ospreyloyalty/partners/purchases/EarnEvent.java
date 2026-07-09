package com.ospreyloyalty.partners.purchases;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Wire contract consumed by services/members (ApplyEarn.EarnEvent). Keep in sync by hand.
 * correlationId and authToken are last on purpose: the .NET counterpart declares them as
 * optional trailing parameters ({@code string? CorrelationId = null, string? AuthToken = null}),
 * so older payloads without them still bind (ADR-0002 additive-field convention).
 *
 * <p>authToken is the service token partners mints so members can authenticate the RabbitMQ
 * leg of zero-trust (ADR-0007); it is null when auth is off, and members ignores it then.
 */
public record EarnEvent(
    String memberId,
    String partnerId,
    BigDecimal amount,
    double rate,
    String idempotencyKey,
    Instant occurredAtUtc,
    String correlationId,
    String authToken) {}
