import { exists } from "@std/fs";
import { join } from "@std/path";
import { BACKUP_ENV_PATH, loadEnvFile } from "../utils/environment.ts";
import { parseBackupTimestamp } from "./retention.ts";
import { run } from "../utils/run.ts";
import {
  BACKUP_AGENT_LABEL,
  BACKUP_LOG_FILE,
  BACKUP_ROOT_ENV,
} from "./constants.ts";

// Installs a per-user LaunchAgent that runs the production database and local
// env files backups daily.
//
// A LaunchAgent runs inside the Aqua login session, where the login keychain is
// already unlocked, so the backup password resolves without prompting. A
// LaunchDaemon would run as root and could not read the login keychain at all.
//
// Usage: deno task schedule-backup [install|uninstall|status]

const DEFAULT_HOUR = 12;
// Two daily runs may be missed while the Mac is asleep without anything
// being wrong, so only warn past that.
const STALE_AFTER_HOURS = 48;

const action = Deno.args[0] ?? "install";
if (action !== "install" && action !== "uninstall" && action !== "status") {
  throw new Error(
    "Usage: deno task schedule-backup [install|uninstall|status].",
  );
}

if (Deno.build.os !== "darwin") {
  throw new Error("Scheduled backups are only supported on macOS.");
}

const home = Deno.env.get("HOME");
if (!home) {
  throw new Error("HOME is not set.");
}

const hour = readHour();
const repoRoot = Deno.cwd();
const agentsDir = join(home, "Library", "LaunchAgents");
const plistPath = join(agentsDir, `${BACKUP_AGENT_LABEL}.plist`);
const logPath = join(home, "Library", "Logs", BACKUP_LOG_FILE);
const { stdout: uid } = await run("id", ["-u"], { stdout: "piped" });
const target = `gui/${uid}`;

if (action === "status") {
  await reportStatus();
} else if (action === "uninstall") {
  await removeAgent();
  console.log(`✅ Removed the scheduled backup (${BACKUP_AGENT_LABEL}).`);
} else {
  await install();
}

async function install(): Promise<void> {
  const denoPath = Deno.execPath();
  const backupTask = join(repoRoot, "tasks", "backup", "scheduled.ts");
  if (!await exists(backupTask)) {
    throw new Error(
      `Run this from the repository root; ${backupTask} does not exist.`,
    );
  }

  await Deno.mkdir(agentsDir, { recursive: true });
  await Deno.mkdir(join(home!, "Library", "Logs"), { recursive: true });
  await Deno.writeTextFile(plistPath, buildPlist(denoPath));

  // Replace any previous definition so the task stays idempotent.
  await uninstall();
  await run("launchctl", ["bootstrap", target, plistPath]);

  console.log(`✅ Scheduled a daily prod backup at ${pad(hour)}:00.`);
  console.log(`   Agent:  ${plistPath}`);
  console.log(`   Log:    ${logPath}`);
  console.log(
    "   Runs only while you are logged in; a missed run starts after wake.",
  );
  await warnIfTerminalLacksDiskAccess();
}

async function uninstall(): Promise<void> {
  // Missing on a fresh install, so the "No such process" notice is expected.
  await run("launchctl", ["bootout", `${target}/${BACKUP_AGENT_LABEL}`], {
    check: false,
    stderr: "null",
  });
}

async function removeAgent(): Promise<void> {
  await uninstall();
  if (await exists(plistPath)) {
    await Deno.remove(plistPath);
  }
}

async function reportStatus(): Promise<void> {
  if (!await exists(plistPath)) {
    console.log("No scheduled backup is installed.");
    return;
  }
  console.log(`Agent: ${plistPath}`);
  const { code } = await run(
    "launchctl",
    ["print", `${target}/${BACKUP_AGENT_LABEL}`],
    {
      check: false,
      stdout: "piped",
      stderr: "null",
    },
  );
  console.log(code === 0 ? "Status: loaded" : "Status: not loaded");
  console.log(`Log:   ${logPath}`);
  await reportLastBackup();
}

// A failing run only writes to the log, which nobody reads. The age of the
// newest prod backup is the outcome that actually matters, so report it here
// and warn once it is older than the schedule can explain.
async function reportLastBackup(): Promise<void> {
  const backupRoot = await configuredBackupRoot();
  if (!backupRoot) {
    return;
  }

  const prodRoot = join(backupRoot, "prod");
  let newest: Date | undefined;
  try {
    for await (const entry of Deno.readDir(prodRoot)) {
      if (!entry.isDirectory || entry.name.endsWith(".tmp")) {
        continue;
      }
      const date = parseBackupTimestamp(entry.name);
      if (date && (!newest || date > newest)) {
        newest = date;
      }
    }
  } catch {
    // Listing needs Full Disk Access, which `install` already warns about.
    console.log("Last backup: unknown (cannot list the backup folder)");
    return;
  }

  if (!newest) {
    console.log("Last backup: none found");
    console.warn(`⚠️  No prod backup exists yet in ${prodRoot}.`);
    return;
  }

  const ageHours = (Date.now() - newest.getTime()) / 3_600_000;
  console.log(
    `Last backup: ${newest.toISOString()} (${Math.floor(ageHours)}h ago)`,
  );
  if (ageHours > STALE_AFTER_HOURS) {
    console.warn(
      `⚠️  The newest prod backup is over ${
        Math.floor(STALE_AFTER_HOURS / 24)
      } days old, so recent runs are likely failing.`,
    );
    console.warn(`⚠️  Check ${logPath} for the reason.`);
  }
}

// The agent inherits a minimal PATH from launchd, so `deno` is passed by
// absolute path and its directory is added for any nested lookups.
function buildPlist(denoPath: string): string {
  const denoDir = denoPath.slice(0, denoPath.lastIndexOf("/"));

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${BACKUP_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${denoPath}</string>
    <string>run</string>
    <string>-A</string>
    <string>${join(repoRoot, "tasks", "backup", "scheduled.ts")}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${repoRoot}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${denoDir}:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>LowPriorityIO</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;
}

function readHour(): number {
  const raw = Deno.env.get("BACKUP_SCHEDULE_HOUR");
  if (!raw) {
    return DEFAULT_HOUR;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 23) {
    throw new Error(
      "BACKUP_SCHEDULE_HOUR must be an integer between 0 and 23.",
    );
  }
  return parsed;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

// Files the agent creates are not readable from a terminal that lacks Full
// Disk Access, which would leave the backups unrestorable by hand.
async function warnIfTerminalLacksDiskAccess(): Promise<void> {
  const backupRoot = await configuredBackupRoot();
  if (!backupRoot || !await exists(backupRoot)) {
    return;
  }
  try {
    for await (const _ of Deno.readDir(backupRoot)) {
      break;
    }
  } catch {
    console.warn(
      "\n⚠️  This terminal cannot list the backup folder, so it will not be " +
        "able to read backups written by the agent.",
    );
    console.warn(
      "⚠️  Grant it Full Disk Access in System Settings > Privacy & Security " +
        "so restores work from the command line.",
    );
  }
}

async function configuredBackupRoot(): Promise<string | undefined> {
  const backupEnv = await loadEnvFile(BACKUP_ENV_PATH);
  return Deno.env.get(BACKUP_ROOT_ENV) ??
    backupEnv[BACKUP_ROOT_ENV];
}
