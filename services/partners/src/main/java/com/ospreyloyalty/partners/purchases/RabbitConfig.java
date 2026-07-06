package com.ospreyloyalty.partners.purchases;

import java.util.Map;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/** Mirrors ConsumeEarnEvents.Topology in services/members — keep in sync by hand. */
@Configuration
public class RabbitConfig {

    @Bean
    MessageConverter jsonConverter() {
        ObjectMapper mapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        return new Jackson2JsonMessageConverter(mapper);
    }

    @Bean
    Declarables earnTopology() {
        Queue dead = new Queue("earn-events.dead", true, false, false);
        Queue main = new Queue(EarnEventPublisher.QUEUE, true, false, false, Map.of(
            "x-queue-type", "quorum",
            "x-delivery-limit", 5,
            "x-dead-letter-exchange", "",
            "x-dead-letter-routing-key", "earn-events.dead"));
        return new Declarables(dead, main);
    }
}
