import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parseProject, type Project } from "../domain/project.js";
import { parseSession, type Session } from "../domain/session.js";

type UserBinding = {
  projectId?: string;
  sessionId?: string;
};

type CreateSessionInput = {
  userId: string;
  title: string;
  goal: string;
};

type BindProjectInput = {
  userId: string;
  projectName: string;
};

type SessionServiceStatus = {
  project?: Project;
  session?: Session;
};

type SessionState = {
  projects: Record<string, Project>;
  sessions: Record<string, Session>;
  bindings: Record<string, UserBinding>;
};

export type SessionService = {
  registerProject(project: Project): Promise<void>;
  bindProject(input: BindProjectInput): Promise<void>;
  createSession(input: CreateSessionInput): Promise<Session>;
  getCurrentSession(userId: string): Promise<Session | undefined>;
  getStatus(userId: string): Promise<SessionServiceStatus>;
};

function createEmptyState(): SessionState {
  return {
    projects: {},
    sessions: {},
    bindings: {}
  };
}

function createSessionFromProject(options: {
  index: number;
  project: Project;
  title: string;
  goal: string;
}): Session {
  return parseSession({
    id: `session_${options.index}`,
    projectId: options.project.id,
    title: options.title,
    goal: options.goal,
    status: "active",
    repoRoot: options.project.repoRoot,
    branch: options.project.defaultBranch,
    worktreeId: `worktree_${options.index}`,
    baseCommit: "unknown",
    lastSeenHead: "unknown",
    dirtyState: "unknown",
    recoveryPolicy: "warn"
  });
}

async function readStateFile(statePath: string): Promise<SessionState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as SessionState;

    return {
      projects: parsed.projects ?? {},
      sessions: parsed.sessions ?? {},
      bindings: parsed.bindings ?? {}
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyState();
    }

    throw error;
  }
}

export function createFileSessionService(options: {
  statePath: string;
}): SessionService {
  let loadedState: SessionState | undefined;

  const ensureLoaded = async (): Promise<SessionState> => {
    if (!loadedState) {
      loadedState = await readStateFile(options.statePath);
    }

    return loadedState;
  };

  const persist = async (state: SessionState): Promise<void> => {
    await mkdir(dirname(options.statePath), { recursive: true });
    await writeFile(options.statePath, JSON.stringify(state, null, 2));
  };

  const getBinding = (state: SessionState, userId: string): UserBinding => {
    const existing = state.bindings[userId];
    if (existing) {
      return existing;
    }

    const next: UserBinding = {};
    state.bindings[userId] = next;
    return next;
  };

  return {
    async registerProject(project: Project): Promise<void> {
      const state = await ensureLoaded();
      state.projects[project.id] = parseProject(project);
      await persist(state);
    },
    async bindProject(input: BindProjectInput): Promise<void> {
      const state = await ensureLoaded();
      const project = Object.values(state.projects).find(
        (item) => item.name === input.projectName
      );
      if (!project) {
        throw new Error(`Unknown project: ${input.projectName}`);
      }

      const binding = getBinding(state, input.userId);
      binding.projectId = project.id;
      binding.sessionId = undefined;
      await persist(state);
    },
    async createSession(input: CreateSessionInput): Promise<Session> {
      const state = await ensureLoaded();
      const binding = getBinding(state, input.userId);
      if (!binding.projectId) {
        throw new Error("No project selected");
      }

      const project = state.projects[binding.projectId];
      if (!project) {
        throw new Error("Bound project not found");
      }

      const session = createSessionFromProject({
        index: Object.keys(state.sessions).length + 1,
        project,
        title: input.title,
        goal: input.goal
      });

      state.sessions[session.id] = session;
      binding.sessionId = session.id;
      await persist(state);
      return session;
    },
    async getCurrentSession(userId: string): Promise<Session | undefined> {
      const state = await ensureLoaded();
      const binding = state.bindings[userId];
      if (!binding?.sessionId) {
        return undefined;
      }

      return state.sessions[binding.sessionId];
    },
    async getStatus(userId: string): Promise<SessionServiceStatus> {
      const state = await ensureLoaded();
      const binding = state.bindings[userId];
      if (!binding) {
        return {};
      }

      return {
        project: binding.projectId ? state.projects[binding.projectId] : undefined,
        session: binding.sessionId ? state.sessions[binding.sessionId] : undefined
      };
    }
  };
}
