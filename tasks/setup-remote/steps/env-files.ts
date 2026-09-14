import {
  REMOTE_ENV_NAMES,
  type RemoteEnvName,
} from "../../utils/environment.ts";
import { ETC_ROOT, REMOTE_PATHS } from "../../utils/remote-paths.ts";
import { APP_GROUP, OTEL_SERVICE_NAME } from "../../utils/infrastructure.ts";
import { APP_OTEL_ENDPOINT } from "../constants.ts";
import type { Config } from "../load-config.ts";
import { ensureFile, type StepResult } from "../step-helpers.ts";

const APP_OTEL_PROTOCOL = "http/protobuf";

export async function ensureEtcHobprojEnvFiles(
  config: Config,
): Promise<StepResult[]> {
  const commonEnv = [
    "SERVER_CACHE_ENABLED=true",
    `MAXMIND_DB_PATH=${REMOTE_PATHS.geoipDatabase}`,
    "",
  ].join("\n");

  const results = [
    await ensureFile(
      `${ETC_ROOT}/common.env`,
      commonEnv,
      "root",
      APP_GROUP,
      "640",
    ),
  ];

  const origins: Record<RemoteEnvName, string> = {
    staging: config.stagingAppOrigin,
    prod: config.prodAppOrigin,
  };
  const otelEnabled: Record<RemoteEnvName, boolean> = {
    staging: config.stagingOtelEnabled,
    prod: config.prodOtelEnabled,
  };
  for (const env of REMOTE_ENV_NAMES) {
    const appPath = `${REMOTE_PATHS.storageMount}/${env}`;
    // `KV_PATH` is absolute (rather than the previous `./db/kv.sqlite`)
    // because each color now has its own `WorkingDirectory`
    // (`${appPath}/<color>`), while the KV store itself stays shared at
    // `${appPath}/db` across both colors.
    const envLines = [
      `ENV_NAME=${env}`,
      `KV_PATH=${appPath}/db/kv.sqlite`,
      `APP_ORIGIN=${origins[env]}`,
    ];

    if (otelEnabled[env]) {
      envLines.push(
        "OTEL_DENO=true",
        `OTEL_SERVICE_NAME=${OTEL_SERVICE_NAME}`,
        `OTEL_EXPORTER_OTLP_ENDPOINT=${APP_OTEL_ENDPOINT}`,
        `OTEL_EXPORTER_OTLP_PROTOCOL=${APP_OTEL_PROTOCOL}`,
        // Both conventions are set: `deployment.environment.name` is current
        // OTel semantic convention; `deployment.environment` is the older one
        // some backends (e.g. Grafana Cloud's connection test) still check.
        `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=${env},deployment.environment=${env}`,
      );
    }

    const envContent = [...envLines, ""].join("\n");

    results.push(
      await ensureFile(
        `${ETC_ROOT}/${env}.env`,
        envContent,
        "root",
        APP_GROUP,
        "640",
      ),
    );
  }

  return results;
}
