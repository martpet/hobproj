import { run, type RunOptions, type RunResult } from "./run.ts";

export interface SshOptions extends RunOptions {
  readonly tty?: boolean;
}

export type SshClient = (
  args: string[],
  options?: SshOptions,
) => Promise<RunResult>;

export function createSsh(remoteHost: string): SshClient {
  return function ssh(
    args: string[],
    options: SshOptions = {},
  ): Promise<RunResult> {
    const { tty = false, ...runOptions } = options;
    const mode = tty ? ["-t"] : runOptions.input === undefined ? ["-n"] : [];

    return run("ssh", [...mode, remoteHost, ...args], runOptions);
  };
}
