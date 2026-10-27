/**
 * Each parallel e2e worker gets its own copy of the migrated database, so one suite's jobs (charging
 * what's due, closing unanswered requests, cancelling unpaid bookings) never touch another suite's
 * bookings mid-test. Copies are made from CONTRACTS_E2E_DATABASE_URL as a template, which is quick.
 */
import { Client } from 'pg';

export const workerDatabaseUrl = (url: string, worker: string | number) => {
  const u = new URL(url);
  u.pathname = `${u.pathname}_w${worker}`;
  return u.toString();
};

export default async function setup(globalConfig: { maxWorkers: number }) {
  const url = process.env.CONTRACTS_E2E_DATABASE_URL;
  if (!url) return;
  const source = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    for (let w = 1; w <= Math.max(1, globalConfig.maxWorkers); w++) {
      const name = `${source}_w${w}`;
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await client.query(`CREATE DATABASE "${name}" TEMPLATE "${source}"`);
    }
  } finally {
    await client.end();
  }
}
