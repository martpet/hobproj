export function getRequiredEnv(key: string): string {
  const value = Deno.env.get(key);

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getEnv(key: string): string | undefined {
  return optionalEnvValue(Deno.env.get(key));
}

// Normalizes an env var value: `undefined` for unset or blank, otherwise the
// value itself.
export function optionalEnvValue(
  value: string | undefined,
): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

export function getBooleanEnv(key: string): boolean {
  return parseBooleanEnvValue(Deno.env.get(key));
}

export function parseBooleanEnvValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();

  if (normalized === undefined || normalized === "") {
    return false;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(
    `Invalid boolean value '${value}'. Expected "true" or "false".`,
  );
}

const ENV_NAMES = ["dev", "staging", "prod"] as const;

export type EnvName = (typeof ENV_NAMES)[number];

export function getEnvName(): EnvName {
  const value = getRequiredEnv("ENV_NAME");

  if (!(ENV_NAMES as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid ENV_NAME '${value}'. Must be one of: ${ENV_NAMES.join(", ")}.`,
    );
  }

  return value as EnvName;
}
