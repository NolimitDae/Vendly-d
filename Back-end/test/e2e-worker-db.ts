// points this worker's suites at its own copy of the e2e database (see e2e-databases.ts)
import { workerDatabaseUrl } from './e2e-databases';

if (process.env.CONTRACTS_E2E_DATABASE_URL && process.env.JEST_WORKER_ID) {
  process.env.CONTRACTS_E2E_DATABASE_URL = workerDatabaseUrl(process.env.CONTRACTS_E2E_DATABASE_URL, process.env.JEST_WORKER_ID);
}
