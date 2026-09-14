import type { RemoteEnvName } from "./environment.ts";
import { STORAGE_MAPPER_NAME } from "./remote-paths.ts";

export const APP_USER = "hobproj";
export const APP_GROUP = "hobproj";
export const APP_SERVICE_PREFIX = "hobproj";
export const DEPLOY_GROUP_PREFIX = "hobproj-deploy";
export const OTEL_SERVICE_NAME = "hobproj";
export const OTEL_COLLECTOR_SERVICE_NAME = "hobproj-otelcol";
export const COMPILE_TARGET = "aarch64-unknown-linux-gnu";
export const USB_FILESYSTEM_LABEL = STORAGE_MAPPER_NAME;

export function appServiceName(
  env: RemoteEnvName,
  color: "blue" | "green",
): string {
  return `${APP_SERVICE_PREFIX}.${env}-${color}`;
}

export function legacyAppServiceName(env: RemoteEnvName): string {
  return `${APP_SERVICE_PREFIX}.${env}`;
}

export function deployGroupName(env: RemoteEnvName): string {
  return `${DEPLOY_GROUP_PREFIX}-${env}`;
}

export const REMOTE_PORTS = {
  staging: {
    proxy: "8124",
    blue: "8224",
    green: "8225",
  },
  prod: {
    proxy: "8123",
    blue: "8223",
    green: "8226",
  },
} as const satisfies Record<
  RemoteEnvName,
  {
    readonly proxy: string;
    readonly blue: string;
    readonly green: string;
  }
>;
