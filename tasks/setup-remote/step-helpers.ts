import { run } from "../utils/run.ts";

export interface StepResult {
  readonly label: string;
  readonly changed: boolean;
  readonly detail?: string;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(
  path: string,
): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return undefined;
  }
}

export async function statOwnerGroupMode(
  path: string,
): Promise<string | undefined> {
  const { code, stdout } = await run("stat", ["-c", "%U:%G:%a", path], {
    stdout: "piped",
    check: false,
  });
  return code === 0 ? stdout : undefined;
}

// Writes `content` to `path` with the given owner/group/mode, but only if
// the content or metadata actually differ from what's already there.
export async function ensureFile(
  path: string,
  content: string,
  owner: string,
  group: string,
  mode: string,
): Promise<StepResult> {
  const currentContent = await readTextIfExists(path);
  const currentMeta = await statOwnerGroupMode(path);
  const desiredMeta = `${owner}:${group}:${mode}`;

  if (currentContent === content && currentMeta === desiredMeta) {
    return { label: path, changed: false };
  }

  const tmpPath = `${path}.setup-tmp`;
  await Deno.writeTextFile(tmpPath, content);
  await run("install", ["-o", owner, "-g", group, "-m", mode, tmpPath, path]);
  await Deno.remove(tmpPath);
  return { label: path, changed: true };
}

export interface DirectoryOptions {
  readonly owner: string;
  readonly group: string;
  readonly mode: string;
}

export async function ensureDirectory(
  path: string,
  { owner, group, mode }: DirectoryOptions,
): Promise<StepResult> {
  const exists = await pathExists(path);
  const currentMeta = exists ? await statOwnerGroupMode(path) : undefined;
  const desiredMeta = `${owner}:${group}:${mode}`;

  if (exists && currentMeta === desiredMeta) {
    return { label: path, changed: false };
  }

  await run("install", ["-d", "-o", owner, "-g", group, "-m", mode, path]);
  return { label: path, changed: true };
}

export async function confirm(message: string): Promise<boolean> {
  console.log(`\n⚠️  ${message}`);
  await Deno.stdout.write(new TextEncoder().encode("Type 'yes' to continue: "));
  const buffer = new Uint8Array(1024);
  const n = await Deno.stdin.read(buffer);
  const answer = n
    ? new TextDecoder().decode(buffer.subarray(0, n)).trim()
    : "";
  return answer.toLowerCase() === "yes";
}

export function printSummary(steps: StepResult[]) {
  console.log("\n📋 Setup summary:");
  for (const step of steps) {
    const icon = step.changed ? "✏️ " : "✓ ";
    const suffix = step.detail ? ` (${step.detail})` : "";
    console.log(`  ${icon}${step.label}${suffix}`);
  }
  const changedCount = steps.filter((s) => s.changed).length;
  const summary = changedCount === 0
    ? `All ${steps.length} steps were already correct.`
    : changedCount === steps.length
    ? `All ${steps.length} steps made changes.`
    : `${changedCount} of ${steps.length} steps made changes; the rest were already correct.`;
  console.log(`\n${summary}`);
}
