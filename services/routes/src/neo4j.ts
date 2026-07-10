import neo4j, { type Driver } from "neo4j-driver";

// Every read gets a server-enforced transaction timeout: the gateway aborts its call at
// 2 s, so letting a traversal run longer only burns the database for an answer nobody
// is waiting for. Writes (seeding) get their own, longer bound at the call site.
export const READ_TIMEOUT_MS = 2000;

export function createDriver(url: string, credentials?: { username: string; password: string }): Driver {
  return neo4j.driver(
    url,
    credentials ? neo4j.auth.basic(credentials.username, credentials.password) : undefined,
    {
      disableLosslessIntegers: true, // km/min/counts all fit comfortably in JS numbers
      maxConnectionPoolSize: 50, // bounded: the gateway is the only caller
    },
  );
}

type Row = Record<string, unknown>;

export async function readQuery(
  driver: Driver,
  cypher: string,
  params: Row,
  timeoutMs: number = READ_TIMEOUT_MS,
): Promise<Row[]> {
  const session = driver.session();
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params), {
      timeout: timeoutMs,
    });
    return result.records.map((record) => record.toObject());
  } finally {
    await session.close();
  }
}

export async function writeQuery(
  driver: Driver,
  cypher: string,
  params: Row,
  timeoutMs: number,
): Promise<void> {
  const session = driver.session();
  try {
    await session.executeWrite((tx) => tx.run(cypher, params), { timeout: timeoutMs });
  } finally {
    await session.close();
  }
}

/** True when the error is the server terminating a transaction for exceeding its client-set timeout. */
export function isTransactionTimeout(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  return code.includes("TransactionTimedOut") || code.includes("TransactionTimeout");
}

/** Schema operations (CREATE CONSTRAINT/INDEX, awaitIndexes) must run auto-commit — Neo4j rejects them inside managed transactions. */
export async function runSchema(driver: Driver, cypher: string): Promise<void> {
  const session = driver.session();
  try {
    await session.run(cypher);
  } finally {
    await session.close();
  }
}
