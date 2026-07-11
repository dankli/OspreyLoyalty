/** All runtime configuration in one place, mirroring the gateway's env module. */
export const env = {
  port: Number(process.env.PORT ?? 8084),
  rabbitmqHost: process.env.RABBITMQ_HOST ?? "localhost",
  rabbitmqPort: Number(process.env.RABBITMQ_PORT ?? 5672),
  rabbitmqUser: process.env.RABBITMQ_USER ?? "guest",
  rabbitmqPassword: process.env.RABBITMQ_PASSWORD ?? "guest",
  membersUrl: process.env.MEMBERS_URL ?? "http://localhost:5080",
  smtpUrl: process.env.SMTP_URL ?? "smtp://localhost:1025",
  mailFrom: process.env.MAIL_FROM ?? "loyalty@osprey.example",
};
