import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFileSessionService } from "./session-service.js";

describe("createFileSessionService", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await import("node:fs/promises").then(({ rm }) =>
          rm(dir, { recursive: true, force: true })
        );
      })
    );
  });

  it("persists projects, bindings, and sessions across service instances", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-agent-state-"));
    tempDirs.push(dir);

    const statePath = join(dir, "state.json");

    const first = createFileSessionService({ statePath });
    await first.registerProject({
      id: "project_pm",
      name: "pm",
      repoRoot: "/tmp/pm",
      defaultBranch: "main",
      isActive: true
    });
    await first.bindProject({
      userId: "u1",
      projectName: "pm"
    });
    await first.createSession({
      userId: "u1",
      title: "auth-fix",
      goal: "Fix auth bug"
    });

    const second = createFileSessionService({ statePath });
    const status = await second.getStatus("u1");

    expect(status.project?.name).toBe("pm");
    expect(status.session?.title).toBe("auth-fix");
  });
});
