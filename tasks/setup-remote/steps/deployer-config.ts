import { ETC_ROOT, REMOTE_PATHS } from "../../utils/remote-paths.ts";
import {
  REMOTE_ENV_NAMES,
  type RemoteEnvName,
} from "../../utils/environment.ts";
import {
  APP_GROUP,
  appCredentialsDir,
  appServiceName,
  REMOTE_PORTS,
} from "../../utils/infrastructure.ts";
import { APP_OTEL_ENDPOINT, COLORS } from "../constants.ts";
import type { Config } from "../load-config.ts";
import { ensureFile, type StepResult } from "../step-helpers.ts";

export async function ensureDeployerConfigFiles(
  config: Config,
): Promise<StepResult[]> {
  // Cloudflare zone/token are no longer written here; the deployer reads
  // them itself via `systemd-creds decrypt` at deploy time.
  const commonDeployerEnv = [
    "BINARY=./bin",
    "",
  ].join("\n");

  const results = [
    await ensureFile(
      `${REMOTE_PATHS.deployer}/.env.deployer`,
      commonDeployerEnv,
      "root",
      APP_GROUP,
      "640",
    ),
  ];

  const keepIdleRunning: Record<RemoteEnvName, boolean> = {
    staging: config.stagingKeepIdleRunning,
    prod: config.prodKeepIdleRunning,
  };
  const otelEnabledForDeployer: Record<RemoteEnvName, boolean> = {
    staging: config.stagingOtelEnabled,
    prod: config.prodOtelEnabled,
  };
  const cloudflarePurgeCacheEnabledForDeployer: Record<RemoteEnvName, boolean> =
    {
      staging: config.stagingCloudflarePurgeCacheEnabled,
      prod: config.prodCloudflarePurgeCacheEnabled,
    };

  for (const env of REMOTE_ENV_NAMES) {
    const appPath = `${REMOTE_PATHS.app}/${env}`;
    const etcEnvRoot = `${ETC_ROOT}/${env}`;
    const allowNetEntries: string[] = [];
    if (otelEnabledForDeployer[env]) {
      allowNetEntries.push(APP_OTEL_ENDPOINT.replace(/^https?:\/\//, ""));
    }
    if (cloudflarePurgeCacheEnabledForDeployer[env]) {
      allowNetEntries.push("api.cloudflare.com:443");
    }

    // Absolute (rather than the previous relative `./db`) since each
    // color's `WorkingDirectory` is now its own subdirectory, while the KV
    // store stays shared at `${appPath}/db` across both colors.
    const envDeployerEnv = [
      `ENV_NAME=${env}`,
      `APP_PATH=${appPath}`,
      `UPLOAD_PATH=${REMOTE_PATHS.upload}/${env}`,
      `ALLOW_READ=${
        [
          `${REMOTE_PATHS.storageMount}/${env}/db`,
          REMOTE_PATHS.geoip,
          // The KV encryption key, in whichever color's unit the binary ends
          // up running as.
          ...COLORS.map((color) => appCredentialsDir(env, color)),
        ].join(",")
      }`,
      `ALLOW_WRITE=${REMOTE_PATHS.storageMount}/${env}/db`,
      `BLUE_PORT=${REMOTE_PORTS[env].blue}`,
      `GREEN_PORT=${REMOTE_PORTS[env].green}`,
      `SERVICE_BLUE=${appServiceName(env, "blue")}`,
      `SERVICE_GREEN=${appServiceName(env, "green")}`,
      `SERVER_CACHE_PATH_BLUE=${REMOTE_PATHS.cache}/${env}/blue/.local/share/bin.tmp/web_cache`,
      `SERVER_CACHE_PATH_GREEN=${REMOTE_PATHS.cache}/${env}/green/.local/share/bin.tmp/web_cache`,
      `DENO_DIR=${REMOTE_PATHS.cache}/${env}/deno`,
      `ACTIVE_COLOR_FILE=${etcEnvRoot}/active-color`,
      `CADDY_SNIPPET_FILE=${etcEnvRoot}/active-upstream.caddy`,
      `KEEP_IDLE_RUNNING=${keepIdleRunning[env]}`,
      // Deno's OTLP exporter makes outbound requests to the local collector,
      // which needs its own `--allow-net` grant distinct from the app's own
      // listening port. Only added when this environment's app telemetry
      // export is enabled, so `--allow-net` stays minimal otherwise.
      //
      // `deno compile` bakes OTEL tracing/metrics support into the binary
      // itself based on the environment present *at compile time*; setting
      // `OTEL_DENO=true` only in the runtime systemd EnvironmentFile is not
      // enough; it must also be set here, for the deployer to forward into
      // the `deno compile` step (see `compileSource` in `deployer.ts`).
      ...(allowNetEntries.length > 0
        ? [`ALLOW_NET=${allowNetEntries.join(",")}`]
        : []),
      ...(otelEnabledForDeployer[env] ? ["OTEL_ENABLED=true"] : []),
      ...(cloudflarePurgeCacheEnabledForDeployer[env]
        ? ["CLOUDFLARE_PURGE_CACHE_ENABLED=true"]
        : []),
      "",
    ].join("\n");

    results.push(
      await ensureFile(
        `${REMOTE_PATHS.deployer}/${env}/.env.deployer`,
        envDeployerEnv,
        "root",
        APP_GROUP,
        "640",
      ),
    );
  }

  return results;
}
