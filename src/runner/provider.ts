import type { RunnerHealth, RunnerResult, RunnerTask } from "./types.js";

export interface RunnerProvider {
  run(task: RunnerTask): Promise<RunnerResult>;
  cancel(taskId: string): Promise<void>;
  healthCheck(): Promise<RunnerHealth>;
}
