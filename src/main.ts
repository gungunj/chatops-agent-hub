import "dotenv/config";

import { createApiServer } from "./api/server.js";
import { loadRuntimeConfig } from "./config/runtime-config.js";

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  const server = createApiServer();

  await server.listen(config.server.port, config.server.host);

  // Keep startup output compact so it's easy to copy into deployment logs.
  console.log(
    JSON.stringify({
      ok: true,
      host: config.server.host,
      port: config.server.port,
      baseUrl: server.baseUrl,
      runnerMode: config.runner.mode
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown startup error"
    })
  );
  process.exitCode = 1;
});
