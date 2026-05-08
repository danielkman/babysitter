import { Pool, type QueryResultRow } from "pg";
import { ATLAS_WEBUI_SCHEMA_SQL } from "./db-schema";

declare global {
  // eslint-disable-next-line no-var
  var __atlasWebuiPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __atlasWebuiSchemaReady: Promise<void> | undefined;
}

export function isDatabaseConfigured(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

export function getDbPool(): Pool {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured. Private workspace features are unavailable.");
  }
  if (!global.__atlasWebuiPgPool) {
    global.__atlasWebuiPgPool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: 10,
    });
  }
  return global.__atlasWebuiPgPool;
}

export async function ensureDatabaseSchema(): Promise<void> {
  if (!global.__atlasWebuiSchemaReady) {
    global.__atlasWebuiSchemaReady = getDbPool()
      .query(ATLAS_WEBUI_SCHEMA_SQL)
      .then(() => undefined);
  }
  return global.__atlasWebuiSchemaReady;
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  await ensureDatabaseSchema();
  const result = await getDbPool().query<T>(text, values);
  return result.rows;
}

export async function queryRow<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(text, values);
  return rows[0] ?? null;
}

export async function execute(text: string, values: unknown[] = []): Promise<void> {
  await ensureDatabaseSchema();
  await getDbPool().query(text, values);
}
