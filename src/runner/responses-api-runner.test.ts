import { afterEach, describe, expect, it, vi } from "vitest";

import { createResponsesApiRunner } from "./responses-api-runner.js";

describe("createResponsesApiRunner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a missing api key in health checks", async () => {
    const runner = createResponsesApiRunner({
      apiKey: undefined
    });

    await expect(runner.healthCheck()).resolves.toEqual({
      ok: false,
      detail: "Responses API unavailable: OPENAI_API_KEY is not configured"
    });
  });

  it("maps output_text responses into runner results", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: "Task completed"
      })
    });
    vi.stubGlobal("fetch", mockFetch);

    const runner = createResponsesApiRunner({
      apiKey: "test-key",
      model: "gpt-5-mini"
    });

    const result = await runner.run({
      taskId: "task_001",
      cwd: "/tmp/project",
      prompt: "Say hello"
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key",
          "content-type": "application/json"
        })
      })
    );
    expect(result).toEqual({
      taskId: "task_001",
      status: "succeeded",
      summary: "Task completed",
      rawOutput: JSON.stringify(
        {
          output_text: "Task completed"
        },
        null,
        2
      )
    });
  });

  it("falls back to message output content when output_text is absent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "First line"
              },
              {
                type: "output_text",
                text: "Second line"
              }
            ]
          }
        ]
      })
    });
    vi.stubGlobal("fetch", mockFetch);

    const runner = createResponsesApiRunner({
      apiKey: "test-key"
    });

    const result = await runner.run({
      taskId: "task_002",
      cwd: "/tmp/project",
      prompt: "Summarize"
    });

    expect(result.status).toBe("succeeded");
    expect(result.summary).toBe("First line\nSecond line");
  });
});
