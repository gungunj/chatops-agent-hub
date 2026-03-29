import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { parseCommand } from "../app/command-router.js";
import {
  createFileSessionService,
  type SessionService
} from "../app/session-service.js";
import { createInMemoryTaskStore } from "../app/task-store.js";
import { createTaskOrchestrator } from "../app/task-orchestrator.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";
import {
  getFeishuChallenge,
  isFeishuUrlVerification,
  parseFeishuCommand,
  verifyFeishuSignature
} from "../connectors/feishu.js";
import {
  createFeishuMessageClient,
  type FeishuMessageClient
} from "../connectors/feishu-client.js";
import { createCodexCliRunner } from "../runner/codex-cli-runner.js";
import { createShellExecCommand } from "../runner/exec-command.js";
import type { RunnerProvider } from "../runner/provider.js";
import { createResponsesApiRunner } from "../runner/responses-api-runner.js";

type JsonRecord = Record<string, unknown>;

async function readBody(request: IncomingMessage): Promise<{
  rawBody: string;
  json: JsonRecord;
}> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return {
    rawBody: raw,
    json: raw ? (JSON.parse(raw) as JsonRecord) : {}
  };
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: JsonRecord
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(payload));
}

function summarizePayload(payload: JsonRecord): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  if (typeof payload.error === "string" && payload.error.trim()) {
    return `Error: ${payload.error}`;
  }

  if (typeof payload.summary === "string" && payload.summary.trim()) {
    return payload.summary;
  }

  if (typeof payload.projectName === "string" || typeof payload.sessionTitle === "string") {
    const parts = [
      typeof payload.projectName === "string" ? `project=${payload.projectName}` : undefined,
      typeof payload.sessionTitle === "string" ? `session=${payload.sessionTitle}` : undefined
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(", ");
    }
  }

  return JSON.stringify(payload);
}

async function handleCommand(options: {
  sessionService: SessionService;
  orchestrator: ReturnType<typeof createTaskOrchestrator>;
  userId: string;
  text: string;
  onTaskComplete?: (
    task: Awaited<ReturnType<ReturnType<typeof createTaskOrchestrator>["enqueue"]>>
  ) => Promise<void> | void;
}): Promise<{ statusCode: number; payload: JsonRecord }> {
  const command = parseCommand(options.text);

  if (command.type === "switch_project") {
    await options.sessionService.bindProject({
      userId: options.userId,
      projectName: command.projectName
    });

    return {
      statusCode: 200,
      payload: {
        message: `Switched to project ${command.projectName}`
      }
    };
  }

  if (command.type === "execute_task") {
    const session = await options.sessionService.getCurrentSession(options.userId);
    if (!session) {
      return {
        statusCode: 400,
        payload: {
          error: "No active session selected"
        }
      };
    }

    const task = await options.orchestrator.enqueue({
      userId: options.userId,
      sessionId: session.id,
      cwd: session.repoRoot,
      prompt: command.taskText,
      onComplete: options.onTaskComplete
    });

    return {
      statusCode: 202,
      payload: {
        taskId: task.taskId,
        status: task.status,
        summary: task.summary
      }
    };
  }

  if (command.type === "status") {
    const status = await options.sessionService.getStatus(options.userId);
    return {
      statusCode: 200,
      payload: {
        projectName: status.project?.name,
        sessionTitle: status.session?.title
      }
    };
  }

  return {
    statusCode: 200,
    payload: {
      message: "Command accepted but not implemented yet",
      commandType: command.type
    }
  };
}

