package com.ospreyloyalty.partners.purchases;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/** Thin seam over RabbitTemplate so controller tests can verify publishes without a broker. */
@Component
public class EarnEventPublisher {

    public static final String QUEUE = "earn-events";

    private final RabbitTemplate rabbit;

    public EarnEventPublisher(RabbitTemplate rabbit) {
        this.rabbit = rabbit;
    }

    public void publish(EarnEvent event) {
        rabbit.convertAndSend(QUEUE, event);
    }
}
