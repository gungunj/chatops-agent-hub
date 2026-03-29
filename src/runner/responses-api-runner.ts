import type { RunnerProvider } from "./provider.js";
import type { RunnerHealth, RunnerResult, RunnerTask } from "./types.js";

type ResponsesApiRunnerOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

type ResponsesApiPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function trimTrailingSlash(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function extractOutputText(payload: ResponsesApiPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];

  for (const item of payload.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        const text = content.text.trim();
        if (text) {
          parts.push(text);
        }
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("\n");
  }

  return payload.error?.message?.trim() || "Responses API returned no output text";
}

export function createResponsesApiRunner(
  options: ResponsesApiRunnerOptions = {}
): RunnerProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = trimTrailingSlash(
    options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  );
  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-5";
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async run(task: RunnerTask): Promise<RunnerResult> {
      if (!apiKey) {
        return {
          taskId: task.taskId,
          status: "failed",
          summary: "OPENAI_API_KEY is not configured",
          rawOutput: "OPENAI_API_KEY is not configured"
        };
      }

      const response = await fetchImpl(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: task.prompt,
          store: false,
          metadata: {
            task_id: task.taskId,
            cwd: task.cwd
          }
        })
      });

      const payload = (await response.json()) as ResponsesApiPayload;
      const outputText = extractOutputText(payload);

      return {
        taskId: task.taskId,
        status: response.ok ? "succeeded" : "failed",
        summary: outputText,
        rawOutput: JSON.stringify(payload, null, 2)
      };
    },
    async cancel(): Promise<void> {
      return;
    },
    async healthCheck(): Promise<RunnerHealth> {
      if (!apiKey) {
        return {
          ok: false,
          detail: "Responses API unavailable: OPENAI_API_KEY is not configured"
        };
      }

      return {
        ok: true,
        detail: `Responses API configured for model ${model}`
      };
    }
  };
}
