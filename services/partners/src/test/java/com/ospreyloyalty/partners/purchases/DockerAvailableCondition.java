package com.ospreyloyalty.partners.purchases;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.testcontainers.DockerClientFactory;

/**
 * Disables a test class when no usable Docker environment is reachable, so the Testcontainers-backed
 * outbox integration tests are <em>skipped</em> (not errored) on machines without Docker — keeping
 * {@code mvnw test} green — while still running fully where Docker is available (CI, local Docker).
 *
 * <p>Runs as a JUnit {@link ExecutionCondition}, which is evaluated <em>before</em> the
 * {@code @Testcontainers} extension tries to start any container, so an unreachable/incompatible
 * Docker daemon turns into a clean skip rather than a container-startup error.
 */
public class DockerAvailableCondition implements ExecutionCondition {

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        try {
            if (DockerClientFactory.instance().isDockerAvailable()) {
                return ConditionEvaluationResult.enabled("Docker is available");
            }
        } catch (RuntimeException | LinkageError ignored) {
            // fall through to disabled
        }
        return ConditionEvaluationResult.disabled(
                "Docker not available for Testcontainers; skipping live-Mongo outbox integration test");
    }
}
