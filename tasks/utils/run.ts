export interface RunOptions {
  readonly check?: boolean;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly input?: string;
  readonly stdin?: "inherit" | "null";
  readonly stdout?: "inherit" | "piped";
  readonly stderr?: "inherit" | "null";
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
}

export async function run(
  cmd: string,
  args: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const stdout = options.stdout ?? "inherit";
  const command = new Deno.Command(cmd, {
    args,
    cwd: options.cwd,
    env: options.env,
    stdin: options.input === undefined ? options.stdin ?? "inherit" : "piped",
    stdout,
    stderr: options.stderr ?? "inherit",
  });

  const process = command.spawn();

  if (options.input !== undefined) {
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(options.input));
    await writer.close();
  }

  const result = stdout === "piped"
    ? await process.output()
    : { ...(await process.status), stdout: new Uint8Array() };

  if ((options.check ?? true) && !result.success) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${result.code}`);
  }

  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
  };
}
