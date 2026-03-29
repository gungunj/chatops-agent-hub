import { createRequire } from "node:module";

type ReceiveIdType = "open_id" | "chat_id" | "user_id" | "union_id" | "email";

type SendTextMessageInput = {
  receiveId: string;
  receiveIdType: ReceiveIdType;
  text: string;
};

export type SendTextMessageResult =
  | {
      ok: true;
      messageId?: string;
    }
  | {
      ok: false;
      error: string;
    };

export type FeishuMessageClient = {
  sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult>;
};

type LarkSdkLike = {
  im: {
    message: {
      create(input: {
        params: {
          receive_id_type: ReceiveIdType;
        };
        data: {
          receive_id: string;
          content: string;
          msg_type: "text";
        };
      }): Promise<{
        data?: {
          message_id?: string;
        };
      }>;
    };
  };
};

type FeishuMessageClientOptions = {
  appId?: string;
  appSecret?: string;
  sdkFactory?: (options: { appId: string; appSecret: string }) => LarkSdkLike;
};

function createDefaultSdkClient(options: {
  appId: string;
  appSecret: string;
}): LarkSdkLike {
  const require = createRequire(import.meta.url);
  const lark = require("@larksuiteoapi/node-sdk") as {
    Client: new (options: {
      appId: string;
      appSecret: string;
      appType: unknown;
      domain: unknown;
    }) => unknown;
    AppType: {
      SelfBuild: unknown;
    };
    Domain: {
      Feishu: unknown;
    };
  };

  return new lark.Client({
    appId: options.appId,
    appSecret: options.appSecret,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu
  }) as unknown as LarkSdkLike;
}

export function createFeishuMessageClient(
  options: FeishuMessageClientOptions = {}
): FeishuMessageClient {
  const appId = options.appId ?? process.env.FEISHU_APP_ID;
  const appSecret = options.appSecret ?? process.env.FEISHU_APP_SECRET;
  const sdkFactory = options.sdkFactory ?? createDefaultSdkClient;

  return {
    async sendTextMessage(
      input: SendTextMessageInput
    ): Promise<SendTextMessageResult> {
      if (!appId || !appSecret) {
        return {
          ok: false,
          error: "FEISHU_APP_ID and FEISHU_APP_SECRET are required"
        };
      }

      const client = sdkFactory({
        appId,
        appSecret
      });

      try {
        const result = await client.im.message.create({
          params: {
            receive_id_type: input.receiveIdType
          },
          data: {
            receive_id: input.receiveId,
            content: JSON.stringify({ text: input.text }),
            msg_type: "text"
          }
        });

        return {
          ok: true,
          messageId: result.data?.message_id
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown Feishu send error"
        };
      }
    }
  };
}
