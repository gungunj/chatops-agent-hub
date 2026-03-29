import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "./server.js";

describe("createApiServer", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    const activeServers = servers.splice(0, servers.length);
    await Promise.all(activeServers.map((server) => server.close()));
    vi.unstubAllGlobals();
    await Promise.all(
      tempDirs.map(async (dir) => {
        await import("node:fs/promises").then(({ rm }) =>
          rm(dir, { recursive: true, force: true })
        );
      })
    );
  });

  it("persists project and session state via the file-backed api", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-agent-api-"));
    tempDirs.push(dir);

    const statePath = join(dir, "state.json");
    const server = createApiServer({
      statePath,
      runner: {
        run: async () => ({
          taskId: "task_001",
          status: "succeeded",
          summary: "execution finished",
          rawOutput: "runner output"
        }),
        cancel: async () => undefined,
        healthCheck: async () => ({
          ok: true,
          detail: "ok"
        })
      }
    });

    servers.push(server);
    await server.listen(0);

    await fetch(`${server.baseUrl}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "project_pm",
        name: "pm",
        repoRoot: "/tmp/pm",
        defaultBranch: "main",
        isActive: true
      })
    });

    await fetch(`${server.baseUrl}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        text: "切项目 pm"
      })
    });

    await fetch(`${server.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        title: "auth-fix",
        goal: "Fix auth bug"
      })
    });

    const firstStatus = await fetch(`${server.baseUrl}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        text: "状态"
      })
    });

    const firstStatusPayload = (await firstStatus.json()) as {
      projectName?: string;
      sessionTitle?: string;
    };

    expect(firstStatusPayload.projectName).toBe("pm");
    expect(firstStatusPayload.sessionTitle).toBe("auth-fix");
  });

  it("can execute through the responses runner mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-agent-api-"));
    tempDirs.push(dir);
    const originalFetch = fetch;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).endsWith("/responses")) {
          return {
            ok: true,
            json: async () => ({
              output_text: "responses runner finished"
            })
          } as Response;
        }

        return originalFetch(input, init);
      })
    );

    const statePath = join(dir, "state.json");
    const server = createApiServer({
      statePath,
      runnerMode: "responses",
      openai: {
        apiKey: "test-key",
        model: "gpt-5-mini"
      }
    });

    servers.push(server);
    await server.listen(0);

    await fetch(`${server.baseUrl}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "project_pm",
        name: "pm",
        repoRoot: "/tmp/pm",
        defaultBranch: "main",
        isActive: true
      })
    });

    await fetch(`${server.baseUrl}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        text: "切项目 pm"
      })
    });

    await fetch(`${server.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        title: "auth-fix",
        goal: "Fix auth bug"
      })
    });

    const executeResponse = await fetch(`${server.baseUrl}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        text: "执行 修复 auth bug"
      })
    });

    const payload = (await executeResponse.json()) as {
      status: string;
      summary: string;
    };

    expect(executeResponse.status).toBe(202);
    expect(payload.status).toBe("queued");
    expect(payload.summary).toBe("Task accepted");
  });
});
