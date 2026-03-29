import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiServer } from "../api/server.js";

describe("feishu webhook", () => {
  const servers: Array<{ close: () => Promise<void> }> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    const activeServers = servers.splice(0, servers.length);
    await Promise.all(activeServers.map((server) => server.close()));
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("handles url verification requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-feishu-"));
    tempDirs.push(dir);

    const server = createApiServer({
      statePath: join(dir, "state.json")
    });
    servers.push(server);
    await server.listen(0);

    const response = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        type: "url_verification",
        challenge: "challenge-token"
      })
    });

    const payload = (await response.json()) as { challenge?: string };

    expect(response.status).toBe(200);
    expect(payload.challenge).toBe("challenge-token");
  });

  it("routes text messages into the existing command flow", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-feishu-"));
    tempDirs.push(dir);
    const sendTextMessage = vi.fn().mockResolvedValue({
      ok: true,
      messageId: "om_reply_1"
    });

    const server = createApiServer({
      statePath: join(dir, "state.json"),
      feishuMessageClient: {
        sendTextMessage
      },
      runner: {
        run: async () => ({
          taskId: "task_001",
          status: "succeeded",
          summary: "execution finished",
          rawOutput: "runner output"
        }),
        cancel: async () => undefined,
        healthCheck: async () => ({
          ok: true,
          detail: "ok"
        })
      }
    });
    servers.push(server);
    await server.listen(0);

    await fetch(`${server.baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "project_pm",
        name: "pm",
        repoRoot: "/tmp/pm",
        defaultBranch: "main",
        isActive: true
      })
    });

    const switchProject = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        header: {
          event_type: "im.message.receive_v1"
        },
        event: {
          sender: {
            sender_id: {
              open_id: "feishu-user-1"
            }
          },
          message: {
            message_type: "text",
            content: JSON.stringify({
              text: "切项目 pm"
            })
          }
        }
      })
    });

    const switchPayload = (await switchProject.json()) as { message?: string };

    expect(switchProject.status).toBe(200);
    expect(switchPayload.message).toContain("pm");

    const statusResponse = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        header: {
          event_type: "im.message.receive_v1"
        },
        event: {
          sender: {
            sender_id: {
              open_id: "feishu-user-1"
            }
          },
          message: {
            message_type: "text",
            content: JSON.stringify({
              text: "状态"
            })
          }
        }
      })
    });

    const statusPayload = (await statusResponse.json()) as {
      projectName?: string;
    };

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.projectName).toBe("pm");
    expect(sendTextMessage).toHaveBeenNthCalledWith(1, {
      receiveId: "feishu-user-1",
      receiveIdType: "open_id",
      text: "Switched to project pm"
    });
    expect(sendTextMessage).toHaveBeenNthCalledWith(2, {
      receiveId: "feishu-user-1",
      receiveIdType: "open_id",
      text: "project=pm"
    });
  });

  it("acknowledges execute commands immediately and pushes a final result message later", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-feishu-"));
    tempDirs.push(dir);
    let releaseRun: (() => void) | undefined;
    const runCompleted = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });
    const sendTextMessage = vi.fn().mockResolvedValue({
      ok: true,
      messageId: "om_reply_1"
    });

    const server = createApiServer({
      statePath: join(dir, "state.json"),
      feishuMessageClient: {
        sendTextMessage
      },
      runner: {
        run: async () => {
          await runCompleted;
          return {
            taskId: "task_001",
            status: "succeeded",
            summary: "execution finished",
            rawOutput: "runner output"
          };
        },
        cancel: async () => undefined,
        healthCheck: async () => ({
          ok: true,
          detail: "ok"
        })
      }
    });
    servers.push(server);
    await server.listen(0);

    await fetch(`${server.baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "project_pm",
        name: "pm",
        repoRoot: "/tmp/pm",
        defaultBranch: "main",
        isActive: true
      })
    });

    await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        header: {
          event_type: "im.message.receive_v1"
        },
        event: {
          sender: {
            sender_id: {
              open_id: "feishu-user-1"
            }
          },
          message: {
            message_type: "text",
            content: JSON.stringify({
              text: "切项目 pm"
            })
          }
        }
      })
    });

    await fetch(`${server.baseUrl}/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: "feishu-user-1",
        title: "auth-fix",
        goal: "Fix auth bug"
      })
    });

    sendTextMessage.mockClear();

    const executeResponse = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        header: {
          event_type: "im.message.receive_v1"
        },
        event: {
          sender: {
            sender_id: {
              open_id: "feishu-user-1"
            }
          },
          message: {
            message_type: "text",
            content: JSON.stringify({
              text: "执行 修复 auth bug"
            })
          }
        }
      })
    });

    const executePayload = (await executeResponse.json()) as {
      status: string;
      summary: string;
      taskId: string;
    };

    expect(executeResponse.status).toBe(202);
    expect(executePayload.status).toBe("queued");
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sendTextMessage).toHaveBeenNthCalledWith(1, {
      receiveId: "feishu-user-1",
      receiveIdType: "open_id",
      text: "Task accepted"
    });

    releaseRun?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendTextMessage).toHaveBeenCalledTimes(2);
    expect(sendTextMessage).toHaveBeenNthCalledWith(2, {
      receiveId: "feishu-user-1",
      receiveIdType: "open_id",
      text: "execution finished"
    });
  });

  it("rejects signed event requests with an invalid signature when verification is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-feishu-"));
    tempDirs.push(dir);

    const server = createApiServer({
      statePath: join(dir, "state.json"),
      feishu: {
        encryptKey: "test-encrypt-key"
      }
    });
    servers.push(server);
    await server.listen(0);

    const response = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lark-request-timestamp": "1700000000",
        "x-lark-request-nonce": "nonce-1",
        "x-lark-signature": "bad-signature"
      },
      body: JSON.stringify({
        header: {
          event_type: "im.message.receive_v1"
        },
        event: {
          sender: {
            sender_id: {
              open_id: "feishu-user-1"
            }
          },
          message: {
            message_type: "text",
            content: JSON.stringify({
              text: "状态"
            })
          }
        }
      })
    });

    expect(response.status).toBe(401);
  });

  it("accepts signed event requests with a valid signature when verification is enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatops-feishu-"));
    tempDirs.push(dir);

    const encryptKey = "test-encrypt-key";
    const server = createApiServer({
      statePath: join(dir, "state.json"),
      feishu: {
        encryptKey
      }
    });
    servers.push(server);
    await server.listen(0);

    await fetch(`${server.baseUrl}/projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        id: "project_pm",
        name: "pm",
        repoRoot: "/tmp/pm",
        defaultBranch: "main",
        isActive: true
      })
    });

    const requestBody = JSON.stringify({
      header: {
        event_type: "im.message.receive_v1"
      },
      event: {
        sender: {
          sender_id: {
            open_id: "feishu-user-1"
          }
        },
        message: {
          message_type: "text",
          content: JSON.stringify({
            text: "切项目 pm"
          })
        }
      }
    });

    const timestamp = "1700000000";
    const nonce = "nonce-1";
    const signature = createHash("sha256")
      .update(timestamp + nonce + encryptKey)
      .update(requestBody)
      .digest("hex");

    const response = await fetch(`${server.baseUrl}/webhooks/feishu`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lark-request-timestamp": timestamp,
        "x-lark-request-nonce": nonce,
        "x-lark-signature": signature
      },
      body: requestBody
    });

    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(200);
    expect(payload.message).toContain("pm");
  });
});
