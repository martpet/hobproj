import { run } from "../../utils/run.ts";
import { REMOTE_PATHS, SYSTEM_PATHS } from "../../utils/remote-paths.ts";
import { REMOTE_ENV_NAMES } from "../../utils/environment.ts";
import { COLORS } from "../constants.ts";
import { ETC_ROOT } from "../../utils/remote-paths.ts";
import {
  APP_GROUP,
  APP_USER,
  appServiceName,
  legacyAppServiceName,
  REMOTE_PORTS,
} from "../../utils/infrastructure.ts";
import { ensureFile, pathExists, type StepResult } from "../step-helpers.ts";

export async function ensureSystemdAppUnits(): Promise<StepResult[]> {
  const results: StepResult[] = [];
  let anyChanged = false;

  for (const env of REMOTE_ENV_NAMES) {
    const appPath = `${REMOTE_PATHS.app}/${env}`;

    for (const color of COLORS) {
      const colorPath = `${appPath}/${color}`;
      const colorHome = `${REMOTE_PATHS.cache}/${env}/${color}`;
      const serviceName = appServiceName(env, color);
      const unit = [
        "[Unit]",
        `Description=Hobproj ${
          env === "prod" ? "production" : env
        } web application (${color})`,
        "After=network-online.target",
        "Wants=network-online.target",
        `ConditionPathIsMountPoint=${REMOTE_PATHS.storageMount}`,
        `RequiresMountsFor=${REMOTE_PATHS.storageMount}`,
        "",
        "[Service]",
        "Type=simple",
        `User=${APP_USER}`,
        `Group=${APP_GROUP}`,
        `WorkingDirectory=${colorPath}`,
        `ExecStart=${colorPath}/bin`,
        `EnvironmentFile=${ETC_ROOT}/common.env`,
        `EnvironmentFile=${ETC_ROOT}/${env}.env`,
        // Override the shared env file's values with this color's own port
        // and HOME. HOME is per-color (not per-env) because Deno's Cache
        // API storage is derived from it, and the two colors must never
        // share that on-disk cache — otherwise wiping one color's cache
        // before a build would also wipe the other, currently-live color's
        // cache.
        `Environment=APP_PORT=${REMOTE_PORTS[env][color]}`,
        `Environment=HOME=${colorHome}`,
        `EnvironmentFile=${colorPath}/.deployment-id`,
        "Restart=always",
        "RestartSec=5s",
        // Give the graceful-shutdown SIGTERM handler in main.ts real time
        // to drain in-flight requests before systemd escalates to SIGKILL.
        "TimeoutStopSec=30s",
        "StandardOutput=journal",
        "StandardError=journal",
        `SyslogIdentifier=${serviceName.replace(".", "-")}`,
        "NoNewPrivileges=true",
        "PrivateTmp=true",
        "ProtectHome=true",
        "ProtectSystem=strict",
        `ReadWritePaths=${REMOTE_PATHS.storageMount}/${env}/db ${colorHome}`,
        "",
        "[Install]",
        "WantedBy=multi-user.target",
        "",
      ].join("\n");

      const unitPath = `${SYSTEM_PATHS.systemdUnits}/${serviceName}.service`;
      const result = await ensureFile(unitPath, unit, "root", "root", "644");
      results.push({
        label: `systemd unit ${serviceName}`,
        changed: result.changed,
      });
      if (result.changed) anyChanged = true;

      const { code: enabledCode } = await run(
        "systemctl",
        ["is-enabled", serviceName],
        { stdout: "piped", check: false },
      );
      if (enabledCode !== 0) {
        await run("systemctl", ["enable", serviceName]);
        anyChanged = true;
      }
    }
  }

  if (anyChanged) {
    await run("systemctl", ["daemon-reload"]);
  }

  return results;
}

// Removes the old pre-blue/green `hobproj.<env>.service` units (bound
// directly to the public port), which would otherwise keep running and
// hold that port, conflicting with Caddy now owning it.
export async function ensureLegacyUnitsRemoved(): Promise<StepResult[]> {
  const results: StepResult[] = [];

  for (const env of REMOTE_ENV_NAMES) {
    const legacyUnit = `${legacyAppServiceName(env)}.service`;
    const legacyUnitPath = `${SYSTEM_PATHS.systemdUnits}/${legacyUnit}`;

    if (!await pathExists(legacyUnitPath)) {
      results.push({ label: `legacy unit ${legacyUnit}`, changed: false });
      continue;
    }

    await run("systemctl", ["stop", legacyUnit], { check: false });
    await run("systemctl", ["disable", legacyUnit], { check: false });
    await Deno.remove(legacyUnitPath);
    await run("systemctl", ["daemon-reload"]);
    results.push({
      label: `legacy unit ${legacyUnit}`,
      changed: true,
      detail: "removed",
    });
  }

  return results;
}
