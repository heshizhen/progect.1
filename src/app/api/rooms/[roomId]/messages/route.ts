import { NextRequest, NextResponse } from "next/server";
import {
  appendRoomMessage,
  getHashedIdentityFromRequest,
} from "@/lib/db/store";

export async function POST(
  req: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const { roomId } = context.params;
    const body = await req.json().catch(() => ({}));
    const msgType = body.type === "voice" ? "voice" : "text";
    const { tokenHash, maskedId } = getHashedIdentityFromRequest(req);

    const res = await appendRoomMessage({
      roomId,
      tokenHash,
      maskedId,
      msgType,
      text: body.text ? String(body.text) : undefined,
      voiceDurationSec: body.voiceDurationSec
        ? Number(body.voiceDurationSec)
        : undefined,
    });

    if (!res.ok) {
      return NextResponse.json(res, { status: 400 });
    }
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
