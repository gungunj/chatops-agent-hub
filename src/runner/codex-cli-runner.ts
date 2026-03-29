import type { RunnerProvider } from "./provider.js";
import type {
  ExecCommand,
  RunnerHealth,
  RunnerResult,
  RunnerTask
} from "./types.js";

type CodexCliRunnerOptions = {
  exec: ExecCommand;
};

export function createCodexCliRunner(
  options: CodexCliRunnerOptions
): RunnerProvider {
  return {
    async run(task: RunnerTask): Promise<RunnerResult> {
      const result = await options.exec(`codex exec ${JSON.stringify(task.prompt)}`, task.cwd);

      return {
        taskId: result.exitCode === 0 ? task.taskId : task.taskId,
        status: result.exitCode === 0 ? "succeeded" : "failed",
        summary: result.stdout.trim() || result.stderr.trim(),
        rawOutput: [result.stdout, result.stderr].filter(Boolean).join("\n")
      };
    },
    async cancel(): Promise<void> {
      return;
    },
    async healthCheck(): Promise<RunnerHealth> {
      const result = await options.exec("codex --help");

      return {
        ok: result.exitCode === 0,
        detail: result.exitCode === 0 ? "Codex CLI available" : "Codex CLI unavailable"
      };
    }
  };
}
