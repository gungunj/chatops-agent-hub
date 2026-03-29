import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./runtime-config.js";

describe("loadRuntimeConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers responses mode when OPENAI_API_KEY is configured", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-5-mini";
    process.env.OPENAI_BASE_URL = "https://example.com/v1";

    const config = loadRuntimeConfig();

    expect(config.runner.mode).toBe("responses");
    expect(config.runner.openai).toEqual({
      apiKey: "test-key",
      model: "gpt-5-mini",
      baseUrl: "https://example.com/v1"
    });
  });

  it("honors explicit cli mode from RUNNER_MODE", () => {
    process.env.RUNNER_MODE = "cli";
    process.env.OPENAI_API_KEY = "test-key";

    const config = loadRuntimeConfig();

    expect(config.runner.mode).toBe("cli");
    expect(config.runner.openai.apiKey).toBe("test-key");
  });

  it("loads feishu and state path settings", () => {
    process.env.STATE_PATH = "var/state.json";
    process.env.FEISHU_ENCRYPT_KEY = "encrypt-key";
    process.env.HOST = "0.0.0.0";
    process.env.PORT = "8080";

    const config = loadRuntimeConfig();

    expect(config.statePath).toBe("var/state.json");
    expect(config.feishu.encryptKey).toBe("encrypt-key");
    expect(config.server).toEqual({
      host: "0.0.0.0",
      port: 8080
    });
  });
});
