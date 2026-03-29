import { describe, expect, it, vi } from "vitest";

import { createCodexCliRunner } from "./codex-cli-runner.js";
import { createShellExecCommand } from "./exec-command.js";

describe("createCodexCliRunner", () => {
  it("returns a health-checkable runner provider", async () => {
    const exec = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "Codex CLI",
      stderr: "",
      durationMs: 10
    });

    const runner = createCodexCliRunner({ exec });

    await expect(runner.healthCheck()).resolves.toEqual({
      ok: true,
      detail: "Codex CLI available"
    });
  });

  it("can be paired with a real shell exec implementation", async () => {
    const runner = createCodexCliRunner({
      exec: createShellExecCommand()
    });

    const result = await runner.healthCheck();

    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.detail).toBe("string");
  });
});