export function createApiServer(options: {
  runner?: RunnerProvider;
  runnerMode?: "auto" | "cli" | "responses";
  sessionService?: SessionService;
  statePath?: string;
  openai?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  feishu?: {
    encryptKey?: string;
  };
  feishuMessageClient?: FeishuMessageClient;
} = {}) {
  const runtimeConfig = loadRuntimeConfig();
  const sessionService =
    options.sessionService ??
    createFileSessionService({
      statePath: options.statePath ?? runtimeConfig.statePath
    });
  const taskStore = createInMemoryTaskStore();
  const runner =
    options.runner ??
    (options.runnerMode === "cli"
      ? createCodexCliRunner({
          exec: createShellExecCommand()
        })
      : options.runnerMode === "responses"
        ? createResponsesApiRunner({
            apiKey: options.openai?.apiKey ?? runtimeConfig.runner.openai.apiKey,
            baseUrl: options.openai?.baseUrl ?? runtimeConfig.runner.openai.baseUrl,
            model: options.openai?.model ?? runtimeConfig.runner.openai.model
          })
        : options.runnerMode === "auto"
          ? runtimeConfig.runner.mode === "responses"
            ? createResponsesApiRunner({
                apiKey: options.openai?.apiKey ?? runtimeConfig.runner.openai.apiKey,
                baseUrl: options.openai?.baseUrl ?? runtimeConfig.runner.openai.baseUrl,
                model: options.openai?.model ?? runtimeConfig.runner.openai.model
              })
            : createCodexCliRunner({
                exec: createShellExecCommand()
              })
          : runtimeConfig.runner.mode === "responses" || options.openai?.apiKey
          ? createResponsesApiRunner({
              apiKey: options.openai?.apiKey ?? runtimeConfig.runner.openai.apiKey,
              baseUrl: options.openai?.baseUrl ?? runtimeConfig.runner.openai.baseUrl,
              model: options.openai?.model ?? runtimeConfig.runner.openai.model
            })
          : createCodexCliRunner({
              exec: createShellExecCommand()
            }));
  const orchestrator = createTaskOrchestrator({ runner, taskStore });
  const feishuMessageClient =
    options.feishuMessageClient ?? createFeishuMessageClient();

  const server = createServer(async (request, response) => {
    try {
      if (!request.url || !request.method) {
        writeJson(response, 400, { error: "Invalid request" });
        return;
      }

      if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && request.url === "/projects") {
        const { json: body } = await readBody(request);
        await sessionService.registerProject({
          id: String(body.id),
          name: String(body.name),
          repoRoot: String(body.repoRoot),
          defaultBranch: String(body.defaultBranch),
          isActive: Boolean(body.isActive)
        });
        writeJson(response, 201, { ok: true });
        return;
      }

      if (request.method === "POST" && request.url === "/sessions") {
        const { json: body } = await readBody(request);
        const session = await sessionService.createSession({
          userId: String(body.userId),
          title: String(body.title),
          goal: String(body.goal)
        });

        writeJson(response, 201, {
          sessionId: session.id,
          title: session.title
        });
        return;
      }

      if (request.method === "POST" && request.url === "/commands") {
        const { json: body } = await readBody(request);
        const result = await handleCommand({
          sessionService,
          orchestrator,
          userId: String(body.userId),
          text: String(body.text)
        });

        writeJson(response, result.statusCode, result.payload);
        return;
      }

      if (request.method === "POST" && request.url === "/webhooks/feishu") {
        const { rawBody, json: body } = await readBody(request);

        if (isFeishuUrlVerification(body)) {
          writeJson(response, 200, {
            challenge: getFeishuChallenge(body)
          });
          return;
        }

        const isValidSignature = verifyFeishuSignature({
          rawBody,
          timestamp: request.headers["x-lark-request-timestamp"] as string | undefined,
          nonce: request.headers["x-lark-request-nonce"] as string | undefined,
          signature: request.headers["x-lark-signature"] as string | undefined,
          encryptKey: options.feishu?.encryptKey ?? runtimeConfig.feishu.encryptKey
        });

        if (!isValidSignature) {
          writeJson(response, 401, {
            error: "Invalid Feishu signature"
          });
          return;
        }

        const command = parseFeishuCommand(body);
        if (!command) {
          writeJson(response, 400, {
            error: "Unsupported Feishu event"
          });
          return;
        }

        const result = await handleCommand({
          sessionService,
          orchestrator,
          userId: command.userId,
          text: command.text,
          onTaskComplete: async (task) => {
            await feishuMessageClient.sendTextMessage({
              receiveId: command.userId,
              receiveIdType: "open_id",
              text: task.summary
            });
          }
        });

        await feishuMessageClient.sendTextMessage({
          receiveId: command.userId,
          receiveIdType: "open_id",
          text: summarizePayload(result.payload)
        });

        writeJson(response, result.statusCode, result.payload);
        return;
      }

      if (request.method === "GET" && request.url.startsWith("/tasks/")) {
        const taskId = request.url.slice("/tasks/".length);
        const task = taskStore.get(taskId);

        if (!task) {
          writeJson(response, 404, {
            error: "Task not found"
          });
          return;
        }

        writeJson(response, 200, task);
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  let port = 0;

  return {
    get baseUrl(): string {
      return `http://127.0.0.1:${port}`;
    },
    async listen(nextPort: number, host = "127.0.0.1"): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(nextPort, host, () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Failed to resolve server address"));
            return;
          }

          port = address.port;
          resolve();
        });
      });
    },
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}
