import { run } from "../utils/run.ts";
import { BACKUP_PASSWORD_ENV } from "./constants.ts";

const OPENSSL_ARGS = ["enc", "-aes-256-cbc", "-pbkdf2"];

export async function encryptBackupFile(
  input: string,
  output: string,
  password: string,
): Promise<void> {
  await run("openssl", [
    ...OPENSSL_ARGS,
    "-salt",
    "-pass",
    `env:${BACKUP_PASSWORD_ENV}`,
    "-in",
    input,
    "-out",
    output,
  ], { env: { [BACKUP_PASSWORD_ENV]: password } });
}

export async function decryptBackupFile(
  input: string,
  output: string,
  password: string,
): Promise<void> {
  await run("openssl", [
    ...OPENSSL_ARGS,
    "-d",
    "-pass",
    `env:${BACKUP_PASSWORD_ENV}`,
    "-in",
    input,
    "-out",
    output,
  ], { env: { [BACKUP_PASSWORD_ENV]: password } });
}
