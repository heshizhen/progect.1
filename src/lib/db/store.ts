import crypto from "crypto";
import mysql, { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { NextRequest } from "next/server";
import { DurationMinutes, ReportCategory, RoomStatus } from "@/types/once";
import {
  createSignedVoiceUrl,
  purgeRoomVoiceFiles,
} from "@/lib/storage/voiceStorage";

const ANON_COOKIE_NAME = "once_anon_token";
const ANON_MASK_COOKIE = "once_anon_mask";

export interface StoredRoom {
  id: string;
  userAId: string;
  userBId: string;
  durationMinutes: DurationMinutes;
  status: RoomStatus;
  startedAtMs: number;
  expiresAtMs: number;
  endedAtMs?: number;
  endedReason?: string;
  evidenceRetainUntilMs?: number;
}

export interface StoredMessage {
  id: string;
  roomId: string;
  senderId: string;
  msgType: "text" | "voice";
  content?: string;
  voiceStoragePath?: string;
  voiceDurationSec?: number;
  createdAtMs: number;
}

interface MemoryStore {
  identities: Map<
    string,
    { id: string; tokenHash: string; maskedId: string; bannedUntilMs?: number }
  >;
  pairExclusions: Map<
    string,
    { lowId: string; highId: string; reason: string; createdAtMs: number }
  >;
  matchQueue: Map<
    string,
    {
      identityId: string;
      durationMinutes: DurationMinutes;
      joinedAtMs: number;
      matchedRoomId?: string;
    }
  >;
  rooms: Map<string, StoredRoom>;
  messages: Map<string, StoredMessage[]>;
  lastMessageAtBySender: Map<string, number>;
}

const globalForOnce = globalThis as unknown as {
  __onceMemStore?: MemoryStore;
  __onceMysqlPool?: Pool;
};

function getMemStore(): MemoryStore {
  if (!globalForOnce.__onceMemStore) {
    globalForOnce.__onceMemStore = {
      identities: new Map(),
      pairExclusions: new Map(),
      matchQueue: new Map(),
      rooms: new Map(),
      messages: new Map(),
      lastMessageAtBySender: new Map(),
    };
  }
  return globalForOnce.__onceMemStore;
}

export function isMysqlConfigured(): boolean {
  const url = process.env.MYSQL_URL;
  return Boolean(url && !url.includes("your_mysql_password"));
}

function getMysqlPool(): Pool {
  if (!globalForOnce.__onceMysqlPool) {
    globalForOnce.__onceMysqlPool = mysql.createPool({
      uri: process.env.MYSQL_URL,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "Z",
    });
  }
  return globalForOnce.__onceMysqlPool;
}

export function getHashedIdentityFromRequest(req: NextRequest): {
  tokenHash: string;
  maskedId: string;
} {
  const rawToken =
    req.cookies.get(ANON_COOKIE_NAME)?.value || "once_fallback_dev";
  const maskedId =
    req.cookies.get(ANON_MASK_COOKIE)?.value || "once_dev...0000";
  const pepper =
    process.env.ONCE_IDENTITY_HMAC_SECRET || "project-once-default-dev-pepper";

  const tokenHash = crypto
    .createHmac("sha256", pepper)
    .update(rawToken)
    .digest("hex");

  return { tokenHash, maskedId };
}

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function sanitizeAndDefangText(raw: string): string {
  const trimmed = raw.trim().slice(0, 500);
  return trimmed.replace(/https?:\/\/[^\s]+/gi, "[外链已屏蔽]");
}

export async function getIdentityStatus(
  tokenHash: string,
  maskedId: string
): Promise<{
  identityId: string;
  maskedId: string;
  excludedCount: number;
  storageEngine: "mysql" | "memory";
}> {
  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const existing = await pool.query<RowDataPacket[]>(
      "SELECT id FROM identities WHERE token_hash = ? LIMIT 1",
      [tokenHash]
    );
    let identityId: string;
    if (existing[0].length > 0) {
      identityId = String(existing[0][0].id);
    } else {
      identityId = crypto.randomUUID();
      await pool.query(
        "INSERT IGNORE INTO identities (id, token_hash, masked_id) VALUES (?, ?, ?)",
        [identityId, tokenHash, maskedId]
      );
    }
    const [cntRows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS cnt FROM pair_exclusions WHERE user_low_id = ? OR user_high_id = ?",
      [identityId, identityId]
    );
    return {
      identityId,
      maskedId,
      excludedCount: Number(cntRows[0]?.cnt || 0),
      storageEngine: "mysql",
    };
  }

  const mem = getMemStore();
  let ident = mem.identities.get(tokenHash);
  if (!ident) {
    ident = { id: crypto.randomUUID(), tokenHash, maskedId };
    mem.identities.set(tokenHash, ident);
  }
  let excludedCount = 0;
  mem.pairExclusions.forEach((pe) => {
    if (pe.lowId === ident!.id || pe.highId === ident!.id) {
      excludedCount += 1;
    }
  });
  return {
    identityId: ident.id,
    maskedId: ident.maskedId,
    excludedCount,
    storageEngine: "memory",
  };
}

