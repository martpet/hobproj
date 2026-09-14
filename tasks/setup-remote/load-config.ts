import { optionalEnvValue, parseBooleanEnvValue } from "@shared/environment.ts";
import { ALLOW_PLAINTEXT_STORAGE_MIGRATION_ENV } from "./constants.ts";

export interface Config {
  readonly allowPlaintextStorageMigration: boolean;
  readonly sshAllowedSubnet: string;
  readonly deployStagingUsers: string[];
  readonly deployProdUsers: string[];
  readonly stagingKeepIdleRunning: boolean;
  readonly prodKeepIdleRunning: boolean;
  readonly stagingAppOrigin: string;
  readonly prodAppOrigin: string;
  readonly stagingOtelEnabled: boolean;
  readonly prodOtelEnabled: boolean;
  readonly stagingCloudflarePurgeCacheEnabled: boolean;
  readonly prodCloudflarePurgeCacheEnabled: boolean;
  readonly otelCollectorVersion: string;
  readonly otelCollectorExportEndpoint?: string;
  readonly otelCollectorExportProtocol: string;
}

export async function loadConfig(): Promise<Config> {
  const configPath = "./.env.setup-remote";
  const text = await Deno.readTextFile(configPath);
  const env: Record<string, string> = {};

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  function required(key: string): string {
    const value = env[key];
    if (!value) throw new Error(`Missing required config key: ${key}`);
    return value;
  }

  return {
    allowPlaintextStorageMigration: parseBooleanEnvValue(
      env[ALLOW_PLAINTEXT_STORAGE_MIGRATION_ENV],
    ),
    sshAllowedSubnet: required("SSH_ALLOWED_SUBNET"),
    deployStagingUsers: splitUsers(env.DEPLOY_STAGING_USERS),
    deployProdUsers: splitUsers(env.DEPLOY_PROD_USERS),
    stagingKeepIdleRunning: parseBooleanEnvValue(
      env.STAGING_KEEP_IDLE_RUNNING,
    ),
    prodKeepIdleRunning: parseBooleanEnvValue(env.PROD_KEEP_IDLE_RUNNING),
    stagingAppOrigin: required("STAGING_APP_ORIGIN"),
    prodAppOrigin: required("PROD_APP_ORIGIN"),
    stagingOtelEnabled: parseBooleanEnvValue(env.STAGING_OTEL_ENABLED),
    prodOtelEnabled: parseBooleanEnvValue(env.PROD_OTEL_ENABLED),
    stagingCloudflarePurgeCacheEnabled: parseBooleanEnvValue(
      env.STAGING_CLOUDFLARE_PURGE_CACHE_ENABLED ??
        env.STAGING_CLOUDFLARE_ENABLED,
    ),
    prodCloudflarePurgeCacheEnabled: parseBooleanEnvValue(
      env.PROD_CLOUDFLARE_PURGE_CACHE_ENABLED ?? env.PROD_CLOUDFLARE_ENABLED,
    ),
    otelCollectorVersion: optionalEnvValue(env.OTEL_COLLECTOR_VERSION) ??
      "0.111.0",
    otelCollectorExportEndpoint: optionalEnvValue(
      env.OTEL_COLLECTOR_EXPORT_ENDPOINT,
    ),
    otelCollectorExportProtocol:
      optionalEnvValue(env.OTEL_COLLECTOR_EXPORT_PROTOCOL) ??
        "http/protobuf",
  };
}

function splitUsers(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u !== "");
}
