package com.ospreyloyalty.partners.purchases;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Drains the durable outbox (ADR-0016): every {@code osprey.outbox.relay-interval-ms} it claims a
 * bounded batch of due entries, publishes each to RabbitMQ via {@link EarnEventPublisher}, and marks
 * the outcome. At-least-once — a crash after publish but before the PUBLISHED write re-publishes on
 * the next pass, and the members consumer dedups on idempotencyKey (ADR-0002).
 *
 * <p><b>Multi-pod claim.</b> Each claim is an atomic {@code findAndModify}: it matches a row that is
 * PENDING/SENDING, due ({@code nextAttemptAt <= now}), and whose lease has lapsed
 * ({@code leaseExpiresAt <= now} or absent), and flips it to SENDING stamped with this pod's owner id
 * and a fresh lease. Because the match-and-flip is one atomic operation, five pods racing the same
 * row leave exactly one winner; the losers' queries no longer match it. A pod that crashes mid-publish
 * leaves a SENDING row whose lease eventually lapses and is reclaimed.
 *
 * <p><b>Bounded.</b> The batch size, max attempts, lease duration and backoff base are all config
 * with finite defaults — no unbounded fan-out, no infinite retry. After {@code max-attempts} a row is
 * marked FAILED and logged, never retried again.
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final MongoOperations mongo;
    private final EarnEventPublisher publisher;
    private final Clock clock;
    private final int batchSize;
    private final int maxAttempts;
    private final Duration leaseDuration;
    private final Duration backoffBase;
    /** Stable per-pod id stamped as the lease owner so claims are attributable in logs. */
    private final String podId = UUID.randomUUID().toString();

    public OutboxRelay(
            MongoOperations mongo,
            EarnEventPublisher publisher,
            Clock clock,
            @Value("${osprey.outbox.batch-size:50}") int batchSize,
            @Value("${osprey.outbox.max-attempts:10}") int maxAttempts,
            @Value("${osprey.outbox.lease-ms:30000}") long leaseMs,
            @Value("${osprey.outbox.backoff-base-ms:2000}") long backoffBaseMs) {
        this.mongo = mongo;
        this.publisher = publisher;
        this.clock = clock;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
        this.leaseDuration = Duration.ofMillis(leaseMs);
        this.backoffBase = Duration.ofMillis(backoffBaseMs);
    }

    /** Scheduled drain. Fixed delay (not rate) so a slow batch never overlaps itself on one pod. */
    @Scheduled(fixedDelayString = "${osprey.outbox.relay-interval-ms:1000}")
    public void drain() {
        try {
            relayBatch();
        } catch (RuntimeException ex) {
            // Never let the scheduler thread die; the next tick retries. Bounded log, no rethrow.
            log.warn("Outbox drain pass failed; will retry next interval", ex);
        }
    }

    /**
     * Claim up to {@code batchSize} due entries and publish each. Returns how many were published
     * this pass (handy for tests). Bounded by {@code batchSize}: at most that many rows per pass.
     */
    public int relayBatch() {
        List<OutboxEntry> claimed = claimBatch();
        int published = 0;
        for (OutboxEntry entry : claimed) {
            if (publish(entry)) {
                published++;
            }
        }
        return published;
    }

    /** Atomically claim up to {@code batchSize} due, unleased entries, flipping each to SENDING. */
    private List<OutboxEntry> claimBatch() {
        List<OutboxEntry> claimed = new ArrayList<>();
        for (int i = 0; i < batchSize; i++) {
            OutboxEntry entry = claimOne();
            if (entry == null) {
                break; // nothing else due right now
            }
            claimed.add(entry);
        }
        return claimed;
    }

    /**
     * One atomic claim. Matches a PENDING or (lease-lapsed) SENDING row that is due, and flips it to
     * SENDING with this pod's owner + a fresh lease, returning the post-update document. Null when
     * nothing is due. This single findAndModify is what makes the multi-pod race safe.
     */
    private OutboxEntry claimOne() {
        Instant now = clock.instant();
        Query query = new Query(new Criteria().andOperator(
                Criteria.where("nextAttemptAt").lte(now),
                new Criteria().orOperator(
                        Criteria.where("status").is(OutboxEntry.Status.PENDING),
                        // reclaim a SENDING row whose owner crashed and whose lease has lapsed
                        new Criteria().andOperator(
                                Criteria.where("status").is(OutboxEntry.Status.SENDING),
                                Criteria.where("leaseExpiresAt").lte(now)))));
        Update update = new Update()
                .set("status", OutboxEntry.Status.SENDING)
                .set("owner", podId)
                .set("leaseExpiresAt", now.plus(leaseDuration));
        return mongo.findAndModify(
                query, update,
                FindAndModifyOptions.options().returnNew(true),
                OutboxEntry.class);
    }

    /** Publish one claimed entry and record the outcome. Returns true on success. */
    private boolean publish(OutboxEntry entry) {
        try {
            publisher.publish(entry.getEvent());
            markPublished(entry);
            return true;
        } catch (RuntimeException ex) {
            markFailure(entry, ex);
            return false;
        }
    }

    private void markPublished(OutboxEntry entry) {
        Update update = new Update()
                .set("status", OutboxEntry.Status.PUBLISHED)
                .inc("attempts", 1)
                .unset("owner")
                .unset("leaseExpiresAt");
        mongo.updateFirst(byId(entry.getId()), update, OutboxEntry.class);
    }

    /**
     * Record a failed publish: bump attempts, and either back off for a retry
     * (release the lease, set a future nextAttemptAt) or, once the attempt ceiling is hit,
     * mark FAILED terminally and log for operator follow-up. Bounded: never loops forever.
     */
    private void markFailure(OutboxEntry entry, RuntimeException cause) {
        int attempts = entry.getAttempts() + 1;
        Instant now = clock.instant();
        if (attempts >= maxAttempts) {
            log.error("Outbox entry {} (idempotencyKey={}) FAILED after {} attempts; giving up",
                    entry.getId(),
                    entry.getEvent() != null ? entry.getEvent().idempotencyKey() : "?",
                    attempts, cause);
            Update update = new Update()
                    .set("status", OutboxEntry.Status.FAILED)
                    .set("attempts", attempts)
                    .unset("owner")
                    .unset("leaseExpiresAt");
            mongo.updateFirst(byId(entry.getId()), update, OutboxEntry.class);
            return;
        }
        // Exponential backoff, capped at ~5 min, so a flapping broker doesn't get hammered.
        long backoffMs = Math.min(
                backoffBase.toMillis() * (1L << Math.min(attempts - 1, 8)),
                Duration.ofMinutes(5).toMillis());
        log.warn("Outbox entry {} publish attempt {} failed; retrying in {}ms",
                entry.getId(), attempts, backoffMs, cause);
        Update update = new Update()
                .set("status", OutboxEntry.Status.PENDING)
                .set("attempts", attempts)
                .set("nextAttemptAt", now.plusMillis(backoffMs))
                .unset("owner")
                .unset("leaseExpiresAt");
        mongo.updateFirst(byId(entry.getId()), update, OutboxEntry.class);
    }

    private static Query byId(String id) {
        return new Query(Criteria.where("_id").is(id));
    }
}
