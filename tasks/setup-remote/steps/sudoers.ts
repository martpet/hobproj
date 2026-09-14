import { run } from "../../utils/run.ts";
import {
  EXECUTABLE_PATHS,
  REMOTE_PATHS,
  SYSTEM_PATHS,
} from "../../utils/remote-paths.ts";
import { REMOTE_ENV_NAMES } from "../../utils/environment.ts";
import {
  APP_USER,
  appServiceName,
  DEPLOY_GROUP_PREFIX,
  deployGroupName,
} from "../../utils/infrastructure.ts";
import { COLORS } from "../constants.ts";
import { credentialPath } from "../secrets.ts";
import {
  readTextIfExists,
  statOwnerGroupMode,
  type StepResult,
} from "../step-helpers.ts";

const SUDOERS_PATH = `${SYSTEM_PATHS.sudoers}/${DEPLOY_GROUP_PREFIX}`;

export async function ensureSudoers(): Promise<StepResult> {
  const lines = [
    `%${
      deployGroupName("staging")
    } ALL=(${APP_USER}) NOPASSWD: ${REMOTE_PATHS.deployer}/staging/deployer *`,
    `%${
      deployGroupName("prod")
    } ALL=(${APP_USER}) NOPASSWD: ${REMOTE_PATHS.deployer}/prod/deployer *`,
  ];

  for (const env of REMOTE_ENV_NAMES) {
    for (const color of COLORS) {
      for (const action of ["start", "stop", "restart"]) {
        lines.push(
          `${APP_USER} ALL=(root) NOPASSWD: ${EXECUTABLE_PATHS.systemctl} ${action} ${
            appServiceName(env, color)
          }`,
        );
      }
    }
  }
  lines.push(
    `${APP_USER} ALL=(root) NOPASSWD: ${EXECUTABLE_PATHS.systemctl} reload caddy`,
  );
  // The deployer (running as `hobproj`) decrypts these 2 secrets itself at
  // deploy time for the Cloudflare cache purge; narrow, per-credential
  // rules rather than a wildcard.
  lines.push(
    `${APP_USER} ALL=(root) NOPASSWD: ${EXECUTABLE_PATHS.systemdCreds} decrypt --name=cloudflare_zone_id ${
      credentialPath("cloudflare_zone_id")
    }`,
  );
  lines.push(
    `${APP_USER} ALL=(root) NOPASSWD: ${EXECUTABLE_PATHS.systemdCreds} decrypt --name=cloudflare_api_token ${
      credentialPath("cloudflare_api_token")
    }`,
  );
  lines.push("");

  const content = lines.join("\n");

  const current = await readTextIfExists(SUDOERS_PATH);
  const currentMeta = await statOwnerGroupMode(SUDOERS_PATH);

  if (current === content && currentMeta === "root:root:440") {
    return { label: "sudoers drop-in", changed: false };
  }

  const tmpPath = `${SYSTEM_PATHS.sudoers}/.${DEPLOY_GROUP_PREFIX}.setup-tmp`;
  await Deno.writeTextFile(tmpPath, content);
  await run("chmod", ["440", tmpPath]);

  const { code } = await run("visudo", ["-c", "-f", tmpPath], {
    stdout: "piped",
    check: false,
  });
  if (code !== 0) {
    await Deno.remove(tmpPath);
    throw new Error("Generated sudoers file failed validation (visudo -c).");
  }

  await run("install", [
    "-o",
    "root",
    "-g",
    "root",
    "-m",
    "0440",
    tmpPath,
    SUDOERS_PATH,
  ]);
  await Deno.remove(tmpPath);
  return { label: "sudoers drop-in", changed: true };
}
