import { spawn } from "node:child_process";

import type { ExecCommand, RunnerExecResult } from "./types.js";

type ShellExecOptions = {
  timeoutMs?: number;
};

export function createShellExecCommand(
  options: ShellExecOptions = {}
): ExecCommand {
  return (command: string, cwd?: string) =>
    new Promise<RunnerExecResult>((resolve, reject) => {
      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const child = spawn("/bin/zsh", ["-c", command], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let killed = false;
      const timeout =
        options.timeoutMs && options.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              killed = child.kill("SIGTERM");
            }, options.timeoutMs)
          : undefined;

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        reject(error);
      });
      child.on("close", (code) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        const endedAt = Date.now();
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: endedAt - startedAt,
          timedOut,
          killed,
          diagnostics: {
            startedAt: startedAtIso,
            endedAt: new Date(endedAt).toISOString(),
            command,
            cwd,
            stdoutBytes: Buffer.byteLength(stdout),
            stderrBytes: Buffer.byteLength(stderr)
          }
        });
      });
    });
}
