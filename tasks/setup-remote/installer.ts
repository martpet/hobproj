// Idempotent, root-run remote configuration binary for "hobproj" servers.
// Compiled and installed via `publish-installer.ts`, then run via `sudo` by
// `setup-remote.ts`. Every step checks the current state first and only changes
// something that is missing or different; already-correct steps are
// reported as skipped, never reapplied. This mirrors the architecture of
// `deployer.ts`, but for one-time/occasional server provisioning rather
// than app deploys.
import { ensureSecretsPresent } from "./secrets.ts";
import { loadConfig } from "./load-config.ts";
import { printSummary, type StepResult } from "./step-helpers.ts";
import { ensureDenoInstalled } from "./steps/deno.ts";
import { ensureStorageMounted } from "./steps/storage.ts";
import { ensureAptPackage } from "./steps/apt.ts";
import {
  ensureCloudflaredRepoAndPackage,
  ensureCloudflareTunnel,
} from "./steps/cloudflared.ts";
import { ensureCaddyConfig, ensureCaddyRepoAndPackage } from "./steps/caddy.ts";
import { ensureUsersAndGroups } from "./steps/users.ts";
import { ensureDirectoryLayout } from "./steps/directories.ts";
import { ensureEtcHobprojEnvFiles } from "./steps/env-files.ts";
import { ensureKvEncryptionKeys } from "./steps/kv-encryption-key.ts";
import { ensureOpenTelemetryCollector } from "./steps/otel-collector.ts";
import { ensureDeployerConfigFiles } from "./steps/deployer-config.ts";
import {
  ensureLegacyUnitsRemoved,
  ensureSystemdAppUnits,
} from "./steps/systemd.ts";
import { ensureSudoers } from "./steps/sudoers.ts";
import { ensureGeoip } from "./steps/geoip.ts";
import { ensureFirewall } from "./steps/firewall.ts";

const results: StepResult[] = [];

try {
  const config = await loadConfig();
  await ensureSecretsPresent();

  results.push(await ensureDenoInstalled());
  results.push(await ensureAptPackage("cryptsetup"));
  results.push(await ensureAptPackage("systemd-cryptsetup"));
  results.push(await ensureStorageMounted(config));
  results.push(await ensureAptPackage("geoipupdate"));
  results.push(await ensureAptPackage("sqlite3"));
  results.push(await ensureCloudflaredRepoAndPackage());
  results.push(await ensureCaddyRepoAndPackage());
  results.push(await ensureUsersAndGroups(config));
  results.push(...await ensureDirectoryLayout());
  results.push(...await ensureEtcHobprojEnvFiles(config));
  // Before the app units, which load these credentials.
  results.push(...await ensureKvEncryptionKeys());
  results.push(...await ensureOpenTelemetryCollector(config));
  results.push(...await ensureDeployerConfigFiles(config));
  results.push(...await ensureSystemdAppUnits());
  results.push(...await ensureLegacyUnitsRemoved());
  results.push(...await ensureCaddyConfig());
  results.push(await ensureSudoers());
  results.push(...await ensureGeoip());
  results.push(await ensureCloudflareTunnel());
  results.push(await ensureFirewall(config));

  printSummary(results);
} catch (error) {
  console.error("\n❌ Remote setup failed.", error);
  printSummary(results);
  Deno.exit(1);
}
