package com.ospreyloyalty.partners.purchases;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.data.mongo.DataMongoTest;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Live-Mongo tests for the purchase write path (ADR-0016): each write persists ONE PENDING outbox
 * row embedding the full event, keyed by its own _id — so two writes of the same idempotencyKey
 * (the duplicate-demo) produce two distinct rows, no unique-key collision.
 *
 * <p>{@link DockerAvailableCondition} skips (not fails) the class when no usable Docker is reachable,
 * so {@code mvnw test} stays green on machines without Docker; it runs fully where Docker is present.
 */
@ExtendWith(DockerAvailableCondition.class)
@Testcontainers
@DataMongoTest
class OutboxWriterIntegrationTest {

    @Container
    static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void mongoProps(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", MONGO::getReplicaSetUrl);
    }

    @Autowired OutboxRepository repository;

    private OutboxWriter writer;
    private final Clock clock = Clock.fixed(Instant.parse("2026-07-09T12:00:00Z"), ZoneOffset.UTC);

    @BeforeEach
    void clean() {
        repository.deleteAll();
        writer = new OutboxWriter(repository, clock);
    }

    private EarnEvent event(String idempotencyKey) {
        return new EarnEvent("demo-erik", "cardco", new BigDecimal("40000"), 0.5,
                idempotencyKey, clock.instant(), "corr-1", "svc-token");
    }

    @Test
    void write_persists_one_pending_entry_embedding_the_event() {
        EarnEvent event = event("key-1");

        OutboxEntry saved = writer.write(event);

        assertThat(saved.getId()).isNotBlank();
        OutboxEntry reloaded = repository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(OutboxEntry.Status.PENDING);
        assertThat(reloaded.getAttempts()).isEqualTo(0);
        assertThat(reloaded.getCreatedAt()).isEqualTo(clock.instant());
        assertThat(reloaded.getNextAttemptAt()).isEqualTo(clock.instant());
        // Full event payload embedded and round-trips faithfully.
        assertThat(reloaded.getEvent().memberId()).isEqualTo("demo-erik");
        assertThat(reloaded.getEvent().partnerId()).isEqualTo("cardco");
        assertThat(reloaded.getEvent().idempotencyKey()).isEqualTo("key-1");
        assertThat(reloaded.getEvent().rate()).isEqualTo(0.5);
        assertThat(reloaded.getEvent().authToken()).isEqualTo("svc-token");
    }

    @Test
    void two_writes_of_the_same_idempotency_key_produce_two_distinct_rows() {
        EarnEvent shared = event("dup-key");

        OutboxEntry a = writer.write(shared);
        OutboxEntry b = writer.write(shared);

        // No unique index on the business key: both rows persist under distinct _id (ADR-0016).
        assertThat(a.getId()).isNotEqualTo(b.getId());
        assertThat(repository.count()).isEqualTo(2);
        assertThat(a.getEvent().idempotencyKey()).isEqualTo(b.getEvent().idempotencyKey());
    }
}
