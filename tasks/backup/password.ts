import { getEnv } from "@shared/environment.ts";
import { run } from "../utils/run.ts";
import {
  BACKUP_KEYCHAIN_SERVICE_ENV,
  BACKUP_PASSWORD_ENV,
  DEFAULT_BACKUP_KEYCHAIN_SERVICE,
} from "./constants.ts";

const MIN_LENGTH = 16;

// Resolves the backup encryption password from the environment, falling back
// to the macOS Keychain so routine backups don't need a manual `export`.
// `BACKUP_KEYCHAIN_SERVICE` names the generic-password item; set it to an
// empty value to disable the Keychain lookup entirely.
export async function resolveEncryptionPassword(): Promise<string> {
  const fromEnv = getEnv(BACKUP_PASSWORD_ENV);

  if (fromEnv) {
    return validate(fromEnv, BACKUP_PASSWORD_ENV);
  }

  const service = getEnv(BACKUP_KEYCHAIN_SERVICE_ENV) ??
    DEFAULT_BACKUP_KEYCHAIN_SERVICE;

  if (service === "") {
    throw new Error(
      `Missing ${BACKUP_PASSWORD_ENV} and the Keychain lookup is disabled.`,
    );
  }

  const account = getEnv("USER");
  const args = ["find-generic-password", "-s", service, "-w"];

  if (account) {
    args.splice(1, 0, "-a", account);
  }

  const { code, stdout } = await run("security", args, {
    check: false,
    stdin: "null",
    stdout: "piped",
  });

  if (code !== 0 || stdout === "") {
    throw new Error(
      `Could not read the backup password from the Keychain item '${service}'. ` +
        `Add it with \`security add-generic-password -a "$USER" -s "${service}" -w\`, ` +
        `or set ${BACKUP_PASSWORD_ENV} in the environment.`,
    );
  }

  return validate(stdout, `Keychain item '${service}'`);
}

function validate(password: string, source: string): string {
  if (password.length < MIN_LENGTH) {
    throw new Error(
      `The backup password from ${source} must contain at least ${MIN_LENGTH} characters.`,
    );
  }

  return password;
}
