export type RunnerMode = "auto" | "cli" | "responses";

export type RuntimeConfig = {
  server: {
    host: string;
    port: number;
  };
  statePath: string;
  runner: {
    mode: RunnerMode;
    openai: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
  };
  feishu: {
    encryptKey?: string;
  };
};

function parseRunnerMode(value: string | undefined): RunnerMode {
  if (value === "cli" || value === "responses" || value === "auto") {
    return value;
  }

  return "auto";
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  const explicitMode = parseRunnerMode(env.RUNNER_MODE);
  const hasOpenAiKey = Boolean(env.OPENAI_API_KEY);
  const mode =
    explicitMode === "auto" ? (hasOpenAiKey ? "responses" : "auto") : explicitMode;

  return {
    server: {
      host: env.HOST ?? "127.0.0.1",
      port: Number(env.PORT ?? "3000")
    },
    statePath: env.STATE_PATH ?? "state/session-state.json",
    runner: {
      mode,
      openai: {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL
      }
    },
    feishu: {
      encryptKey: env.FEISHU_ENCRYPT_KEY
    }
  };
}
