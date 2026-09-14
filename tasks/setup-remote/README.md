# Hobproj remote setup

This directory contains the tasks that provision and configure the "hobproj"
Raspberry Pi: installing dependencies, creating the app's directory layout and
systemd units, configuring Caddy and the Cloudflare Tunnel, and managing the
handful of provider-issued secrets the app needs.

## How it works

`installer.ts` is an idempotent, root-run configuration script. Every step
checks the current state first and only changes what's missing or different;
already-correct steps are reported as skipped, never reapplied. It's compiled to
a standalone binary and installed on the Pi by `publish-installer.ts`, then run
over SSH by `setup-remote.ts`.

`setup-remote.ts` doesn't recompile the installer itself — it just checks the
compiled binary already exists remotely and errors out with instructions if not.
This keeps destructive-step confirmation prompts interactive (they need to reach
a real terminal over `ssh -t`), while still letting the installer be rebuilt
independently whenever `installer.ts` changes.

Provider-issued secrets the app needs (Cloudflare tunnel token/zone ID/API
token, MaxMind GeoIP account ID/license key, and optional OpenTelemetry
collector export headers) are provisioned separately from
`installer.ts`/`setup-remote`, via `set-secret.ts`. See
[Managing secrets](#managing-secrets) below.

## Bootstrapping a brand-new Pi

Before running anything here, the Pi needs to already have:

- SSH key-based access for your laptop user (no password prompts).
- Passwordless `sudo` for that user (`sudo -n true` must succeed).
- The USB/external drive connected. It may be new, the existing plaintext ext4
  volume labeled `hobproj-store`, or an existing LUKS2 volume
  previously provisioned by this installer.
- A Linux user account for every developer listed in `DEPLOY_STAGING_USERS` /
  `DEPLOY_PROD_USERS` (the installer only adds existing users to the deploy
  groups; it doesn't create login accounts).

None of that is scripted here since it only happens once per physical machine.
Everything else — installing Deno, mounting storage, installing packages,
creating the `hobproj` system user, directory layout, systemd units, Caddy,
sudoers, the firewall — is handled by `installer.ts`.

With that in place, run, in order:

```sh
deno task set-secret cloudflare_tunnel_token
deno task set-secret cloudflare_zone_id
deno task set-secret cloudflare_api_token
deno task set-secret geoip_account_id
deno task set-secret geoip_license_key

deno task publish-installer
deno task setup-remote
```

Then deploy the app:

```sh
deno task deploy staging
deno task deploy prod
```

## Encrypted USB storage

The installer stores staging and production databases on a LUKS2-encrypted USB
volume. Normal boots are unattended:

1. systemd reads the random automatic key from
   `/etc/hobproj/storage.key` (`root:root`, mode `0400`);
2. `/etc/crypttab` opens the volume as `/dev/mapper/hobproj-store`;
3. `/etc/fstab` mounts that mapper at `/mnt/store`;
4. the application units start only after the real mount is available.

The filesystem label, mount path, cross-compile target, and proxy/application
ports are deployment topology defined in `../utils/infrastructure.ts`, not
operator-configurable environment values.

The installer installs both `cryptsetup` and Debian's separate
`systemd-cryptsetup` package, which supplies the systemd generator and runtime
used to process `/etc/crypttab`.

The automatic key occupies LUKS keyslot 1. A recovery passphrase, entered during
initial setup and kept only in your password manager, occupies keyslot 0. The
passphrase is not stored in the repository, an env file, the Pi, or a backup.

This protects a detached, lost, or discarded USB. It does not protect against an
attacker who obtains both the USB and the Pi's SD card, because the SD card holds
the automatic key required for unattended boot.

### First migration from plaintext ext4

Run the normal setup commands after publishing the updated installer:

```sh
deno task publish-installer
deno task setup-remote
```

When setup detects the existing plaintext volume, it:

1. records which application units are running and stops them;
2. creates encrypted, checksum-verified SQLite backups for every existing
   staging/production database;
3. asks you to type the exact migration confirmation;
4. asks twice for a new recovery passphrase using hidden input;
5. reformats the USB as LUKS2, creates the automatic key and ext4 filesystem,
   and verifies systemd can unlock and mount it;
6. restores and integrity-checks each database;
7. restores the previous application service state;
8. downloads an encrypted LUKS header backup to `BACKUP_LOCAL_PATH`.

Formatting is never attempted until the encrypted database backups are durable
on the Mac. Migration progress is journaled under
`BACKUP_LOCAL_PATH/migration/`. If setup is interrupted, rerun
`deno task setup-remote`; it resumes from the exact recorded archives. Services
remain stopped after an incomplete migration so they cannot write into an empty
or partially restored filesystem.

An unrecognized filesystem, mismatched mount source, missing expected device, or
invalid key causes setup to stop rather than format or silently continue.

### Reinstalling the Pi

Do not format the USB during the OS reinstall. Reconnect it, restore this
project's setup configuration, publish the installer, and run:

```sh
deno task publish-installer
deno task setup-remote
```

The installer detects the existing LUKS volume and the missing local automatic
key. Enter the recovery passphrase when prompted. It verifies that passphrase,
replaces only automatic-key slot 1, verifies the new key, recreates
`/etc/crypttab` and `/etc/fstab`, and tests unlock/mount through systemd. The
databases are not reformatted or restored because they remain on the USB.

After key replacement, setup automatically creates a new encrypted LUKS header
backup. Keep the recovery passphrase and the backup encryption password outside
the Pi. Losing the Pi key, recovery passphrase, and usable encrypted database
backups makes the USB intentionally unrecoverable.

### Storage setup failure

If the installer stops after migration was authorized, do not manually create
files under `/mnt/store` and do not reformat the device. Correct the reported
problem and rerun `deno task setup-remote`. The local migration journal drives
the remaining provisioning or restore work.

The application units also use `ConditionPathIsMountPoint` and
`RequiresMountsFor`, so an unlock or mount failure prevents the web application
from starting against the bare mount-point directory.

## OpenTelemetry on the Pi

Remote app telemetry is opt-in. Leave the `STAGING_OTEL_*` / `PROD_OTEL_*`
settings unset to keep the app running without OpenTelemetry export. When you
are ready to collect production data, the recommended Raspberry Pi setup is a
lightweight OpenTelemetry Collector on the Pi forwarding both staging and prod
to the same backend you can open from your MacBook, rather than a full
Grafana/Loki/Tempo/Prometheus stack on the Pi itself.

Use staging as the production-backend test: point the Pi collector at the real
backend, enable only staging app export first, and verify traces/metrics/logs
there before enabling prod.

To provision the collector, set the collector options in
`tasks/setup-remote/.env.setup`, then run:

```sh
deno task setup-remote
```

At minimum, provide the backend endpoint. Setting
`OTEL_COLLECTOR_EXPORT_ENDPOINT` makes `setup-remote` install and manage the
collector:

```sh
OTEL_COLLECTOR_EXPORT_ENDPOINT=https://otlp.example.com:4318
OTEL_COLLECTOR_EXPORT_PROTOCOL=http/protobuf
```

If the backend needs an `Authorization` header, store only the header value as a
Pi secret instead of putting it in `.env.setup`. For Grafana Cloud, enter the
`Basic ...` value when prompted:

```sh
deno task set-secret otel_collector_export_authorization
```

After the collector is installed, enable app export per environment. The app
endpoint and protocol are fixed in the installer because staging and prod always
send to the same Pi-local collector at `http://127.0.0.1:4318` using OTLP
HTTP/protobuf:

```sh
STAGING_OTEL_ENABLED=true
PROD_OTEL_ENABLED=true
```

For the first rollout, enable only staging:

```sh
STAGING_OTEL_ENABLED=true
# PROD_OTEL_ENABLED=false
```

The app's systemd units then set `OTEL_DENO=true`, a stable service name, the
environment name, and the deployment ID as the OpenTelemetry service version.
Permission audit logs are intentionally not enabled by default because they can
be noisy and may include permission names, filesystem paths, network hosts,
environment variable names, and optional stack traces.

## Cloudflare Cache Purging

Cloudflare HTML cache purging after deployments is controlled per environment in
`tasks/setup-remote/.env.setup`:

```sh
STAGING_CLOUDFLARE_PURGE_CACHE_ENABLED=true
PROD_CLOUDFLARE_PURGE_CACHE_ENABLED=true
```

When enabled for an environment, the deployer is granted network permission
(`api.cloudflare.com:443`) and purges the environment's cache tag using the
`cloudflare_zone_id` and `cloudflare_api_token` secrets stored on the Pi.

Each deployment gets a `DEPLOYMENT_ID`, which is the version identity used for
health checks, asset cache-busting, and the server-cache namespace. A clean
working tree uses the short Git revision. Staging deployments may include
uncommitted source changes; those deployments receive a timestamped
`<git-revision>-dirty-<utc-timestamp>` ID so browsers and the server cache do
not reuse the previous version's assets or responses. Production deployments
require a clean working tree, keeping the deployed version directly traceable to
a committed revision.

The order of the two blocks above matters:

- The secrets must exist before `setup-remote` runs, because `installer.ts`'s
  first step (`ensureSecretsPresent`) fails fast with clear instructions if any
  are missing.
- The installer binary must be published before `setup-remote` runs, because
  `setup-remote` only checks for it — it doesn't build it.

`setup-remote` also always (re)compiles and installs both deployer binaries
(`publish-deployer staging` / `publish-deployer prod`) as its last step, so
there's no separate publish step needed for those on first setup.

## Running it again later

Day to day, `setup-remote` is idempotent and safe to re-run any time you change
`.env.setup` or `tasks/.env.tasks` (allowed subnet, deploy users, app origins,
etc.):

```sh
deno task setup-remote
```

Rebuild and republish the installer binary first if its source or shared
infrastructure constants changed:

```sh
deno task publish-installer
deno task setup-remote
```

`set-secret` is independent of both — run it whenever a secret needs to be set
for the first time or rotated (see below). It does not require `setup-remote` to
be re-run afterwards, except that a brand-new Pi needs all required secrets
present before `setup-remote` will get past its first step.

## Managing secrets

Provider-issued secrets never live in a repository env file or in any plaintext
file on the Pi. Each is encrypted at rest with `systemd-creds`, using a key that
exists only on that specific machine (see `secrets.ts`):

```txt
/etc/hobproj/credstore.encrypted/cloudflare_tunnel_token.cred
/etc/hobproj/credstore.encrypted/cloudflare_zone_id.cred
/etc/hobproj/credstore.encrypted/cloudflare_api_token.cred
/etc/hobproj/credstore.encrypted/geoip_account_id.cred
/etc/hobproj/credstore.encrypted/geoip_license_key.cred
/etc/hobproj/credstore.encrypted/otel_collector_export_authorization.cred
```

Set or rotate one with:

```sh
deno task set-secret <name>
```

for example:

```sh
deno task set-secret cloudflare_tunnel_token
```

It prompts for the value with hidden input and pipes it directly over SSH into
`systemd-creds encrypt` on the Pi — the value never touches a local file.
Rotating `cloudflare_tunnel_token` also restarts `cloudflared.service` on the Pi
to pick up the new value immediately; the other 4 secrets are read fresh on
every use (by the `geoipupdate` timer or by the deployer), so nothing else needs
restarting.

Because the encryption key lives only on the Pi, these secrets are unrecoverable
if the Pi (or its SD card) is lost. If that happens, re-issue new values from
the Cloudflare and MaxMind dashboards and run `set-secret` again for each — this
trade-off was chosen deliberately since none of these values needs to survive Pi
loss.

## Adding a developer

To let another developer deploy to staging and/or prod:

1. Make sure they already have a Linux user account and SSH access on the Pi.
2. Add their username to `DEPLOY_STAGING_USERS` and/or `DEPLOY_PROD_USERS` in
   `.env.setup`, comma-separated:

   ```env
   DEPLOY_STAGING_USERS=martin,newuser
   DEPLOY_PROD_USERS=martin,newuser
   ```

3. Run:

   ```sh
   deno task setup-remote
   ```

They don't need any of the provider secrets locally — those stay on the Pi.
Their laptop only needs the usual local deploy config (`tasks/.env.tasks`) and
SSH access to deploy.

## Permissions

There are two separate permission levels on the Pi:

### Server administrators

The user running these provisioning tasks needs SSH access and passwordless
administrator `sudo`:

```sh
sudo -n true
```

That is required for:

```sh
deno task set-secret <name>
deno task publish-installer
deno task publish-deployer staging
deno task publish-deployer prod
deno task setup-remote
```

These tasks install root-owned binaries and configuration, create systemd units,
manage packages and users, and write sudoers rules. This administrator access is
configured on the Pi outside this repository; `setup-remote` does not grant it.

### Deploy-only developers

Users listed in `DEPLOY_STAGING_USERS` and/or `DEPLOY_PROD_USERS` do not get
general administrator access. The installer adds them to narrowly-scoped deploy
groups that can invoke only the corresponding administrator-owned deployer
binary:

```sh
deno task deploy staging
deno task deploy prod
```

Being in `DEPLOY_STAGING_USERS` permits staging deploys; being in
`DEPLOY_PROD_USERS` permits production deploys. These users cannot publish
binaries, run `setup-remote`, change server configuration, or manage the
systemd-creds secrets unless they are separately granted administrator `sudo`
access on the Pi.
