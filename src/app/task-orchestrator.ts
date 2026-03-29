import type { RunnerProvider } from "../runner/provider.js";
import { createInMemoryTaskStore } from "./task-store.js";

type EnqueueTaskInput = {
  userId: string;
  sessionId: string;
  cwd: string;
  prompt: string;
  onComplete?: (result: OrchestratorTaskResult) => Promise<void> | void;
};

type OrchestratorTaskResult = {
  taskId: string;
  userId: string;
  sessionId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  summary: string;
  rawOutput: string;
};

export function createTaskOrchestrator(options: {
  runner: RunnerProvider;
  taskStore: ReturnType<typeof createInMemoryTaskStore>;
}) {
  let nextTaskId = 1;

  return {
    async enqueue(input: EnqueueTaskInput): Promise<OrchestratorTaskResult> {
      const taskId = `task_${String(nextTaskId).padStart(3, "0")}`;
      nextTaskId += 1;

      const acceptedTask: OrchestratorTaskResult = {
        taskId,
        userId: input.userId,
        sessionId: input.sessionId,
        status: "queued",
        summary: "Task accepted",
        rawOutput: ""
      };

      options.taskStore.save(acceptedTask);

      queueMicrotask(async () => {
        options.taskStore.update(taskId, {
          status: "running",
          summary: "Task is running"
        });

        const result = await options.runner.run({
          taskId,
          cwd: input.cwd,
          prompt: input.prompt
        });

        const finishedTask: OrchestratorTaskResult = {
          taskId: result.taskId,
          userId: input.userId,
          sessionId: input.sessionId,
          status: result.status,
          summary: result.summary,
          rawOutput: result.rawOutput
        };

        options.taskStore.update(taskId, finishedTask);
        await input.onComplete?.(finishedTask);
      });

      return acceptedTask;
    }
  };
}
