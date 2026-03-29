type StoredTask = {
  taskId: string;
  userId: string;
  sessionId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  summary: string;
  rawOutput: string;
};

export function createInMemoryTaskStore() {
  const tasks = new Map<string, StoredTask>();

  return {
    save(task: StoredTask): void {
      tasks.set(task.taskId, task);
    },
    update(
      taskId: string,
      patch: Partial<Omit<StoredTask, "taskId">>
    ): StoredTask | undefined {
      const existing = tasks.get(taskId);
      if (!existing) {
        return undefined;
      }

      const next = {
        ...existing,
        ...patch
      };
      tasks.set(taskId, next);
      return next;
    },
    get(taskId: string): StoredTask | undefined {
      return tasks.get(taskId);
    }
  };
}
