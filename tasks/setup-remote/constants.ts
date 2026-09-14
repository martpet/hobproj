// Constants shared across multiple files in `tasks/setup-remote/steps/`.
// Paths also needed outside `setup-remote/` (e.g. by `tasks/deploy/`) belong
// in `../utils/remote-paths.ts` instead; a constant used by only one step
// file should stay local to that file.
//
// Deployable env names (`REMOTE_ENV_NAMES`/`RemoteEnvName`) are defined in
// `../utils/environment.ts` instead, since they're also needed outside
// `setup-remote/`.

export const COLORS = ["blue", "green"] as const;
export type Color = (typeof COLORS)[number];

export const APP_OTEL_ENDPOINT = "http://127.0.0.1:4318";
export const ALLOW_PLAINTEXT_STORAGE_MIGRATION_ENV =
  "ALLOW_PLAINTEXT_STORAGE_MIGRATION";
