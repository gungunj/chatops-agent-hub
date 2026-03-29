import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createShellExecCommand } from "./exec-command.js";

describe("createShellExecCommand", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("runs a shell command and captures stdout", async () => {
    const exec = createShellExecCommand();

    const result = await exec("printf hello");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("");
    expect(result.diagnostics?.command).toBe("printf hello");
  });

  it("runs inside the requested cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-exec-"));
    tempDirs.push(dir);
    const resolvedDir = await realpath(dir);

    const exec = createShellExecCommand();
    const result = await exec("pwd", dir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(resolvedDir);
  });

  it("marks commands that exceed the timeout as timed out", async () => {
    const exec = createShellExecCommand({
      timeoutMs: 100
    });

    const result = await exec("sleep 1");

    expect(result.timedOut).toBe(true);
    expect(result.killed).toBe(true);
  });
});
