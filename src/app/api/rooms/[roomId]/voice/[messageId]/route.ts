import { NextRequest, NextResponse } from "next/server";
import {
  authorizeVoiceAccess,
  getHashedIdentityFromRequest,
} from "@/lib/db/store";
import {
  readPrivateVoiceFile,
  verifySignedVoiceQuery,
} from "@/lib/storage/voiceStorage";

export async function GET(
  req: NextRequest,
  context: { params: { roomId: string; messageId: string } }
) {
  try {
    const { roomId, messageId } = context.params;
    const expRaw = req.nextUrl.searchParams.get("exp");
    const sigRaw = req.nextUrl.searchParams.get("sig");

    // 1. 校验短期 HMAC 签名与过期时间戳
    const validSig = verifySignedVoiceQuery({
      roomId,
      messageId,
      expRaw,
      sigRaw,
    });
    if (!validSig) {
      return NextResponse.json(
        { ok: false, error: "语音签名链接已失效或非法。" },
        { status: 403 }
      );
    }

    // 2. 校验当前请求者的 HttpOnly 匿名凭证确属该房间参与者，且房间仍处于 active 状态
    const { tokenHash } = getHashedIdentityFromRequest(req);
    const auth = await authorizeVoiceAccess({
      roomId,
      messageId,
      tokenHash,
    });
    if (!auth.allowed || !auth.voiceStoragePath) {
      return NextResponse.json(
        { ok: false, error: "房间已关闭或无权访问该语音。" },
        { status: 410 }
      );
    }

    // 3. 从服务端私有目录读取音频流并禁止任何浏览器/CDN 缓存
    const file = await readPrivateVoiceFile(auth.voiceStoragePath);
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "语音文件已物理销毁。" },
        { status: 410 }
      );
    }

    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.buffer.byteLength),
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "VOICE_READ_ERROR" },
      { status: 500 }
    );
  }
}
