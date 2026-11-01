import { NextRequest, NextResponse } from "next/server";
import {
  getHashedIdentityFromRequest,
  syncRoomState,
} from "@/lib/db/store";

export async function GET(
  req: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const { roomId } = context.params;
    const { tokenHash, maskedId } = getHashedIdentityFromRequest(req);
    const state = await syncRoomState(roomId, tokenHash, maskedId);

    if (!state.ok) {
      return NextResponse.json(state, { status: 403 });
    }
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
