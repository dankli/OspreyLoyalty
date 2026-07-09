package com.ospreyloyalty.partners.purchases;

import java.time.Clock;
import org.springframework.stereotype.Component;

/**
 * Durably persists an {@link EarnEvent} as a PENDING {@link OutboxEntry} on the purchase path,
 * so the API returns success without depending on RabbitMQ being up (ADR-0016). The
 * {@link OutboxRelay} publishes it asynchronously.
 *
 * <p>Thin seam over the repository so the controller unit test can verify a row is written
 * without a live Mongo — the same role {@link EarnEventPublisher} used to play.
 */
@Component
public class OutboxWriter {

    private final OutboxRepository repository;
    private final Clock clock;

    public OutboxWriter(OutboxRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** Persist one PENDING entry embedding the event. Each call writes a distinct {@code _id}. */
    public OutboxEntry write(EarnEvent event) {
        return repository.save(OutboxEntry.pending(event, clock.instant()));
    }
}
