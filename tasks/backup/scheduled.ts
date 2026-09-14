import { run } from "../utils/run.ts";

const deno = Deno.execPath();

// Runs both the production database snapshot and the local env files
// backup in one call, in order: `backup-db prod` must complete before
// `backup-local-env` runs.
await run(deno, ["task", "backup"]);
