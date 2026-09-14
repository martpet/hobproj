import { run } from "../../utils/run.ts";
import { EXECUTABLE_PATHS, SYSTEM_PATHS } from "../../utils/remote-paths.ts";
import { credentialPath } from "../secrets.ts";
import { ensureFile, pathExists, type StepResult } from "../step-helpers.ts";
import { markAptUpdated } from "./apt.ts";

// ---------------------------------------------------------------------------
// Package (cloudflared apt repo)
// ---------------------------------------------------------------------------

export async function ensureCloudflaredRepoAndPackage(): Promise<StepResult> {
  const { code } = await run("dpkg", ["-s", "cloudflared"], {
    stdout: "piped",
    check: false,
  });
  if (code === 0) {
    return { label: 'Package "cloudflared"', changed: false };
  }

  const keyringPath = `${SYSTEM_PATHS.keyrings}/cloudflare-main.gpg`;
  const listPath = `${SYSTEM_PATHS.aptSources}/cloudflared.list`;

  if (!await pathExists(keyringPath)) {
    await run(
      "bash",
      [
        "-c",
        `mkdir -p --mode=0755 ${SYSTEM_PATHS.keyrings} && ` +
        `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o ${keyringPath}`,
      ],
    );
  }

  if (!await pathExists(listPath)) {
    const codename = (await run(
      "bash",
      ["-c", `. ${SYSTEM_PATHS.osRelease} && echo $VERSION_CODENAME`],
      {
        stdout: "piped",
      },
    )).stdout.trim();
    const line =
      `deb [signed-by=${keyringPath}] https://pkg.cloudflare.com/cloudflared ${codename} main\n`;
    await Deno.writeTextFile(listPath, line);
  }

  await run("apt-get", ["update"]);
  markAptUpdated();
  await run("apt-get", ["install", "-y", "cloudflared"]);

  return { label: 'Package "cloudflared"', changed: true, detail: "installed" };
}

// ---------------------------------------------------------------------------
// Cloudflare Tunnel
// ---------------------------------------------------------------------------

// Token rotation/restart is handled by `set-secret cloudflare_tunnel_token`
// (it restarts the service itself when the value changes); this only
// ensures the unit definition is in place and running.
export async function ensureCloudflareTunnel(): Promise<StepResult> {
  const tokenCred = credentialPath("cloudflare_tunnel_token");

  // Leftover from before the switch to LoadCredentialEncrypted=; remove it
  // so the plaintext token doesn't linger on disk.
  await run("rm", ["-f", `${SYSTEM_PATHS.cloudflaredConfig}/token`], {
    check: false,
  });

  const unit = [
    "[Unit]",
    "Description=Cloudflare Tunnel client",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "TimeoutStartSec=15",
    "Type=notify",
    `LoadCredentialEncrypted=cloudflare_tunnel_token:${tokenCred}`,
    `ExecStart=${EXECUTABLE_PATHS.cloudflared} --no-autoupdate tunnel run --token-file ` +
    "${CREDENTIALS_DIRECTORY}/cloudflare_tunnel_token",
    "Restart=on-failure",
    "RestartSec=5s",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");

  const unitResult = await ensureFile(
    `${SYSTEM_PATHS.systemdUnits}/cloudflared.service`,
    unit,
    "root",
    "root",
    "644",
  );

  const { code: enabledCode } = await run("systemctl", [
    "is-enabled",
    "cloudflared",
  ], {
    stdout: "piped",
    check: false,
  });
  const { code: activeCode } = await run("systemctl", [
    "is-active",
    "cloudflared",
  ], {
    stdout: "piped",
    check: false,
  });

  const changed = unitResult.changed || enabledCode !== 0 ||
    activeCode !== 0;

  if (changed) {
    await run("systemctl", ["daemon-reload"]);
    await run("systemctl", ["enable", "--now", "cloudflared"]);
  }

  return { label: "Cloudflare Tunnel (cloudflared)", changed };
}
