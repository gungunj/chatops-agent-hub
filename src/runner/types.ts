export type RunnerExecResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
  killed?: boolean;
  diagnostics?: {
    startedAt: string;
    endedAt: string;
    command: string;
    cwd?: string;
    stdoutBytes: number;
    stderrBytes: number;
  };
};

export type RunnerTask = {
  taskId: string;
  cwd: string;
  prompt: string;
};

export type RunnerResult = {
  taskId: string;
  status: "succeeded" | "failed";
  summary: string;
  rawOutput: string;
};

export type RunnerHealth = {
  ok: boolean;
  detail: string;
};

export type ExecCommand = (command: string, cwd?: string) => Promise<RunnerExecResult>;
