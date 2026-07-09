package com.ospreyloyalty.partners.purchases;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Live-Mongo tests for the outbox write + relay drain (ADR-0016). Uses Testcontainers-Mongo, the same
 * approach services/members uses (Testcontainers.MongoDb). Requires Docker.
 */
@ExtendWith(DockerAvailableCondition.class)
@Testcontainers
@DataMongoTest
class OutboxRelayIntegrationTest {

    @Container
    static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", MONGO::getReplicaSetUrl);
    }

    @Autowired OutboxRepository repository;
    @Autowired MongoOperations mongo;

    private EarnEventPublisher publisher;
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-09T12:00:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void clean() {
        repository.deleteAll();
        publisher = mock(EarnEventPublisher.class);
    }

    private OutboxRelay relay() {
        // Small max-attempts + backoff so the FAILED path is reachable within the test.
        return new OutboxRelay(mongo, publisher, clock, 50, 3, 30_000, 1_000);
    }

    private EarnEvent event(String idempotencyKey) {
        return new EarnEvent("demo-erik", "cardco", new BigDecimal("40000"), 0.5,
                idempotencyKey, clock.instant(), "corr-1", null);
    }

    private OutboxEntry writePending(EarnEvent event) {
        return repository.save(OutboxEntry.pending(event, clock.instant()));
    }

    @Test
    void relay_publishes_a_pending_entry_and_marks_it_published() {
        doNothing().when(publisher).publish(org.mockito.ArgumentMatchers.any());
        OutboxEntry entry = writePending(event("key-1"));

        int published = relay().relayBatch();

        assertThat(published).isEqualTo(1);
        verify(publisher, times(1)).publish(org.mockito.ArgumentMatchers.any());
        OutboxEntry reloaded = repository.findById(entry.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(OutboxEntry.Status.PUBLISHED);
        assertThat(reloaded.getAttempts()).isEqualTo(1);
        assertThat(reloaded.getOwner()).isNull();
        assertThat(reloaded.getLeaseExpiresAt()).isNull();
    }

    @Test
    void duplicate_demo_two_rows_same_key_both_get_published() {
        // The duplicate-demo semantics: two outbox rows, SAME idempotencyKey, distinct _id.
        // No unique index on the key, so both persist; the relay publishes BOTH; members dedups.
        EarnEvent shared = event("dup-key");
        OutboxEntry first = writePending(shared);
        OutboxEntry second = writePending(shared);

        assertThat(first.getId()).isNotEqualTo(second.getId());
        assertThat(repository.count()).isEqualTo(2);

        int published = relay().relayBatch();

        assertThat(published).isEqualTo(2);
        // Two publishes reach the broker; downstream idempotency collapses them to one ledger entry.
        verify(publisher, times(2)).publish(org.mockito.ArgumentMatchers.any());
        assertThat(repository.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(OutboxEntry.Status.PUBLISHED);
        assertThat(repository.findById(second.getId()).orElseThrow().getStatus())
                .isEqualTo(OutboxEntry.Status.PUBLISHED);
    }

    @Test
    void a_failing_publish_backs_off_then_marks_failed_after_max_attempts() {
        doThrow(new RuntimeException("broker down")).when(publisher)
                .publish(org.mockito.ArgumentMatchers.any());
        OutboxEntry entry = writePending(event("key-fail"));

        OutboxRelay relay = relay(); // max-attempts=3

        // Attempt 1: fails -> back off, becomes PENDING with a future nextAttemptAt (not due yet).
        assertThat(relay.relayBatch()).isEqualTo(0);
        OutboxEntry afterOne = repository.findById(entry.getId()).orElseThrow();
        assertThat(afterOne.getStatus()).isEqualTo(OutboxEntry.Status.PENDING);
        assertThat(afterOne.getAttempts()).isEqualTo(1);
        assertThat(afterOne.getNextAttemptAt()).isAfter(clock.instant());
        // A second pass right now claims nothing: the backoff makes it not-due (clock is fixed).
        assertThat(relay.relayBatch()).isEqualTo(0);
        assertThat(repository.findById(entry.getId()).orElseThrow().getAttempts()).isEqualTo(1);

        // Force it due and drain until it exhausts attempts -> FAILED, terminal.
        makeDue(entry.getId());
        assertThat(relay.relayBatch()).isEqualTo(0); // attempt 2
        makeDue(entry.getId());
        assertThat(relay.relayBatch()).isEqualTo(0); // attempt 3 -> FAILED

        OutboxEntry failed = repository.findById(entry.getId()).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo(OutboxEntry.Status.FAILED);
        assertThat(failed.getAttempts()).isEqualTo(3);
        // Terminal: a further drain must not touch it or re-publish.
        assertThat(relay.relayBatch()).isEqualTo(0);
        verify(publisher, times(3)).publish(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void two_relays_racing_the_same_backlog_never_double_publish_a_row() {
        doNothing().when(publisher).publish(org.mockito.ArgumentMatchers.any());
        List<String> ids = List.of("k1", "k2", "k3", "k4", "k5").stream()
                .map(k -> writePending(event(k)).getId())
                .toList();

        // Two independent relay instances (two "pods") drain the same collection.
        OutboxRelay podA = relay();
        OutboxRelay podB = relay();
        int a = podA.relayBatch();
        int b = podB.relayBatch();

        // Every row published exactly once across both pods; none double-claimed.
        assertThat(a + b).isEqualTo(ids.size());
        verify(publisher, times(ids.size())).publish(org.mockito.ArgumentMatchers.any());
        for (String id : ids) {
            assertThat(repository.findById(id).orElseThrow().getStatus())
                    .isEqualTo(OutboxEntry.Status.PUBLISHED);
        }
    }

    /** Force an entry's nextAttemptAt into the past so the fixed-clock relay reclaims it. */
    private void makeDue(String id) {
        OutboxEntry e = repository.findById(id).orElseThrow();
        e.setNextAttemptAt(clock.instant().minusSeconds(1));
        // clear any lease so it's reclaimable regardless of status
        e.setStatus(OutboxEntry.Status.PENDING);
        e.setOwner(null);
        e.setLeaseExpiresAt(null);
        repository.save(e);
    }
}
