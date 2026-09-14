import { getEnv } from "@shared/environment.ts";
import { traceKv } from "@shared/observability/kv.ts";

export * from "./keys.ts";

const kvPath = getEnv("KV_PATH");

// Unset → Deno's default per-project location; a path → SQLite file there.
// The `kv` unstable flag is enabled in deno.json.
const rawKv = await Deno.openKv(kvPath);

// Traced wrapper around the raw Deno.Kv instance — see
// @shared/observability/kv.ts for what the tracing actually adds.
export const kv = traceKv(rawKv);
