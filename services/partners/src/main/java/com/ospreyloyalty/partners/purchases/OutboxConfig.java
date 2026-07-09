package com.ospreyloyalty.partners.purchases;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Wires the transactional-outbox pieces (ADR-0016): a UTC {@link Clock} (injectable so tests can
 * pin time) and {@code @EnableScheduling} so {@link OutboxRelay}'s {@code @Scheduled} drain runs.
 */
@Configuration
@EnableScheduling
public class OutboxConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