export async function matchOrEnqueue(
  tokenHash: string,
  maskedId: string,
  durationMinutes: DurationMinutes
): Promise<{
  status: "matched" | "waiting";
  roomId?: string;
  startedAtIso?: string;
  expiresAtIso?: string;
  serverNowIso: string;
  durationMinutes: DurationMinutes;
  storageEngine: "mysql" | "memory";
}> {
  const nowMs = Date.now();
  const serverNowIso = new Date(nowMs).toISOString();

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [idRows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM identities WHERE token_hash = ? FOR UPDATE",
        [tokenHash]
      );
      let meId: string;
      if (idRows.length > 0) {
        meId = String(idRows[0].id);
        await conn.query(
          "UPDATE identities SET last_active_at = NOW(3) WHERE id = ?",
          [meId]
        );
      } else {
        meId = crypto.randomUUID();
        await conn.query(
          "INSERT INTO identities (id, token_hash, masked_id) VALUES (?, ?, ?)",
          [meId, tokenHash, maskedId]
        );
      }

      const [myQueueRows] = await conn.query<RowDataPacket[]>(
        "SELECT matched_room_id FROM match_queue WHERE identity_id = ? FOR UPDATE",
        [meId]
      );
      if (myQueueRows.length > 0 && myQueueRows[0].matched_room_id) {
        const matchedRoomId = String(myQueueRows[0].matched_room_id);
        await conn.query("DELETE FROM match_queue WHERE identity_id = ?", [
          meId,
        ]);
        const [roomRows] = await conn.query<RowDataPacket[]>(
          "SELECT started_at, expires_at, duration_minutes FROM rooms WHERE id = ?",
          [matchedRoomId]
        );
        await conn.commit();
        if (roomRows.length > 0) {
          return {
            status: "matched",
            roomId: matchedRoomId,
            startedAtIso: new Date(roomRows[0].started_at).toISOString(),
            expiresAtIso: new Date(roomRows[0].expires_at).toISOString(),
            serverNowIso,
            durationMinutes: Number(
              roomRows[0].duration_minutes
            ) as DurationMinutes,
            storageEngine: "mysql",
          };
        }
      }

      await conn.query(
        "DELETE FROM match_queue WHERE matched_room_id IS NULL AND joined_at < DATE_SUB(NOW(3), INTERVAL 45 SECOND) AND identity_id <> ?",
        [meId]
      );

      const [candidates] = await conn.query<RowDataPacket[]>(
        `SELECT mq.identity_id
         FROM match_queue mq
         WHERE mq.duration_minutes = ?
           AND mq.identity_id <> ?
           AND mq.matched_room_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM pair_exclusions pe
             WHERE pe.user_low_id = LEAST(?, mq.identity_id)
               AND pe.user_high_id = GREATEST(?, mq.identity_id)
           )
         ORDER BY mq.joined_at ASC
         LIMIT 1
         FOR UPDATE`,
        [durationMinutes, meId, meId, meId]
      );

      if (candidates.length > 0) {
        const partnerId = String(candidates[0].identity_id);
        const roomId = "room_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const startedAt = new Date(nowMs);
        const expiresAt = new Date(nowMs + durationMinutes * 60 * 1000);
        const [lowId, highId] = canonicalPair(meId, partnerId);

        await conn.query(
          `INSERT INTO rooms (id, user_a_id, user_b_id, duration_minutes, status, started_at, expires_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          [roomId, partnerId, meId, durationMinutes, startedAt, expiresAt]
        );

        await conn.query(
          `INSERT IGNORE INTO pair_exclusions (user_low_id, user_high_id, reason)
           VALUES (?, ?, 'matched')`,
          [lowId, highId]
        );

        await conn.query(
          "UPDATE match_queue SET matched_room_id = ? WHERE identity_id = ?",
          [roomId, partnerId]
        );
        await conn.query("DELETE FROM match_queue WHERE identity_id = ?", [
          meId,
        ]);

        await conn.commit();
        return {
          status: "matched",
          roomId,
          startedAtIso: startedAt.toISOString(),
          expiresAtIso: expiresAt.toISOString(),
          serverNowIso,
          durationMinutes,
          storageEngine: "mysql",
        };
      }

      await conn.query(
        `INSERT INTO match_queue (identity_id, duration_minutes, joined_at, matched_room_id)
         VALUES (?, ?, NOW(3), NULL)
         ON DUPLICATE KEY UPDATE duration_minutes = VALUES(duration_minutes), joined_at = NOW(3), matched_room_id = NULL`,
        [meId, durationMinutes]
      );

      await conn.commit();
      return {
        status: "waiting",
        serverNowIso,
        durationMinutes,
        storageEngine: "mysql",
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  const mem = getMemStore();
  let me = mem.identities.get(tokenHash);
  if (!me) {
    me = { id: crypto.randomUUID(), tokenHash, maskedId };
    mem.identities.set(tokenHash, me);
  }

  const existingQueue = mem.matchQueue.get(me.id);
  if (existingQueue?.matchedRoomId) {
    const r = mem.rooms.get(existingQueue.matchedRoomId);
    mem.matchQueue.delete(me.id);
    if (r) {
      return {
        status: "matched",
        roomId: r.id,
        startedAtIso: new Date(r.startedAtMs).toISOString(),
        expiresAtIso: new Date(r.expiresAtMs).toISOString(),
        serverNowIso,
        durationMinutes: r.durationMinutes,
        storageEngine: "memory",
      };
    }
  }

  mem.matchQueue.forEach((q, key) => {
    if (!q.matchedRoomId && nowMs - q.joinedAtMs > 45_000 && key !== me!.id) {
      mem.matchQueue.delete(key);
    }
  });

  let foundPartnerId: string | null = null;
  mem.matchQueue.forEach((q) => {
    if (foundPartnerId) return;
    if (q.identityId === me!.id || q.matchedRoomId) return;
    if (q.durationMinutes !== durationMinutes) return;
    const [lowId, highId] = canonicalPair(me!.id, q.identityId);
    const pairKey = `${lowId}:${highId}`;
    if (!mem.pairExclusions.has(pairKey)) {
      foundPartnerId = q.identityId;
    }
  });

  if (foundPartnerId) {
    const roomId = "room_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const expiresAtMs = nowMs + durationMinutes * 60 * 1000;
    const room: StoredRoom = {
      id: roomId,
      userAId: foundPartnerId,
      userBId: me.id,
      durationMinutes,
      status: "active",
      startedAtMs: nowMs,
      expiresAtMs,
    };
    mem.rooms.set(roomId, room);
    mem.messages.set(roomId, []);

    const [lowId, highId] = canonicalPair(me.id, foundPartnerId);
    mem.pairExclusions.set(`${lowId}:${highId}`, {
      lowId,
      highId,
      reason: "matched",
      createdAtMs: nowMs,
    });

    const partnerQueue = mem.matchQueue.get(foundPartnerId);
    if (partnerQueue) {
      partnerQueue.matchedRoomId = roomId;
    }
    mem.matchQueue.delete(me.id);

    return {
      status: "matched",
      roomId,
      startedAtIso: new Date(nowMs).toISOString(),
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      serverNowIso,
      durationMinutes,
      storageEngine: "memory",
    };
  }

  mem.matchQueue.set(me.id, {
    identityId: me.id,
    durationMinutes,
    joinedAtMs: nowMs,
  });

  return {
    status: "waiting",
    serverNowIso,
    durationMinutes,
    storageEngine: "memory",
  };
}

export async function cancelMatchQueue(tokenHash: string): Promise<void> {
  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    await pool.query(
      `DELETE mq FROM match_queue mq
       INNER JOIN identities i ON mq.identity_id = i.id
       WHERE i.token_hash = ? AND mq.matched_room_id IS NULL`,
      [tokenHash]
    );
    return;
  }
  const mem = getMemStore();
  const me = mem.identities.get(tokenHash);
  if (me) {
    mem.matchQueue.delete(me.id);
  }
}

export async function syncRoomState(
  roomId: string,
  tokenHash: string,
  maskedId: string
): Promise<{
  ok: boolean;
  error?: string;
  status?: RoomStatus;
  endedReason?: string;
  serverNowIso: string;
  expiresAtIso?: string;
  remainingSeconds?: number;
  durationMinutes?: DurationMinutes;
  partnerAlias?: string;
  messages?: Array<{
    id: string;
    sender: "me" | "partner";
    type: "text" | "voice";
    text?: string;
    voiceUrl?: string;
    voiceDurationSec?: number;
    createdAtIso: string;
  }>;
}> {
  const nowMs = Date.now();
  const serverNowIso = new Date(nowMs).toISOString();

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const [idRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM identities WHERE token_hash = ? LIMIT 1",
      [tokenHash]
    );
    if (idRows.length === 0) {
      return { ok: false, error: "UNAUTHORIZED_IDENTITY", serverNowIso };
    }
    const meId = String(idRows[0].id);

    const [roomRows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM rooms WHERE id = ? LIMIT 1",
      [roomId]
    );
    if (roomRows.length === 0) {
      return { ok: false, error: "ROOM_NOT_FOUND", serverNowIso };
    }
    const r = roomRows[0];
    if (r.user_a_id !== meId && r.user_b_id !== meId) {
      return { ok: false, error: "FORBIDDEN_NOT_PARTICIPANT", serverNowIso };
    }

    const expiresAtMs = new Date(r.expires_at).getTime();
    let status = String(r.status) as RoomStatus;
    let endedReason = r.ended_reason ? String(r.ended_reason) : undefined;

    if (status === "active" && nowMs >= expiresAtMs) {
      status = "expired";
      endedReason = "timeout";
      await pool.query("DELETE FROM messages WHERE room_id = ?", [roomId]);
      await pool.query(
        "UPDATE rooms SET status = 'expired', ended_at = NOW(3), ended_reason = 'timeout' WHERE id = ? AND status = 'active'",
        [roomId]
      );
      await purgeRoomVoiceFiles(roomId);
    }

    const remainingSeconds =
      status === "active"
        ? Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))
        : 0;

    const partnerId =
      r.user_a_id === meId ? String(r.user_b_id) : String(r.user_a_id);
    const partnerAlias = `Stranger #${partnerId.slice(0, 4).toUpperCase()}`;

    if (status !== "active") {
      return {
        ok: true,
        status,
        endedReason,
        serverNowIso,
        expiresAtIso: new Date(expiresAtMs).toISOString(),
        remainingSeconds: 0,
        durationMinutes: Number(r.duration_minutes) as DurationMinutes,
        partnerAlias,
        messages: [],
      };
    }

    const [msgRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, sender_id, msg_type, content, voice_duration_sec, created_at FROM messages WHERE room_id = ? ORDER BY created_at ASC",
      [roomId]
    );

    return {
      ok: true,
      status,
      serverNowIso,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      remainingSeconds,
      durationMinutes: Number(r.duration_minutes) as DurationMinutes,
      partnerAlias,
      messages: msgRows.map((m) => {
        const msgId = String(m.id);
        const isVoice = m.msg_type === "voice";
        return {
          id: msgId,
          sender: m.sender_id === meId ? "me" : "partner",
          type: isVoice ? "voice" : "text",
          text: m.content ? String(m.content) : undefined,
          voiceUrl: isVoice
            ? createSignedVoiceUrl({
                roomId,
                messageId: msgId,
                roomExpiresAtMs: expiresAtMs,
              })
            : undefined,
          voiceDurationSec: m.voice_duration_sec
            ? Number(m.voice_duration_sec)
            : undefined,
          createdAtIso: new Date(m.created_at).toISOString(),
        };
      }),
    };
  }

  // ---------------- 内存引擎 ----------------
  const mem = getMemStore();
  let me = mem.identities.get(tokenHash);
  if (!me) {
    me = { id: crypto.randomUUID(), tokenHash, maskedId };
    mem.identities.set(tokenHash, me);
  }

  let room = mem.rooms.get(roomId);
  if (!room && roomId.startsWith("room_")) {
    room = {
      id: roomId,
      userAId: me.id,
      userBId: "partner_demo_id",
      durationMinutes: 10,
      status: "active",
      startedAtMs: nowMs,
      expiresAtMs: nowMs + 10 * 60 * 1000,
    };
    mem.rooms.set(roomId, room);
    mem.messages.set(roomId, [
      {
        id: "msg_welcome",
        roomId,
        senderId: "partner_demo_id",
        msgType: "text",
        content:
          "嗨，很高兴在这个临时房间遇到你。你可以点击下方 🎙️ 语音按钮录制真实语音，语音文件会加密保存在服务端私有目录并通过短期签名链接播放，房间关闭时立即物理销毁！",
        createdAtMs: nowMs,
      },
    ]);
  }

  if (!room) {
    return { ok: false, error: "ROOM_NOT_FOUND", serverNowIso };
  }

  if (room.userAId !== me.id && room.userBId !== me.id) {
    return { ok: false, error: "FORBIDDEN_NOT_PARTICIPANT", serverNowIso };
  }

  if (room.status === "active" && nowMs >= room.expiresAtMs) {
    room.status = "expired";
    room.endedAtMs = nowMs;
    room.endedReason = "timeout";
    mem.messages.delete(roomId);
    await purgeRoomVoiceFiles(roomId);
  }

  const remainingSeconds =
    room.status === "active"
      ? Math.max(0, Math.ceil((room.expiresAtMs - nowMs) / 1000))
      : 0;

  const partnerId = room.userAId === me.id ? room.userBId : room.userAId;
  const partnerAlias = `Stranger #${partnerId.slice(0, 4).toUpperCase()}`;

  if (room.status !== "active") {
    return {
      ok: true,
      status: room.status,
      endedReason: room.endedReason,
      serverNowIso,
      expiresAtIso: new Date(room.expiresAtMs).toISOString(),
      remainingSeconds: 0,
      durationMinutes: room.durationMinutes,
      partnerAlias,
      messages: [],
    };
  }

  const rawMsgs = mem.messages.get(roomId) || [];
  return {
    ok: true,
    status: room.status,
    serverNowIso,
    expiresAtIso: new Date(room.expiresAtMs).toISOString(),
    remainingSeconds,
    durationMinutes: room.durationMinutes,
    partnerAlias,
    messages: rawMsgs.map((m) => ({
      id: m.id,
      sender: m.senderId === me!.id ? "me" : "partner",
      type: m.msgType,
      text: m.content,
      voiceUrl:
        m.msgType === "voice"
          ? createSignedVoiceUrl({
              roomId,
              messageId: m.id,
              roomExpiresAtMs: room!.expiresAtMs,
            })
          : undefined,
      voiceDurationSec: m.voiceDurationSec,
      createdAtIso: new Date(m.createdAtMs).toISOString(),
    })),
  };
}

export async function appendRoomMessage(params: {
  roomId: string;
  tokenHash: string;
  maskedId: string;
  msgType: "text" | "voice";
  messageId?: string;
  text?: string;
  voiceStoragePath?: string;
  voiceDurationSec?: number;
}): Promise<{
  ok: boolean;
  error?: string;
  roomExpiresAtMs?: number;
  message?: {
    id: string;
    sender: "me";
    type: "text" | "voice";
    text?: string;
    voiceUrl?: string;
    voiceDurationSec?: number;
    createdAtIso: string;
  };
}> {
  const nowMs = Date.now();
  const mem = getMemStore();

  const lastSent = mem.lastMessageAtBySender.get(params.tokenHash) || 0;
  if (nowMs - lastSent < 1200) {
    return { ok: false, error: "发送过于频繁，请稍候再试。" };
  }
  mem.lastMessageAtBySender.set(params.tokenHash, nowMs);

  const cleanText =
    params.msgType === "text" && params.text
      ? sanitizeAndDefangText(params.text)
      : undefined;

  if (params.msgType === "text" && !cleanText) {
    return { ok: false, error: "消息内容不能为空。" };
  }

  const voiceDur =
    params.msgType === "voice"
      ? Math.min(60, Math.max(1, Number(params.voiceDurationSec || 1)))
      : undefined;

  const msgId =
    params.messageId ||
    "msg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const [idRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM identities WHERE token_hash = ? LIMIT 1",
      [params.tokenHash]
    );
    if (idRows.length === 0) {
      return { ok: false, error: "UNAUTHORIZED_IDENTITY" };
    }
    const meId = String(idRows[0].id);

    const [roomRows] = await pool.query<RowDataPacket[]>(
      "SELECT user_a_id, user_b_id, status, expires_at FROM rooms WHERE id = ? LIMIT 1",
      [params.roomId]
    );
    if (roomRows.length === 0) {
      return { ok: false, error: "ROOM_NOT_FOUND" };
    }
    const r = roomRows[0];
    if (r.user_a_id !== meId && r.user_b_id !== meId) {
      return { ok: false, error: "FORBIDDEN_NOT_PARTICIPANT" };
    }
    const expiresAtMs = new Date(r.expires_at).getTime();
    if (r.status !== "active" || nowMs >= expiresAtMs) {
      return { ok: false, error: "房间已关闭或倒计时已结束，无法发送消息。" };
    }

    await pool.query(
      `INSERT INTO messages (id, room_id, sender_id, msg_type, content, voice_storage_path, voice_duration_sec, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        msgId,
        params.roomId,
        meId,
        params.msgType,
        cleanText || null,
        params.voiceStoragePath || null,
        voiceDur || null,
      ]
    );

    return {
      ok: true,
      roomExpiresAtMs: expiresAtMs,
      message: {
        id: msgId,
        sender: "me",
        type: params.msgType,
        text: cleanText,
        voiceUrl:
          params.msgType === "voice"
            ? createSignedVoiceUrl({
                roomId: params.roomId,
                messageId: msgId,
                roomExpiresAtMs: expiresAtMs,
              })
            : undefined,
        voiceDurationSec: voiceDur,
        createdAtIso: new Date(nowMs).toISOString(),
      },
    };
  }

  const me = mem.identities.get(params.tokenHash);
  if (!me) {
    return { ok: false, error: "UNAUTHORIZED_IDENTITY" };
  }
  const room = mem.rooms.get(params.roomId);
  if (!room) {
    return { ok: false, error: "ROOM_NOT_FOUND" };
  }
  if (room.userAId !== me.id && room.userBId !== me.id) {
    return { ok: false, error: "FORBIDDEN_NOT_PARTICIPANT" };
  }
  if (room.status !== "active" || nowMs >= room.expiresAtMs) {
    return { ok: false, error: "房间已关闭或倒计时已结束，无法发送消息。" };
  }

  const stored: StoredMessage = {
    id: msgId,
    roomId: params.roomId,
    senderId: me.id,
    msgType: params.msgType,
    content: cleanText,
    voiceStoragePath: params.voiceStoragePath,
    voiceDurationSec: voiceDur,
    createdAtMs: nowMs,
  };
  const arr = mem.messages.get(params.roomId) || [];
  arr.push(stored);
  mem.messages.set(params.roomId, arr);

  return {
    ok: true,
    roomExpiresAtMs: room.expiresAtMs,
    message: {
      id: msgId,
      sender: "me",
      type: params.msgType,
      text: cleanText,
      voiceUrl:
        params.msgType === "voice"
          ? createSignedVoiceUrl({
              roomId: params.roomId,
              messageId: msgId,
              roomExpiresAtMs: room.expiresAtMs,
            })
          : undefined,
      voiceDurationSec: voiceDur,
      createdAtIso: new Date(nowMs).toISOString(),
    },
  };
}

/**
 * 校验当前请求者是否有权读取某条私有语音消息并返回其相对存储路径
 */
export async function authorizeVoiceAccess(params: {
  roomId: string;
  messageId: string;
  tokenHash: string;
}): Promise<{ allowed: boolean; voiceStoragePath?: string }> {
  const nowMs = Date.now();

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const [idRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM identities WHERE token_hash = ? LIMIT 1",
      [params.tokenHash]
    );
    if (idRows.length === 0) return { allowed: false };
    const meId = String(idRows[0].id);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.voice_storage_path, r.user_a_id, r.user_b_id, r.status, r.expires_at
       FROM messages m
       INNER JOIN rooms r ON m.room_id = r.id
       WHERE m.id = ? AND m.room_id = ? AND m.msg_type = 'voice'
       LIMIT 1`,
      [params.messageId, params.roomId]
    );
    if (rows.length === 0) return { allowed: false };
    const row = rows[0];
    if (row.user_a_id !== meId && row.user_b_id !== meId) {
      return { allowed: false };
    }
    if (
      row.status !== "active" ||
      nowMs >= new Date(row.expires_at).getTime()
    ) {
      return { allowed: false };
    }
    return {
      allowed: true,
      voiceStoragePath: row.voice_storage_path
        ? String(row.voice_storage_path)
        : undefined,
    };
  }

  const mem = getMemStore();
  const me = mem.identities.get(params.tokenHash);
  if (!me) return { allowed: false };
  const room = mem.rooms.get(params.roomId);
  if (!room) return { allowed: false };
  if (room.userAId !== me.id && room.userBId !== me.id) {
    return { allowed: false };
  }
  if (room.status !== "active" || nowMs >= room.expiresAtMs) {
    return { allowed: false };
  }
  const msgs = mem.messages.get(params.roomId) || [];
  const found = msgs.find(
    (m) => m.id === params.messageId && m.msgType === "voice"
  );
  if (!found || !found.voiceStoragePath) return { allowed: false };
  return {
    allowed: true,
    voiceStoragePath: found.voiceStoragePath,
  };
}

