import { describe, expect, it, vi } from "vitest";

import { createFeishuMessageClient } from "./feishu-client.js";

describe("createFeishuMessageClient", () => {
  it("sends a text message to an open_id via the sdk client", async () => {
    const create = vi.fn().mockResolvedValue({
      data: {
        message_id: "om_dc13264520392913993dd051dba21dcf"
      }
    });

    const client = createFeishuMessageClient({
      appId: "cli_a",
      appSecret: "secret_b",
      sdkFactory: () =>
        ({
          im: {
            message: {
              create
            }
          }
        }) as never
    });

    const result = await client.sendTextMessage({
      receiveId: "ou_123",
      receiveIdType: "open_id",
      text: "hello world"
    });

    expect(create).toHaveBeenCalledWith({
      params: {
        receive_id_type: "open_id"
      },
      data: {
        receive_id: "ou_123",
        content: JSON.stringify({ text: "hello world" }),
        msg_type: "text"
      }
    });
    expect(result).toEqual({
      ok: true,
      messageId: "om_dc13264520392913993dd051dba21dcf"
    });
  });

  it("returns a config error when app credentials are missing", async () => {
    const client = createFeishuMessageClient();

    const result = await client.sendTextMessage({
      receiveId: "ou_123",
      receiveIdType: "open_id",
      text: "hello world"
    });

    expect(result).toEqual({
      ok: false,
      error: "FEISHU_APP_ID and FEISHU_APP_SECRET are required"
    });
  });
});
