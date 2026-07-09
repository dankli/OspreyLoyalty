package com.ospreyloyalty.partners.purchases;

import org.springframework.data.mongodb.repository.MongoRepository;

/**
 * Spring Data repository over the {@code outbox} collection. Plain CRUD only; the atomic
 * claim (findAndModify PENDING -> SENDING with a lease) lives in {@link OutboxRelay} because
 * it needs {@code MongoOperations} for the update-and-return semantics repositories don't offer.
 *
 * <p>Note: NO derived unique constraint on the business idempotencyKey — entries are keyed by
 * their own {@code _id} so the duplicate-demo can write two rows for the same key (ADR-0016).
 */
public interface OutboxRepository extends MongoRepository<OutboxEntry, String> {
}
