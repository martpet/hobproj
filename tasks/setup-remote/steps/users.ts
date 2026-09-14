import { run } from "../../utils/run.ts";
import {
  APP_GROUP,
  APP_USER,
  deployGroupName,
} from "../../utils/infrastructure.ts";
import { REMOTE_ENV_NAMES } from "../../utils/environment.ts";
import { EXECUTABLE_PATHS } from "../../utils/remote-paths.ts";
import type { Config } from "../load-config.ts";
import type { StepResult } from "../step-helpers.ts";

async function groupExists(name: string): Promise<boolean> {
  const { code } = await run("getent", ["group", name], {
    stdout: "piped",
    check: false,
  });
  return code === 0;
}

async function userExists(name: string): Promise<boolean> {
  const { code } = await run("id", ["-u", name], {
    stdout: "piped",
    check: false,
  });
  return code === 0;
}

async function userGroups(name: string): Promise<string[]> {
  const { stdout } = await run("id", ["-nG", name], { stdout: "piped" });
  return stdout.split(/\s+/).filter(Boolean);
}

export async function ensureUsersAndGroups(
  config: Config,
): Promise<StepResult> {
  let changed = false;

  for (
    const group of [
      APP_GROUP,
      ...REMOTE_ENV_NAMES.map(deployGroupName),
    ]
  ) {
    if (!await groupExists(group)) {
      await run("groupadd", ["--system", group]);
      changed = true;
    }
  }

  if (!await userExists(APP_USER)) {
    await run("useradd", [
      "--system",
      "--no-create-home",
      "--shell",
      EXECUTABLE_PATHS.nologin,
      "--gid",
      APP_GROUP,
      APP_USER,
    ]);
    changed = true;
  }

  const memberships: [string, string][] = [
    ...config.deployStagingUsers.map((
      u,
    ): [string, string] => [u, deployGroupName("staging")]),
    ...config.deployProdUsers.map((
      u,
    ): [string, string] => [u, deployGroupName("prod")]),
    // Caddy reads the active-color-upstream snippets under `/etc/hobproj`,
    // which are root/hobproj-owned and not world-readable.
    ["caddy", APP_GROUP],
  ];

  for (const [user, group] of memberships) {
    if (!await userExists(user)) {
      console.warn(
        `⚠️  Skipping group membership: user "${user}" does not exist.`,
      );
      continue;
    }
    const groups = await userGroups(user);
    if (!groups.includes(group)) {
      await run("usermod", ["-aG", group, user]);
      changed = true;
    }
  }

  return { label: "Users & groups", changed };
}