export async function endOrCleanupRoom(
  roomId: string,
  tokenHash: string,
  reason: "timeout" | "self_left"
): Promise<{ ok: boolean; status: string; serverNowIso: string }> {
  const nowMs = Date.now();
  const serverNowIso = new Date(nowMs).toISOString();

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const [roomRows] = await pool.query<RowDataPacket[]>(
      "SELECT status FROM rooms WHERE id = ? LIMIT 1",
      [roomId]
    );
    if (roomRows.length > 0 && roomRows[0].status !== "under_review") {
      await pool.query("DELETE FROM messages WHERE room_id = ?", [roomId]);
      const nextStatus = reason === "timeout" ? "expired" : "left";
      const endedReason = reason === "timeout" ? "timeout" : "partner_left";
      await pool.query(
        "UPDATE rooms SET status = ?, ended_at = NOW(3), ended_reason = ? WHERE id = ?",
        [nextStatus, endedReason, roomId]
      );
      await purgeRoomVoiceFiles(roomId);
    }
    return { ok: true, status: "dissolved", serverNowIso };
  }

  const mem = getMemStore();
  const room = mem.rooms.get(roomId);
  if (room && room.status !== "under_review") {
    room.status = reason === "timeout" ? "expired" : "left";
    room.endedAtMs = nowMs;
    room.endedReason = reason === "timeout" ? "timeout" : "partner_left";
    mem.messages.delete(roomId);
    await purgeRoomVoiceFiles(roomId);
  }
  return { ok: true, status: "dissolved", serverNowIso };
}

