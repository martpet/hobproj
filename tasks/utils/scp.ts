import { run, type RunOptions, type RunResult } from "./run.ts";

export function createScp(remoteHost: string) {
  return {
    upload(
      localPath: string,
      remotePath: string,
      options?: RunOptions,
    ): Promise<RunResult> {
      return run("scp", [localPath, `${remoteHost}:${remotePath}`], options);
    },

    download(
      remotePath: string,
      localPath: string,
      options?: RunOptions,
    ): Promise<RunResult> {
      return run("scp", [`${remoteHost}:${remotePath}`, localPath], options);
    },
  };
}
