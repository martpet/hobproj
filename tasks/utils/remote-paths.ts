import { join } from "@std/path";

// Structural layout of the server, not configuration. Changing either root
// is a migration (systemd units, sudoers rules and Caddy config all bake in
// the resulting paths), so they live in code where they are reviewable
// rather than in an untracked env file.
//
// This file holds constants needed by both `tasks/deploy/` and
// `tasks/setup-remote/`. Constants scoped to `setup-remote/` alone belong in
// `tasks/setup-remote/constants.ts` (or locally in a single step file).
const RUNTIME_ROOT = "/opt/hobproj";
const GEOIP_ROOT = "/var/lib/GeoIP";
export const STATE_ROOT = "/var/lib/hobproj";
export const ETC_ROOT = "/etc/hobproj";
export const STORAGE_MAPPER_NAME = "hobproj-store";
export const STORAGE_MAPPER_PATH = `/dev/mapper/${STORAGE_MAPPER_NAME}`;

export const REMOTE_PATHS = {
  app: join(RUNTIME_ROOT, "app"),
  deployer: join(RUNTIME_ROOT, "deployer"),
  installer: join(RUNTIME_ROOT, "installer"),
  upload: join(STATE_ROOT, "deploy"),
  cache: join(STATE_ROOT, "cache"),
  storageMount: "/mnt/store",
  storageKey: join(ETC_ROOT, "storage.key"),
  geoip: GEOIP_ROOT,
  geoipDatabase: join(GEOIP_ROOT, "GeoLite2-City.mmdb"),
} as const;

export const SYSTEM_PATHS = {
  aptSources: "/etc/apt/sources.list.d",
  caddyConfig: "/etc/caddy/Caddyfile",
  cloudflaredConfig: "/etc/cloudflared",
  // Where systemd mounts a unit's `LoadCredentialEncrypted=` credentials,
  // under a per-unit subdirectory it points $CREDENTIALS_DIRECTORY at.
  credentials: "/run/credentials",
  crypttab: "/etc/crypttab",
  devNull: "/dev/null",
  devices: "/dev",
  fstab: "/etc/fstab",
  geoipConfig: "/etc/GeoIP.conf",
  keyrings: "/usr/share/keyrings",
  osRelease: "/etc/os-release",
  randomDevice: "/dev/urandom",
  sudoers: "/etc/sudoers.d",
  systemdUnits: "/etc/systemd/system",
  temp: "/tmp",
} as const;

// Absolute executable paths prevent PATH substitution in the unattended
// deployer and keep generated systemd and sudoers commands in sync.
export const EXECUTABLE_PATHS = {
  cat: "/usr/bin/cat",
  chmod: "/usr/bin/chmod",
  cloudflared: "/usr/bin/cloudflared",
  deno: "/usr/local/bin/deno",
  geoipupdate: "/usr/bin/geoipupdate",
  nologin: "/usr/sbin/nologin",
  otelcol: "/usr/local/bin/otelcol",
  shell: "/bin/sh",
  sudo: "/usr/bin/sudo",
  systemctl: "/usr/bin/systemctl",
  systemdCreds: "/usr/bin/systemd-creds",
} as const;
