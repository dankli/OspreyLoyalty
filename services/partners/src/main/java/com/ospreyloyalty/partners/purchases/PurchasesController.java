package com.ospreyloyalty.partners.purchases;

import com.ospreyloyalty.partners.CorrelationIdFilter;
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

    private final EarnEventPublisher publisher;

    public PurchasesController(EarnEventPublisher publisher) {
        this.publisher = publisher;
    }

    @PostMapping("/partners/{partnerId}/purchases")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> purchase(@PathVariable String partnerId, @RequestBody PurchaseRequest request) {
        EarnEvent event = toEvent(partnerId, request);
        publisher.publish(event);
        return Map.of("idempotencyKey", event.idempotencyKey());
    }

    /** Deliberately publishes the SAME event twice — proves downstream idempotency (spec §4.3). */
    @PostMapping("/partners/{partnerId}/purchases/duplicate-demo")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> duplicateDemo(@PathVariable String partnerId, @RequestBody PurchaseRequest request) {
        EarnEvent event = toEvent(partnerId, request);
        publisher.publish(event);
        publisher.publish(event);
        return Map.of("idempotencyKey", event.idempotencyKey(), "deliveries", "2");
    }

    private static EarnEvent toEvent(String partnerId, PurchaseRequest request) {
        Partner partner = PartnerCatalogue.byId(partnerId)
            .orElseThrow(() -> new IllegalArgumentException("Unknown partner: " + partnerId));
        if (request.memberId() == null || request.memberId().isBlank() || request.memberId().length() > 64)
            throw new IllegalArgumentException("memberId is required and at most 64 characters.");
        if (request.amount() == null || request.amount().signum() <= 0 || request.amount().compareTo(MAX_AMOUNT) > 0)
            throw new IllegalArgumentException("amount must be positive and at most " + MAX_AMOUNT + ".");
        return new EarnEvent(request.memberId(), partner.id(), request.amount(), partner.rate(),
            UUID.randomUUID().toString(), Instant.now(), MDC.get(CorrelationIdFilter.MDC_KEY));
    }
}
