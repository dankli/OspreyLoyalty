// OpenTelemetry bootstrap — imported first in index.ts so tracing is active before
// the HTTP server and GraphQL layer load. Auto-instruments http, graphql and pino;
// exports OTLP traces to the collector (OTEL_EXPORTER_OTLP_ENDPOINT). Pino records
// pick up trace_id/span_id automatically, so gateway logs line up with Jaeger spans.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "gateway",
  }),
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
