package com.ospreyloyalty.partners.campaigns;

import java.time.Instant;

/** A time-boxed earn multiplier for one partner ("double points at StayInn in July"). */
public record Campaign(
    String id,
    String partnerId,
    String name,
    double multiplier,
    Instant startsAtUtc,
    Instant endsAtUtc) {}
