// Throws unless `value` (an env var value used to build a shell command or
// file path) consists only of safe characters (letters, digits, `_.-/@+`).
// `name` identifies the value in the error message, e.g. `envName` or
// `blue.service`.
export function assertSafeEnvChars(value: string, name: string): void {
  if (!/^[\w./@+-]+$/.test(value)) {
    throw new Error(`${name} contains unsupported characters.`);
  }
}

// Throws unless `value` is a Git SHA (7-40 hex chars) or a dirty staging ID
// suffixed with a UTC timestamp, e.g. `abc1234-dirty-20240101T120000Z`.
export function assertDeploymentId(value: string): void {
  if (!/^[0-9a-f]{7,40}(?:-dirty-[0-9]{8}T[0-9]{9}Z)?$/.test(value)) {
    throw new Error(
      "deploymentId must be a Git SHA or a dirty staging ID with a UTC timestamp.",
    );
  }
}

// Throws unless `value` (an env var value) is a comma-separated list of
// entries valid for `Deno.Command`'s `--allow-net` argument: a host,
// optionally with a port (e.g. `api.cloudflare.com:443` or `example.com`).
export function assertSafeEnvHostList(value: string, name: string): void {
  for (const entry of value.split(",")) {
    if (!/^[\w.-]+(?::\d+)?$/.test(entry)) {
      throw new Error(
        `${name} entry '${entry}' contains unsupported characters.`,
      );
    }
  }
}
