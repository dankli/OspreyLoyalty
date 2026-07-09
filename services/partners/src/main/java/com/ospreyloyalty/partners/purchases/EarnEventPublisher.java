package com.ospreyloyalty.partners.purchases;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapSetter;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

/** Thin seam over RabbitTemplate so controller tests can verify publishes without a broker. */
@Component
public class EarnEventPublisher {

    public static final String QUEUE = "earn-events";

    // The OTel Spring Boot starter instruments web/JDBC/Mongo but NOT Spring AMQP, so we open the
    // producer span ourselves and inject the W3C trace context into the message headers. Members'
    // RabbitMQ.Client 7 consumer extracts traceparent from those headers, stitching the two services
    // into one distributed trace: partners publish -> broker -> members consume -> Mongo.
    private static final TextMapSetter<MessageProperties> SETTER = (props, key, value) -> {
        if (props != null) {
            props.setHeader(key, value);
        }
    };

    private final RabbitTemplate rabbit;
    private final OpenTelemetry openTelemetry;
    private final Tracer tracer;

    public EarnEventPublisher(RabbitTemplate rabbit, OpenTelemetry openTelemetry) {
        this.rabbit = rabbit;
        this.openTelemetry = openTelemetry;
        this.tracer = openTelemetry.getTracer("com.ospreyloyalty.partners.purchases");
    }

    public void publish(EarnEvent event) {
        Span span = tracer.spanBuilder(QUEUE + " publish")
                .setSpanKind(SpanKind.PRODUCER)
                .setAttribute("messaging.system", "rabbitmq")
                .setAttribute("messaging.destination.name", QUEUE)
                .setAttribute("messaging.operation", "publish")
                .startSpan();
        try (Scope scope = span.makeCurrent()) {
            rabbit.convertAndSend(QUEUE, event, message -> {
                openTelemetry.getPropagators().getTextMapPropagator()
                        .inject(Context.current(), message.getMessageProperties(), SETTER);
                return message;
            });
        } catch (RuntimeException ex) {
            span.setStatus(StatusCode.ERROR);
            span.recordException(ex);
            throw ex;
        } finally {
            span.end();
        }
    }
}
