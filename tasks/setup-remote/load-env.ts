import { loadTaskEnvironment, SETUP_ENV_PATH } from "../utils/environment.ts";

// Loads `tasks/.env.tasks` merged with `tasks/setup-remote/.env.setup` and
// sets the result on the process environment. Used by `setup-remote`, which
// isn't tied to a single staging/prod environment.
export async function loadSetupEnv(): Promise<void> {
  await loadTaskEnvironment([{ path: SETUP_ENV_PATH }]);
}
