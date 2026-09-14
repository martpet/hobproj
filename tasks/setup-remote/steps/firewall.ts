import { run } from "../../utils/run.ts";
import type { Config } from "../load-config.ts";
import { confirm, type StepResult } from "../step-helpers.ts";

export async function ensureFirewall(config: Config): Promise<StepResult> {
  const { stdout: statusOut } = await run(
    "bash",
    ["-c", "ufw status verbose"],
    {
      stdout: "piped",
    },
  );

  const isActive = statusOut.includes("Status: active");
  const hasDefaults = statusOut.includes(
    "Default: deny (incoming), allow (outgoing)",
  );
  const hasSshRule = statusOut.includes(
    `22/tcp                     ALLOW IN    ${config.sshAllowedSubnet}`,
  );

  if (isActive && hasDefaults && hasSshRule) {
    return { label: "UFW firewall", changed: false };
  }

  const { stdout: sshClientEnv } = await run("bash", [
    "-c",
    'echo -n "${SSH_CLIENT:-}"',
  ], {
    stdout: "piped",
    check: false,
  });
  const clientIp = sshClientEnv.split(" ")[0];

  if (clientIp) {
    const { code } = await run(
      "bash",
      [
        "-c",
        `python3 -c "import ipaddress,sys; sys.exit(0 if ipaddress.ip_address('${clientIp}') in ipaddress.ip_network('${config.sshAllowedSubnet}') else 1)"`,
      ],
      { check: false, stdout: "piped" },
    );
    if (code !== 0) {
      console.warn(
        `⚠️  Current SSH client IP (${clientIp}) is not inside the configured subnet ` +
          `${config.sshAllowedSubnet}. Enabling UFW now could lock you out.`,
      );
      const proceed = await confirm(
        "Enable UFW anyway? Make sure you have console/out-of-band access before continuing.",
      );
      if (!proceed) {
        throw new Error("UFW setup was not confirmed.");
      }
    }
  }

  const proceed = clientIp ? true : await confirm(
    `About to enable UFW, allowing SSH only from ${config.sshAllowedSubnet}. ` +
      "Could not verify the current SSH client IP automatically.",
  );

  if (!proceed) {
    throw new Error("UFW setup was not confirmed.");
  }

  await run("ufw", ["default", "deny", "incoming"]);
  await run("ufw", ["default", "allow", "outgoing"]);
  await run("ufw", ["delete", "allow", "22/tcp"], { check: false });
  await run("ufw", [
    "allow",
    "from",
    config.sshAllowedSubnet,
    "to",
    "any",
    "port",
    "22",
    "proto",
    "tcp",
  ]);
  await run("bash", ["-c", "yes | ufw enable"]);

  return { label: "UFW firewall", changed: true, detail: "configured" };
}
