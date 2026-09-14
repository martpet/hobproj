import { run } from "../../utils/run.ts";
import { COMPILE_TARGET } from "../../utils/infrastructure.ts";
import { EXECUTABLE_PATHS } from "../../utils/remote-paths.ts";
import { pathExists, type StepResult } from "../step-helpers.ts";

export async function ensureDenoInstalled(): Promise<StepResult> {
  if (await pathExists(EXECUTABLE_PATHS.deno)) {
    return { label: "Deno runtime", changed: false };
  }

  const zipUrl =
    `https://github.com/denoland/deno/releases/latest/download/deno-${COMPILE_TARGET}.zip`;
  const tmpDir = await Deno.makeTempDir();

  await run("curl", ["-fsSL", "-o", `${tmpDir}/deno.zip`, zipUrl]);
  await run("unzip", ["-o", `${tmpDir}/deno.zip`, "-d", tmpDir]);
  await run("install", [
    "-o",
    "root",
    "-g",
    "root",
    "-m",
    "0755",
    `${tmpDir}/deno`,
    EXECUTABLE_PATHS.deno,
  ]);
  await Deno.remove(tmpDir, { recursive: true });

  return { label: "Deno runtime", changed: true, detail: "installed" };
}
