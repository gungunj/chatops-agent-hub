import { createHash } from "node:crypto";

type FeishuEnvelope = {
  type?: string;
  challenge?: string;
  header?: {
    event_type?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        open_id?: string;
      };
    };
    message?: {
      message_type?: string;
      content?: string;
    };
  };
};

type FeishuCommand = {
  userId: string;
  text: string;
};

export function isFeishuUrlVerification(payload: FeishuEnvelope): boolean {
  return payload.type === "url_verification" && typeof payload.challenge === "string";
}

export function getFeishuChallenge(payload: FeishuEnvelope): string {
  return payload.challenge ?? "";
}

export function parseFeishuCommand(payload: FeishuEnvelope): FeishuCommand | null {
  if (payload.header?.event_type !== "im.message.receive_v1") {
    return null;
  }

  if (payload.event?.message?.message_type !== "text") {
    return null;
  }

  const userId = payload.event?.sender?.sender_id?.open_id;
  const rawContent = payload.event?.message?.content;

  if (!userId || !rawContent) {
    return null;
  }

  const content = JSON.parse(rawContent) as { text?: string };
  const text = content.text?.trim();

  if (!text) {
    return null;
  }

  return {
    userId,
    text
  };
}

export function verifyFeishuSignature(options: {
  rawBody: string;
  timestamp?: string;
  nonce?: string;
  signature?: string;
  encryptKey?: string;
}): boolean {
  if (!options.encryptKey) {
    return true;
  }

  if (!options.timestamp || !options.nonce || !options.signature) {
    return false;
  }

  const expected = createHash("sha256")
    .update(options.timestamp + options.nonce + options.encryptKey)
    .update(options.rawBody)
    .digest("hex");

  return expected === options.signature;
}
