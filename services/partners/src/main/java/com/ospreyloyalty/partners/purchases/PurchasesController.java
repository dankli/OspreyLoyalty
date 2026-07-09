package com.ospreyloyalty.partners.purchases;

import com.ospreyloyalty.partners.CorrelationIdFilter;
import com.ospreyloyalty.partners.LocalizedBadRequest;
import com.ospreyloyalty.partners.catalogue.Partner;
import com.ospreyloyalty.partners.catalogue.PartnerCatalogue;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
public class PurchasesController {

    private static final BigDecimal MAX_AMOUNT = new BigDecimal(1_000_000);

    private final OutboxWriter outbox;
    private final ServiceTokenProvider tokenProvider;

    public PurchasesController(OutboxWriter outbox, ServiceTokenProvider tokenProvider) {
        this.outbox = outbox;
        this.tokenProvider = tokenProvider;
    }

    // The API no longer depends on RabbitMQ being up: it durably writes ONE outbox row per intended
    // delivery and returns immediately (ADR-0016). The OutboxRelay publishes to the broker
    // asynchronously; if the broker is down the earn waits in Mongo instead of 500ing and being lost.
    @PostMapping("/partners/{partnerId}/purchases")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> purchase(@PathVariable String partnerId, @RequestBody PurchaseRequest request) {
        EarnEvent event = toEvent(partnerId, request);
        outbox.write(event);
        return Map.of("idempotencyKey", event.idempotencyKey());
    }

    /**
     * Deliberately enqueues the SAME event twice — proves downstream idempotency (spec §4.3).
     * Two outbox rows carry the same idempotencyKey (keyed by distinct _id, no unique index on the
     * business key — ADR-0016); the relay publishes both and the members consumer dedups to one
     * ledger entry (ADR-0002).
     */
    @PostMapping("/partners/{partnerId}/purchases/duplicate-demo")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> duplicateDemo(@PathVariable String partnerId, @RequestBody PurchaseRequest request) {
        EarnEvent event = toEvent(partnerId, request);
        outbox.write(event);
        outbox.write(event);
        return Map.of("idempotencyKey", event.idempotencyKey(), "deliveries", "2");
    }

    private EarnEvent toEvent(String partnerId, PurchaseRequest request) {
        Partner partner = PartnerCatalogue.byId(partnerId)
            .orElseThrow(() -> new LocalizedBadRequest("partner.unknown", "Unknown partner: " + partnerId, partnerId));
        if (request.memberId() == null || request.memberId().isBlank() || request.memberId().length() > 64)
            throw new LocalizedBadRequest("member.id.invalid", "memberId is required and at most 64 characters.");
        if (request.amount() == null || request.amount().signum() <= 0 || request.amount().compareTo(MAX_AMOUNT) > 0)
            throw new LocalizedBadRequest("amount.invalid",
                "amount must be positive and at most " + MAX_AMOUNT + ".", MAX_AMOUNT.toString());
        // Stamp the zero-trust service token (null when auth is off) so members can authenticate
        // this event off the queue — the async counterpart to forwarding the caller's bearer.
        return new EarnEvent(request.memberId(), partner.id(), request.amount(), partner.rate(),
            UUID.randomUUID().toString(), Instant.now(), MDC.get(CorrelationIdFilter.MDC_KEY), tokenProvider.mint());
    }
}
