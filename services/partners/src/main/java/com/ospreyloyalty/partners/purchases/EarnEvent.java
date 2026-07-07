package com.ospreyloyalty.partners.purchases;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Wire contract consumed by services/members (ApplyEarn.EarnEvent). Keep in sync by hand.
 * correlationId is last on purpose: the .NET counterpart declares it as an optional
 * {@code string? CorrelationId = null} trailing parameter, so older payloads without it still bind.
 */
public record EarnEvent(
    String memberId,
    String partnerId,
    BigDecimal amount,
    double rate,
    String idempotencyKey,
    Instant occurredAtUtc,
    String correlationId) {}
