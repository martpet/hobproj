import { run } from "../../utils/run.ts";
import {
  ETC_ROOT,
  EXECUTABLE_PATHS,
  SYSTEM_PATHS,
} from "../../utils/remote-paths.ts";
import {
  APP_GROUP,
  APP_USER,
  OTEL_COLLECTOR_SERVICE_NAME,
  OTEL_SERVICE_NAME,
} from "../../utils/infrastructure.ts";
import type { Config } from "../load-config.ts";
import { credentialPath } from "../secrets.ts";
import { ensureFile, pathExists, type StepResult } from "../step-helpers.ts";

const OTELCOL_CONFIG = `${ETC_ROOT}/otelcol.yaml`;
const OTELCOL_AUTH_SECRET = "otel_collector_export_authorization";

export async function ensureOpenTelemetryCollector(
  config: Config,
): Promise<StepResult[]> {
  if (!config.otelCollectorExportEndpoint) {
    return [{
      label: "OpenTelemetry Collector",
      changed: false,
      detail: "off",
    }];
  }

  const results: StepResult[] = [];
  const binaryResult = await ensureOtelCollectorBinary(
    config.otelCollectorVersion,
  );
  results.push(binaryResult);

  const hasAuthorization = await pathExists(
    credentialPath(OTELCOL_AUTH_SECRET),
  );
  const configContent = buildOtelCollectorConfig(config, hasAuthorization);
  const configResult = await ensureFile(
    OTELCOL_CONFIG,
    configContent,
    "root",
    APP_GROUP,
    "640",
  );
  results.push({
    label: "OpenTelemetry Collector config",
    changed: configResult.changed,
  });

  const authUnitLines = hasAuthorization
    ? [
      `LoadCredentialEncrypted=${OTELCOL_AUTH_SECRET}:${
        credentialPath(OTELCOL_AUTH_SECRET)
      }`,
      `ExecStart=${EXECUTABLE_PATHS.shell} -c "OTEL_COLLECTOR_EXPORT_AUTHORIZATION=$$(${EXECUTABLE_PATHS.cat} \${CREDENTIALS_DIRECTORY}/otel_collector_export_authorization) ` +
      `exec ${EXECUTABLE_PATHS.otelcol} --config=${OTELCOL_CONFIG}"`,
    ]
    : [`ExecStart=${EXECUTABLE_PATHS.otelcol} --config=${OTELCOL_CONFIG}`];

  const unit = [
    "[Unit]",
    "Description=OpenTelemetry Collector for Hobproj",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `User=${APP_USER}`,
    `Group=${APP_GROUP}`,
    ...authUnitLines,
    "Restart=always",
    "RestartSec=5s",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "ProtectHome=true",
    "ProtectSystem=strict",
    "StandardOutput=journal",
    "StandardError=journal",
    `SyslogIdentifier=${OTEL_COLLECTOR_SERVICE_NAME}`,
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");

  const unitResult = await ensureFile(
    `${SYSTEM_PATHS.systemdUnits}/${OTEL_COLLECTOR_SERVICE_NAME}.service`,
    unit,
    "root",
    "root",
    "644",
  );
  results.push({
    label: `systemd unit ${OTEL_COLLECTOR_SERVICE_NAME}`,
    changed: unitResult.changed,
  });

  if (binaryResult.changed || configResult.changed || unitResult.changed) {
    await run("systemctl", ["daemon-reload"]);
    await run("systemctl", ["restart", OTEL_COLLECTOR_SERVICE_NAME]);
  } else {
    const { code } = await run(
      "systemctl",
      ["is-active", "--quiet", OTEL_COLLECTOR_SERVICE_NAME],
      { check: false, stdin: "null" },
    );
    if (code !== 0) {
      await run("systemctl", ["start", OTEL_COLLECTOR_SERVICE_NAME]);
    }
  }

  const { code: enabledCode } = await run(
    "systemctl",
    ["is-enabled", OTEL_COLLECTOR_SERVICE_NAME],
    { stdout: "piped", check: false },
  );
  if (enabledCode !== 0) {
    await run("systemctl", ["enable", OTEL_COLLECTOR_SERVICE_NAME]);
    results.push({
      label: "OpenTelemetry Collector enabled",
      changed: true,
    });
  }

  return results;
}

async function ensureOtelCollectorBinary(version: string): Promise<StepResult> {
  const currentVersion = await readOtelCollectorVersion();
  if (currentVersion === version) {
    return { label: `OpenTelemetry Collector ${version}`, changed: false };
  }

  const tmpDir = await Deno.makeTempDir({ prefix: "hobproj-otelcol-" });
  try {
    const archive = `${tmpDir}/otelcol.tar.gz`;
    const url =
      `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${version}/otelcol_${version}_linux_arm64.tar.gz`;

    await run("curl", ["-fsSL", "-o", archive, url]);
    await run("tar", ["-xzf", archive, "-C", tmpDir, "otelcol"]);
    await run("install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "755",
      `${tmpDir}/otelcol`,
      EXECUTABLE_PATHS.otelcol,
    ]);

    return { label: `OpenTelemetry Collector ${version}`, changed: true };
  } finally {
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  }
}

async function readOtelCollectorVersion(): Promise<string | undefined> {
  if (!await pathExists(EXECUTABLE_PATHS.otelcol)) return undefined;

  const { code, stdout } = await run(EXECUTABLE_PATHS.otelcol, ["--version"], {
    stdout: "piped",
    check: false,
  });
  if (code !== 0) return undefined;

  return stdout.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
}

function buildOtelCollectorConfig(
  config: Config,
  hasAuthorization: boolean,
): string {
  const exporter = config.otelCollectorExportProtocol === "grpc"
    ? "otlp"
    : "otlphttp";
  const headerLines = hasAuthorization
    ? [
      "    headers:",
      '      Authorization: "${env:OTEL_COLLECTOR_EXPORT_AUTHORIZATION}"',
    ]
    : [];

  return [
    "receivers:",
    "  otlp:",
    "    protocols:",
    "      grpc:",
    "        endpoint: 127.0.0.1:4317",
    "      http:",
    "        endpoint: 127.0.0.1:4318",
    "",
    "processors:",
    "  memory_limiter:",
    "    check_interval: 1s",
    "    limit_mib: 128",
    "    spike_limit_mib: 32",
    "  resource:",
    "    attributes:",
    "      - key: service.namespace",
    `        value: ${OTEL_SERVICE_NAME}`,
    "        action: upsert",
    "      - key: host.type",
    "        value: raspberry-pi",
    "        action: upsert",
    "  batch:",
    "    timeout: 5s",
    "    send_batch_size: 512",
    "",
    "exporters:",
    `  ${exporter}:`,
    `    endpoint: ${yamlQuote(config.otelCollectorExportEndpoint!)}`,
    ...headerLines,
    "",
    "service:",
    "  pipelines:",
    "    traces:",
    "      receivers: [otlp]",
    `      processors: [memory_limiter, resource, batch]`,
    `      exporters: [${exporter}]`,
    "    metrics:",
    "      receivers: [otlp]",
    `      processors: [memory_limiter, resource, batch]`,
    `      exporters: [${exporter}]`,
    "    logs:",
    "      receivers: [otlp]",
    `      processors: [memory_limiter, resource, batch]`,
    `      exporters: [${exporter}]`,
    "",
  ].join("\n");
}

function yamlQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
