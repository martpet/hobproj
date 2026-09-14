import { delay } from "@std/async";

interface HealthCheckOptions {
  readonly service: string;
  readonly port: string;
  readonly expectedDeploymentId: string;
  readonly attempts?: number;
}

export async function checkHealth({
  service,
  port,
  expectedDeploymentId,
  // The check starts right after `deno compile` has saturated the Pi's CPU
  // and flushed a ~110MB binary to disk, so the first start of a fresh
  // binary is far slower than a warm one (~4.7s cold vs ~1.7s warm when
  // measured on an idle machine). A short budget turned that into a false
  // failure. Waiting longer costs nothing on success, since the loop
  // returns as soon as the service reports the expected SHA.
  attempts = 30,
}: HealthCheckOptions) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { "X-Forwarded-Proto": "https" },
        signal: AbortSignal.timeout(2_000),
      });
      const health = await response.text();

      if (
        response.ok &&
        health === `{"deploymentId":"${expectedDeploymentId}"}`
      ) {
        return;
      }
    } catch {
      // systemd can report the process active before Deno binds its listener.
    }

    console.log(
      `Waiting for ${service} health check (attempt ${attempt}/${attempts})...`,
    );
    await delay(1_000);
  }

  throw new Error(
    `Health check failed: expected deployment ID ${expectedDeploymentId}.`,
  );
}
