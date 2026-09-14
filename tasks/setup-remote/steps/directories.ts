import { REMOTE_ENV_NAMES } from "../../utils/environment.ts";
import {
  APP_GROUP,
  APP_USER,
  deployGroupName,
} from "../../utils/infrastructure.ts";
import {
  ETC_ROOT,
  REMOTE_PATHS,
  STATE_ROOT,
  SYSTEM_PATHS,
} from "../../utils/remote-paths.ts";
import { COLORS } from "../constants.ts";
import { ensureDirectory, type StepResult } from "../step-helpers.ts";

export async function ensureDirectoryLayout(): Promise<StepResult[]> {
  const results: StepResult[] = [];

  results.push(
    await ensureDirectory(REMOTE_PATHS.app, {
      owner: "root",
      group: APP_GROUP,
      mode: "710",
    }),
  );
  results.push(
    await ensureDirectory(REMOTE_PATHS.upload, {
      owner: "root",
      group: "root",
      mode: "711",
    }),
  );
  results.push(
    await ensureDirectory(STATE_ROOT, {
      owner: "root",
      group: "root",
      mode: "711",
    }),
  );
  results.push(
    await ensureDirectory(REMOTE_PATHS.cache, {
      owner: "root",
      group: APP_GROUP,
      mode: "710",
    }),
  );
  results.push(
    await ensureDirectory(REMOTE_PATHS.deployer, {
      owner: "root",
      group: APP_GROUP,
      mode: "750",
    }),
  );
  results.push(
    await ensureDirectory(ETC_ROOT, {
      owner: "root",
      group: APP_GROUP,
      mode: "750",
    }),
  );
  results.push(
    await ensureDirectory(REMOTE_PATHS.geoip, {
      owner: "root",
      group: "root",
      mode: "755",
    }),
  );
  results.push(
    await ensureDirectory(SYSTEM_PATHS.cloudflaredConfig, {
      owner: "root",
      group: "root",
      mode: "755",
    }),
  );

  for (const env of REMOTE_ENV_NAMES) {
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.app}/${env}`, {
        owner: APP_USER,
        group: APP_GROUP,
        mode: "700",
      }),
    );
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.storageMount}/${env}`, {
        owner: APP_USER,
        group: APP_GROUP,
        mode: "700",
      }),
    );
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.storageMount}/${env}/db`, {
        owner: APP_USER,
        group: APP_GROUP,
        mode: "700",
      }),
    );
    for (const color of COLORS) {
      results.push(
        await ensureDirectory(`${REMOTE_PATHS.app}/${env}/${color}`, {
          owner: APP_USER,
          group: APP_GROUP,
          mode: "700",
        }),
      );
      results.push(
        await ensureDirectory(`${REMOTE_PATHS.cache}/${env}/${color}`, {
          owner: APP_USER,
          group: APP_GROUP,
          mode: "700",
        }),
      );
    }
    results.push(
      await ensureDirectory(`${ETC_ROOT}/${env}`, {
        owner: APP_USER,
        group: APP_GROUP,
        mode: "750",
      }),
    );
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.upload}/${env}`, {
        owner: APP_USER,
        group: deployGroupName(env),
        mode: "2730",
      }),
    );
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.cache}/${env}`, {
        owner: APP_USER,
        group: APP_GROUP,
        mode: "700",
      }),
    );
    results.push(
      await ensureDirectory(`${REMOTE_PATHS.deployer}/${env}`, {
        owner: "root",
        group: APP_GROUP,
        mode: "750",
      }),
    );
  }

  return results;
}
