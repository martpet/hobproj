import { loadEnv } from "./load-env.ts";
import { createRemoteClients } from "../utils/remote.ts";
import { appServiceName } from "../utils/infrastructure.ts";

// Streams live systemd journal logs for `hobproj.<staging|prod>` from the
// remote host. Usage: `deno task logs staging` / `deno task logs prod`.
const envName = await loadEnv();
const { host: remoteHost, ssh } = createRemoteClients();
const blueService = appServiceName(envName, "blue");
const greenService = appServiceName(envName, "green");

console.log(
  `📜 Tailing logs for "${blueService}" and "${greenService}" on "${remoteHost}" (Ctrl+C to stop)...\n`,
);

await ssh(
  [
    "sudo",
    "journalctl",
    "-u",
    blueService,
    "-u",
    greenService,
    "-f",
    "-n",
    "100",
  ],
  { check: false, tty: true },
);
