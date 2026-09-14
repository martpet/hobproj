import { run } from "../../utils/run.ts";
import type { StepResult } from "../step-helpers.ts";

let aptUpdated = false;

// Marks `apt-get update` as already done in this run, e.g. after a step
// that runs it itself (adding a new repo) rather than through
// `ensureAptUpdated`.
export function markAptUpdated(): void {
  aptUpdated = true;
}

export async function ensureAptUpdated(): Promise<void> {
  if (aptUpdated) return;
  await run("apt-get", ["update"]);
  aptUpdated = true;
}

export async function ensureAptPackage(name: string): Promise<StepResult> {
  const { code } = await run("dpkg", ["-s", name], {
    stdout: "piped",
    check: false,
  });
  if (code === 0) {
    return { label: `Package "${name}"`, changed: false };
  }

  await ensureAptUpdated();
  await run("apt-get", ["install", "-y", name]);
  return { label: `Package "${name}"`, changed: true, detail: "installed" };
}
