import "./otel.js"; // must be first — starts tracing before anything else loads
import { createServer } from "node:http";
import amqplib from "amqplib";
import pino from "pino";
import { Counter, Registry, collectDefaultMetrics } from "prom-client";
import { env } from "./env.js";
import { createSeenSet, declareTopology, handleDelivery, QUEUE } from "./consumer.js";
import { createSmtpSender } from "./mailer.js";
import { fetchMemberEmail } from "./membersClient.js";

const logger = pino();
const registry = new Registry();
collectDefaultMetrics({ register: registry });
const handled = new Counter({
  name: "notifications_handled_total",
  help: "Member events handled, by outcome",
  labelNames: ["outcome"] as const,
  registers: [registry],
});

// Health + metrics surface for probes and Prometheus.
const server = createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (path === "/metrics") {
    res.writeHead(200, { "content-type": registry.contentType });
    res.end(await registry.metrics());
    return;
  }
  res.writeHead(404).end();
});
server.listen(env.port, () => logger.info({ port: env.port }, "notifications listening"));

const deps = {
  fetchMemberEmail,
  sendMail: createSmtpSender(),
  markSeen: createSeenSet(),
  log: logger,
};

const RECONNECT_DELAY_MS = 3_000;

/**
 * Consume loop with the same bootstrap contract as the members earn consumer: wait for
 * the broker, declare idempotent topology, then hand every delivery to handleDelivery
 * and map its decision to ack/nack. A dropped connection loops back to reconnect.
 */
async function run(): Promise<void> {
  for (;;) {
    try {
      const connection = await amqplib.connect({
        hostname: env.rabbitmqHost,
        port: env.rabbitmqPort,
        username: env.rabbitmqUser,
        password: env.rabbitmqPassword,
      });
      const channel = await connection.createChannel();
      await declareTopology(channel);
      await channel.prefetch(8); // bounded in-flight work

      await channel.consume(QUEUE, (message) => {
        if (message === null) return;
        void handleDelivery(message.fields.routingKey, message.content, deps)
          .then((decision) => {
            handled.inc({ outcome: decision });
            if (decision === "ack") channel.ack(message);
            else if (decision === "dead-letter") channel.nack(message, false, false);
            else channel.nack(message, false, true);
          })
          .catch((error: unknown) => {
            logger.error({ err: error }, "Transient failure handling member event — requeueing.");
            handled.inc({ outcome: "requeue" });
            channel.nack(message, false, true);
          });
      });

      logger.info({ queue: QUEUE }, "consuming member events");
      await new Promise<void>((resolve) => {
        connection.on("close", () => resolve());
        connection.on("error", () => resolve());
      });
      logger.warn({}, "RabbitMQ connection lost — reconnecting.");
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "RabbitMQ not reachable yet. Retrying.");
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }
}

void run();
