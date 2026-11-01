import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  appendRoomMessage,
  getHashedIdentityFromRequest,
} from "@/lib/db/store";
import { savePrivateVoiceFile } from "@/lib/storage/voiceStorage";

export async function POST(
  req: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const { roomId } = context.params;
    const { tokenHash, maskedId } = getHashedIdentityFromRequest(req);

    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const durationSec = Math.min(
      60,
      Math.max(1, Number(formData.get("durationSec") || 1))
    );

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "未检测到有效语音文件。" },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = audioFile.type || "audio/webm";
    const messageId =
      "vmsg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    // 1. 先存入服务端非公开私有目录 .private_storage/voice/<roomId>/
    const { relativePath } = await savePrivateVoiceFile({
      roomId,
      messageId,
      buffer,
      mimeType,
    });

    // 2. 写入数据库消息表并生成短期 HMAC 签名播放链接
    const res = await appendRoomMessage({
      roomId,
      tokenHash,
      maskedId,
      msgType: "voice",
      messageId,
      voiceStoragePath: relativePath,
      voiceDurationSec: durationSec,
    });

    if (!res.ok) {
      return NextResponse.json(res, { status: 400 });
    }

    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "VOICE_UPLOAD_FAILED",
      },
      { status: 500 }
    );
  }
}
