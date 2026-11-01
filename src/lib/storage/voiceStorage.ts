import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const VOICE_ROOT_DIR = path.join(process.cwd(), ".private_storage", "voice");
const MAX_VOICE_BYTES = 1.5 * 1024 * 1024; // 单条语音上限 1.5MB（约 60 秒压缩音频）

function getSigningSecret(): string {
  return (
    process.env.ONCE_IDENTITY_HMAC_SECRET || "project-once-default-dev-pepper"
  );
}

/**
 * 校验房间 ID 与消息 ID 仅包含安全字符，严防路径穿越（Path Traversal）
 */
function assertSafeSegment(seg: string): void {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(seg)) {
    throw new Error("INVALID_PATH_SEGMENT");
  }
}

export async function savePrivateVoiceFile(params: {
  roomId: string;
  messageId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ relativePath: string }> {
  assertSafeSegment(params.roomId);
  assertSafeSegment(params.messageId);

  if (params.buffer.byteLength === 0) {
    throw new Error("EMPTY_AUDIO_FILE");
  }
  if (params.buffer.byteLength > MAX_VOICE_BYTES) {
    throw new Error("AUDIO_FILE_TOO_LARGE");
  }

  const ext = params.mimeType.includes("mp4")
    ? "mp4"
    : params.mimeType.includes("ogg")
    ? "ogg"
    : "webm";

  const roomDir = path.join(VOICE_ROOT_DIR, params.roomId);
  await fs.mkdir(roomDir, { recursive: true });

  const fileName = `${params.messageId}.${ext}`;
  const fullPath = path.join(roomDir, fileName);
  await fs.writeFile(fullPath, params.buffer);

  return {
    relativePath: `${params.roomId}/${fileName}`,
  };
}

export async function readPrivateVoiceFile(
  relativePath: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const parts = relativePath.split("/");
  if (parts.length !== 2) return null;
  const [roomId, fileName] = parts;
  assertSafeSegment(roomId);
  if (!/^[a-zA-Z0-9_-]{1,64}\.(webm|ogg|mp4)$/.test(fileName)) {
    return null;
  }

  const fullPath = path.join(VOICE_ROOT_DIR, roomId, fileName);
  try {
    const buffer = await fs.readFile(fullPath);
    const contentType = fileName.endsWith(".mp4")
      ? "audio/mp4"
      : fileName.endsWith(".ogg")
      ? "audio/ogg"
      : "audio/webm";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * 物理删除指定房间下的全部私有语音文件（正常到期或离开时立即调用）
 */
export async function purgeRoomVoiceFiles(roomId: string): Promise<void> {
  try {
    assertSafeSegment(roomId);
    const roomDir = path.join(VOICE_ROOT_DIR, roomId);
    await fs.rm(roomDir, { recursive: true, force: true });
  } catch {
    // 忽略目录不存在的情况
  }
}

/**
 * 生成短期有效的语音流式访问签名 URL（有效期严格不超过房间到期时间 expiresAtMs）
 */
export function createSignedVoiceUrl(params: {
  roomId: string;
  messageId: string;
  roomExpiresAtMs: number;
}): string {
  const maxExp = Math.min(
    params.roomExpiresAtMs,
    Date.now() + 5 * 60 * 1000 // 单次签名最长 5 分钟或随房间立即到期
  );
  const payload = `${params.roomId}:${params.messageId}:${maxExp}`;
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");

  return `/api/rooms/${encodeURIComponent(
    params.roomId
  )}/voice/${encodeURIComponent(params.messageId)}?exp=${maxExp}&sig=${sig}`;
}

export function verifySignedVoiceQuery(params: {
  roomId: string;
  messageId: string;
  expRaw: string | null;
  sigRaw: string | null;
}): boolean {
  if (!params.expRaw || !params.sigRaw) return false;
  const exp = Number(params.expRaw);
  if (Number.isNaN(exp) || Date.now() >= exp) return false;

  const payload = `${params.roomId}:${params.messageId}:${exp}`;
  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig, "hex"),
      Buffer.from(params.sigRaw, "hex")
    );
  } catch {
    return false;
  }
}
