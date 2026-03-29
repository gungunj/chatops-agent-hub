export type ParsedCommand =
  | { type: "switch_project"; projectName: string }
  | { type: "switch_session"; sessionTitle: string }
  | { type: "execute_task"; taskText: string }
  | { type: "status" }
  | { type: "unknown"; raw: string };

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (trimmed === "状态") {
    return { type: "status" };
  }

  if (trimmed.startsWith("切项目 ")) {
    return {
      type: "switch_project",
      projectName: trimmed.slice("切项目 ".length).trim()
    };
  }

  if (trimmed.startsWith("切会话 ")) {
    return {
      type: "switch_session",
      sessionTitle: trimmed.slice("切会话 ".length).trim()
    };
  }

  if (trimmed.startsWith("执行 ")) {
    return {
      type: "execute_task",
      taskText: trimmed.slice("执行 ".length).trim()
    };
  }

  return {
    type: "unknown",
    raw: input
  };
}
