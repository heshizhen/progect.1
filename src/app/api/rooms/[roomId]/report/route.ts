import { NextRequest, NextResponse } from "next/server";
import { ReportCategory } from "@/types/once";
import {
  getHashedIdentityFromRequest,
  reportAndFreezeRoom,
} from "@/lib/db/store";

export async function POST(
  req: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const { roomId } = context.params;
    const body = await req.json().catch(() => ({}));
    const category = (body.category || "other") as ReportCategory;
    const { tokenHash } = getHashedIdentityFromRequest(req);

    const result = await reportAndFreezeRoom(roomId, tokenHash, category);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
