package com.ospreyloyalty.partners.purchases;

import java.math.BigDecimal;
import java.time.Instant;

/** Wire contract consumed by services/members (ApplyEarn.EarnEvent). Keep in sync by hand. */
public record EarnEvent(
    String memberId,
    String partnerId,
    BigDecimal amount,
    double rate,
    String idempotencyKey,
    Instant occurredAtUtc) {}
