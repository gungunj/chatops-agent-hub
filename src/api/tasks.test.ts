import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createApiServer } from "./server.js";

describe("task status api", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    const activeServers = servers.splice(0, servers.length);
    await Promise.all(activeServers.map((server) => server.close()));
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("returns queued and final task details for an execute command", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-tasks-"));
    tempDirs.push(dir);
    let releaseRun: (() => void) | undefined;
    const runCompleted = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const server = createApiServer({
      statePath: join(dir, "state.json"),
      runner: {
        run: async () => {
          await runCompleted;
          return {
            taskId: "task_001",
            status: "succeeded",
            summary: "execution finished",
            rawOutput: "runner output"
          };
        },
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

    const executeResponse = await fetch(`${server.baseUrl}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        text: "执行 修复 auth bug"
      })
    });

    const executePayload = (await executeResponse.json()) as {
      taskId: string;
      status: string;
      summary: string;
    };

    expect(executeResponse.status).toBe(202);
    expect(executePayload.status).toBe("queued");
    expect(executePayload.summary).toBe("Task accepted");

    const queuedTaskResponse = await fetch(`${server.baseUrl}/tasks/${executePayload.taskId}`);
    const queuedTaskPayload = (await queuedTaskResponse.json()) as {
      taskId: string;
      status: string;
      summary: string;
      rawOutput: string;
    };

    expect(queuedTaskResponse.status).toBe(200);
    expect(queuedTaskPayload.taskId).toBe("task_001");
    expect(["queued", "running"]).toContain(queuedTaskPayload.status);

    releaseRun?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const finalTaskResponse = await fetch(`${server.baseUrl}/tasks/${executePayload.taskId}`);
    const finalTaskPayload = (await finalTaskResponse.json()) as {
      taskId: string;
      status: string;
      summary: string;
      rawOutput: string;
    };

    expect(finalTaskResponse.status).toBe(200);
    expect(finalTaskPayload.taskId).toBe("task_001");
    expect(finalTaskPayload.status).toBe("succeeded");
    expect(finalTaskPayload.summary).toBe("execution finished");
    expect(finalTaskPayload.rawOutput).toContain("runner output");
  });
});
