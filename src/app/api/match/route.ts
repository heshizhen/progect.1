import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_DURATIONS, DurationMinutes } from "@/types/once";
import {
  cancelMatchQueue,
  getHashedIdentityFromRequest,
  matchOrEnqueue,
  triggerOpportunisticPurge,
} from "@/lib/db/store";

export async function POST(req: NextRequest) {
  try {
    triggerOpportunisticPurge();
    const body = await req.json().catch(() => ({}));
    const rawDuration = Number(body.duration || 10);
    const duration: DurationMinutes = ALLOWED_DURATIONS.includes(
      rawDuration as DurationMinutes
    )
      ? (rawDuration as DurationMinutes)
      : 10;

    const { tokenHash, maskedId } = getHashedIdentityFromRequest(req);
    const result = await matchOrEnqueue(tokenHash, maskedId, duration);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { tokenHash } = getHashedIdentityFromRequest(req);
    await cancelMatchQueue(tokenHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
