import type { EnvName } from "@shared/environment.ts";
import { load } from "@std/dotenv";
import { exists } from "@std/fs";

// The subset of `EnvName` that tasks (deploy, setup-remote, backup) operate
// on; "dev" is a local-only app environment, never a target on a remote
// server. Tied to `EnvName` via `satisfies` so this list cannot silently
// drift from it.
export const REMOTE_ENV_NAMES = [
  "staging",
  "prod",
] as const satisfies readonly EnvName[];
export type RemoteEnvName = (typeof REMOTE_ENV_NAMES)[number];

export const TASK_ENV_PATH = "tasks/.env.tasks";
export const BACKUP_ENV_PATH = "tasks/backup/.env.backup";
export const DEPLOY_ENV_PATH = "tasks/deploy/.env.deploy";
export const SETUP_ENV_PATH = "tasks/setup-remote/.env.setup";

export interface TaskEnvFile {
  readonly path: string;
  readonly required?: boolean;
}

// Loads a single env file into a plain object. By default exits with an
// error if the file doesn't exist; pass `{ required: false }` to instead
// return an empty object for a missing file.
export async function loadEnvFile(
  path: string,
  options: { required?: boolean } = {},
): Promise<Record<string, string>> {
  const required = options.required ?? true;

  if (!await exists(path)) {
    if (!required) {
      return {};
    }
    console.log(`Error: File '${path}' doesn't exist`);
    Deno.exit(1);
  }

  return await load({ envPath: path });
}

// Sets each entry of `env` on the process environment.
export function applyEnv(env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    Deno.env.set(key, value);
  }
}

export async function loadTaskEnvironment(
  files: readonly TaskEnvFile[],
  options: {
    readonly preserveExisting?: boolean;
    readonly ignoreEmpty?: boolean;
  } = {},
): Promise<void> {
  for (const file of [{ path: TASK_ENV_PATH }, ...files]) {
    const env = await loadEnvFile(file.path, { required: file.required });
    for (const [key, value] of Object.entries(env)) {
      if (options.ignoreEmpty && value === "") continue;
      if (options.preserveExisting && Deno.env.get(key) !== undefined) continue;
      Deno.env.set(key, value);
    }
  }
}
