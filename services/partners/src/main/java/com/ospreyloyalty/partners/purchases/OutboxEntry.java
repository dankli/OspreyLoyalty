package com.ospreyloyalty.partners.purchases;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A durable record of one {@link EarnEvent} awaiting publication to RabbitMQ (ADR-0016).
 *
 * <p>The purchase API writes ONE of these per intended delivery and returns immediately, so the
 * earn survives a broker outage. A {@link OutboxRelay} later claims and publishes it. Keyed by its
 * own {@link #id} — deliberately NOT by the business {@code idempotencyKey}, so the duplicate-demo
 * (which writes two rows carrying the same key) is preserved; the members consumer dedups on the
 * key downstream (ADR-0002). At-least-once is the contract.
 *
 * <p>Multi-pod safe: the relay atomically flips {@code PENDING -> SENDING} with a lease
 * ({@link #owner} + {@link #leaseExpiresAt}) before publishing, so five pods never publish the same
 * row at once. A lease that expires (pod crashed mid-publish) is reclaimable.
 */
@Document(collection = "outbox")
public class OutboxEntry {

    public enum Status {
        /** Written by the purchase API, not yet claimed. */
        PENDING,
        /** Claimed by a relay pod (leased); publish in flight. */
        SENDING,
        /** Successfully handed to RabbitMQ. Terminal. */
        PUBLISHED,
        /** Gave up after the max attempts. Terminal; logged for operator follow-up. */
        FAILED
    }

    @Id
    private String id;
    private Status status;
    private EarnEvent event;
    private Instant createdAt;
    private int attempts;
    /** Earliest time a failed-then-backed-off entry may be reclaimed; null for a fresh PENDING row. */
    private Instant nextAttemptAt;
    /** The relay pod currently leasing this row (null unless SENDING). */
    private String owner;
    /** When the current lease lapses so a crashed pod's claim can be reclaimed (null unless SENDING). */
    private Instant leaseExpiresAt;

    protected OutboxEntry() {
        // for Spring Data
    }

    private OutboxEntry(EarnEvent event, Instant createdAt) {
        this.status = Status.PENDING;
        this.event = event;
        this.createdAt = createdAt;
        this.attempts = 0;
        this.nextAttemptAt = createdAt;
    }

    /** A fresh PENDING entry embedding the full event payload. */
    public static OutboxEntry pending(EarnEvent event, Instant now) {
        return new OutboxEntry(event, now);
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public EarnEvent getEvent() {
        return event;
    }

    public void setEvent(EarnEvent event) {
        this.event = event;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public Instant getNextAttemptAt() {
        return nextAttemptAt;
    }

    public void setNextAttemptAt(Instant nextAttemptAt) {
        this.nextAttemptAt = nextAttemptAt;
    }

    public String getOwner() {
        return owner;
    }

    public void setOwner(String owner) {
        this.owner = owner;
    }

    public Instant getLeaseExpiresAt() {
        return leaseExpiresAt;
    }

    public void setLeaseExpiresAt(Instant leaseExpiresAt) {
        this.leaseExpiresAt = leaseExpiresAt;
    }
}