export async function reportAndFreezeRoom(
  roomId: string,
  tokenHash: string,
  category: ReportCategory
): Promise<{
  ok: boolean;
  status: "under_review";
  retainUntilIso: string;
  serverNowIso: string;
}> {
  const nowMs = Date.now();
  const retainUntilMs = nowMs + 14 * 24 * 60 * 60 * 1000;
  const serverNowIso = new Date(nowMs).toISOString();
  const retainUntilIso = new Date(retainUntilMs).toISOString();

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();
    const [idRows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM identities WHERE token_hash = ? LIMIT 1",
      [tokenHash]
    );
    const [roomRows] = await pool.query<RowDataPacket[]>(
      "SELECT user_a_id, user_b_id FROM rooms WHERE id = ? LIMIT 1",
      [roomId]
    );
    if (idRows.length > 0 && roomRows.length > 0) {
      const meId = String(idRows[0].id);
      const r = roomRows[0];
      const partnerId =
        r.user_a_id === meId ? String(r.user_b_id) : String(r.user_a_id);
      const [lowId, highId] = canonicalPair(meId, partnerId);

      await pool.query(
        `INSERT INTO reports (id, room_id, reporter_id, reported_id, category, retain_until)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          roomId,
          meId,
          partnerId,
          category,
          new Date(retainUntilMs),
        ]
      );
      await pool.query(
        `UPDATE rooms
         SET status = 'under_review', ended_at = NOW(3), ended_reason = 'reported', evidence_retain_until = ?
         WHERE id = ?`,
        [new Date(retainUntilMs), roomId]
      );
      await pool.query(
        `INSERT INTO pair_exclusions (user_low_id, user_high_id, reason)
         VALUES (?, ?, 'reported')
         ON DUPLICATE KEY UPDATE reason = 'reported'`,
        [lowId, highId]
      );
    }
    return { ok: true, status: "under_review", retainUntilIso, serverNowIso };
  }

  const mem = getMemStore();
  const room = mem.rooms.get(roomId);
  if (room) {
    room.status = "under_review";
    room.endedAtMs = nowMs;
    room.endedReason = "reported";
    room.evidenceRetainUntilMs = retainUntilMs;
    const [lowId, highId] = canonicalPair(room.userAId, room.userBId);
    mem.pairExclusions.set(`${lowId}:${highId}`, {
      lowId,
      highId,
      reason: "reported",
      createdAtMs: nowMs,
    });
  }
  return { ok: true, status: "under_review", retainUntilIso, serverNowIso };
}


let lastAutoPurgeAtMs = 0;

/**
 * 核心原子操作 6：清理所有已到期的活动房间与已满 14 天取证保留期的举报数据
 * 同时支持被 /api/cron/purge 定时任务调用，以及在日常请求中每 30 秒自动捎带触发一次
 */
export async function purgeExpiredData(): Promise<{
  expiredRoomsPurged: number;
  expiredReportsPurged: number;
  executedAtIso: string;
}> {
  const nowMs = Date.now();
  lastAutoPurgeAtMs = nowMs;
  let expiredRoomsPurged = 0;
  let expiredReportsPurged = 0;

  if (isMysqlConfigured()) {
    const pool = getMysqlPool();

    // 1. 查找所有已过期的 active 房间并物理删除其消息与磁盘私有语音
    const [expiredRooms] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM rooms WHERE status = 'active' AND expires_at <= NOW(3) LIMIT 100"
    );
    for (const row of expiredRooms) {
      const rId = String(row.id);
      await pool.query("DELETE FROM messages WHERE room_id = ?", [rId]);
      await pool.query(
        "UPDATE rooms SET status = 'expired', ended_at = NOW(3), ended_reason = 'timeout' WHERE id = ? AND status = 'active'",
        [rId]
      );
      await purgeRoomVoiceFiles(rId);
      expiredRoomsPurged += 1;
    }

    // 2. 查找所有已满 14 天取证保留期的 under_review 房间，物理删除其冻结消息、举报行与磁盘语音
    const [expiredReviewRooms] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM rooms WHERE status = 'under_review' AND evidence_retain_until IS NOT NULL AND evidence_retain_until <= NOW(3) LIMIT 100"
    );
    for (const row of expiredReviewRooms) {
      const rId = String(row.id);
      await pool.query("DELETE FROM messages WHERE room_id = ?", [rId]);
      await pool.query("DELETE FROM reports WHERE room_id = ?", [rId]);
      await pool.query(
        "UPDATE rooms SET status = 'expired' WHERE id = ?",
        [rId]
      );
      await purgeRoomVoiceFiles(rId);
      expiredReportsPurged += 1;
    }

    // 3. 清理其它独立到期的 reports 记录与超时匹配队列
    await pool.query("DELETE FROM reports WHERE retain_until <= NOW(3)");
    await pool.query(
      "DELETE FROM match_queue WHERE matched_room_id IS NULL AND joined_at < DATE_SUB(NOW(3), INTERVAL 45 SECOND)"
    );

    return {
      expiredRoomsPurged,
      expiredReportsPurged,
      executedAtIso: new Date(nowMs).toISOString(),
    };
  }

  // ---------------- 内存引擎清理 ----------------
  const mem = getMemStore();
  const roomEntries = Array.from(mem.rooms.entries());
  for (const [rId, room] of roomEntries) {
    if (room.status === "active" && nowMs >= room.expiresAtMs) {
      room.status = "expired";
      room.endedAtMs = nowMs;
      room.endedReason = "timeout";
      mem.messages.delete(rId);
      await purgeRoomVoiceFiles(rId);
      expiredRoomsPurged += 1;
    } else if (
      room.status === "under_review" &&
      room.evidenceRetainUntilMs &&
      nowMs >= room.evidenceRetainUntilMs
    ) {
      room.status = "expired";
      mem.messages.delete(rId);
      await purgeRoomVoiceFiles(rId);
      expiredReportsPurged += 1;
    }
  }

  return {
    expiredRoomsPurged,
    expiredReportsPurged,
    executedAtIso: new Date(nowMs).toISOString(),
  };
}

export function triggerOpportunisticPurge(): void {
  if (Date.now() - lastAutoPurgeAtMs > 30_000) {
    purgeExpiredData().catch(() => {});
  }
}
