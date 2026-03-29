import { z } from "zod";

export const sessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(["active", "paused", "completed", "failed"]),
  repoRoot: z.string().min(1),
  branch: z.string().min(1),
  worktreeId: z.string().min(1),
  baseCommit: z.string().min(1),
  lastSeenHead: z.string().min(1),
  dirtyState: z.enum(["clean", "dirty", "unknown"]),
  recoveryPolicy: z.enum(["strict", "warn", "force"]).default("warn")
});

export type Session = z.infer<typeof sessionSchema>;

export function parseSession(input: unknown): Session {
  return sessionSchema.parse(input);
}
