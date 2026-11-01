import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredData } from "@/lib/db/store";

export async function POST(req: NextRequest) {
  const secret =
    process.env.ONCE_IDENTITY_HMAC_SECRET || "project-once-default-dev-pepper";
  const authHeader = req.headers.get("authorization") || "";

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED_CRON_TOKEN" },
      { status: 401 }
    );
  }

  try {
    const stats = await purgeExpiredData();
    return NextResponse.json({
      ok: true,
      ...stats,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "PURGE_FAILED" },
      { status: 500 }
    );
  }
}
