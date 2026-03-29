import { z } from "zod";

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  repoRoot: z.string().min(1),
  defaultBranch: z.string().min(1),
  isActive: z.boolean()
});

export type Project = z.infer<typeof projectSchema>;

export function parseProject(input: unknown): Project {
  return projectSchema.parse(input);
}
