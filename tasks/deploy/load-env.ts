import {
  DEPLOY_ENV_PATH,
  loadTaskEnvironment,
  REMOTE_ENV_NAMES,
  type RemoteEnvName,
} from "../utils/environment.ts";

const DEFAULT_ENV: RemoteEnvName = "staging";

// Loads `tasks/.env.tasks` and the optional `tasks/deploy/.env.deploy`, then
// returns the env name. Called first since everything else reads env.
export async function loadEnv(): Promise<RemoteEnvName> {
  const envName = Deno.args[0] ?? DEFAULT_ENV;

  if (!REMOTE_ENV_NAMES.includes(envName as RemoteEnvName)) {
    const envsList = REMOTE_ENV_NAMES.join();
    console.error(`Error: Invalid arg '${envName}'. Must be ${envsList}.`);
    Deno.exit(1);
  }

  await loadTaskEnvironment([{ path: DEPLOY_ENV_PATH, required: false }]);

  return envName as RemoteEnvName;
}
