import { run } from "../../utils/run.ts";
import {
  EXECUTABLE_PATHS,
  REMOTE_PATHS,
  SYSTEM_PATHS,
} from "../../utils/remote-paths.ts";
import { credentialPath } from "../secrets.ts";
import { ensureFile, pathExists, type StepResult } from "../step-helpers.ts";

export async function ensureGeoip(): Promise<StepResult[]> {
  const results: StepResult[] = [];

  // No AccountID/LicenseKey here: geoipupdate reads them from the
  // credentials directory at runtime instead (see the unit's ExecStart).
  const confContent = [
    "EditionIDs GeoLite2-City",
    "",
  ].join("\n");
  results.push(
    await ensureFile(
      SYSTEM_PATHS.geoipConfig,
      confContent,
      "root",
      "root",
      "644",
    ),
  );

  const accountIdCred = credentialPath("geoip_account_id");
  const licenseKeyCred = credentialPath("geoip_license_key");
  const serviceUnit = [
    "[Unit]",
    "Description=Update MaxMind GeoIP databases",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=oneshot",
    // The ID before ":" must match the name `set-secret` encrypted the
    // file with (`systemd-creds encrypt --name=...`); systemd validates
    // the two against each other on load.
    `LoadCredentialEncrypted=geoip_account_id:${accountIdCred}`,
    `LoadCredentialEncrypted=geoip_license_key:${licenseKeyCred}`,
    `ExecStart=${EXECUTABLE_PATHS.shell} -c "GEOIPUPDATE_ACCOUNT_ID_FILE=\${CREDENTIALS_DIRECTORY}/geoip_account_id ` +
    `GEOIPUPDATE_LICENSE_KEY_FILE=\${CREDENTIALS_DIRECTORY}/geoip_license_key exec ${EXECUTABLE_PATHS.geoipupdate}"`,
    `ExecStartPost=${EXECUTABLE_PATHS.chmod} 0644 ${REMOTE_PATHS.geoipDatabase}`,
    "User=root",
    "Group=root",
    "PrivateTmp=true",
    "ProtectHome=true",
    "ProtectSystem=strict",
    `ReadWritePaths=${REMOTE_PATHS.geoip}`,
    "",
  ].join("\n");
  const serviceResult = await ensureFile(
    `${SYSTEM_PATHS.systemdUnits}/geoipupdate.service`,
    serviceUnit,
    "root",
    "root",
    "644",
  );
  results.push({
    label: "systemd unit geoipupdate.service",
    changed: serviceResult.changed,
  });

  const timerUnit = [
    "[Unit]",
    "Description=Update MaxMind GeoIP databases weekly",
    "",
    "[Timer]",
    "OnCalendar=weekly",
    "RandomizedDelaySec=6h",
    "Persistent=true",
    "Unit=geoipupdate.service",
    "",
    "[Install]",
    "WantedBy=timers.target",
    "",
  ].join("\n");
  const timerResult = await ensureFile(
    `${SYSTEM_PATHS.systemdUnits}/geoipupdate.timer`,
    timerUnit,
    "root",
    "root",
    "644",
  );
  results.push({
    label: "systemd unit geoipupdate.timer",
    changed: timerResult.changed,
  });

  let anyUnitChanged = serviceResult.changed || timerResult.changed;

  const { code: enabledCode } = await run(
    "systemctl",
    ["is-enabled", "geoipupdate.timer"],
    { stdout: "piped", check: false },
  );
  if (enabledCode !== 0) {
    anyUnitChanged = true;
  }

  if (anyUnitChanged) {
    await run("systemctl", ["daemon-reload"]);
    await run("systemctl", ["enable", "--now", "geoipupdate.timer"]);
  }

  if (!await pathExists(REMOTE_PATHS.geoipDatabase)) {
    // One-off bootstrap download outside the unit's LoadCredentialEncrypted=
    // sandbox: decrypt both secrets directly (installer already runs as
    // root) and pass them as env vars for this single invocation only.
    const accountId = await decryptCredential("geoip_account_id");
    const licenseKey = await decryptCredential("geoip_license_key");
    await run("geoipupdate", [], {
      env: {
        GEOIPUPDATE_ACCOUNT_ID: accountId,
        GEOIPUPDATE_LICENSE_KEY: licenseKey,
      },
    });
    await run("chmod", ["0644", REMOTE_PATHS.geoipDatabase]);
    results.push({
      label: "GeoLite2-City.mmdb",
      changed: true,
      detail: "downloaded",
    });
  } else {
    results.push({ label: "GeoLite2-City.mmdb", changed: false });
  }

  return results;
}

// Decrypts a credential file synchronously for local (root-only) one-off
// use, e.g. the geoipupdate bootstrap download that runs outside of any
// systemd unit's LoadCredentialEncrypted= sandbox.
async function decryptCredential(name: string): Promise<string> {
  const { stdout } = await run(
    EXECUTABLE_PATHS.systemdCreds,
    ["decrypt", `--name=${name}`, credentialPath(name), "-"],
    { stdout: "piped" },
  );
  return stdout.trim();
}
