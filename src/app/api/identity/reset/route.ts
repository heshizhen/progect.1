import { NextRequest, NextResponse } from "next/server";

const ANON_COOKIE_NAME = "once_anon_token";
const ANON_MASK_COOKIE = "once_anon_mask";
const LAST_RESET_COOKIE = "once_last_reset_ts";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 小时冷却限制，防止恶意频繁重置绕过拉黑

export async function POST(req: NextRequest) {
  const lastResetRaw = req.cookies.get(LAST_RESET_COOKIE)?.value;
  const now = Date.now();

  if (lastResetRaw) {
    const elapsed = now - Number(lastResetRaw);
    if (!Number.isNaN(elapsed) && elapsed < COOLDOWN_MS) {
      const remainHours = Math.ceil((COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
      return NextResponse.json(
        {
          ok: false,
          error: `为防止滥用与绕过屏蔽，匿名身份每 24 小时仅可重置 1 次（约需等待 ${remainHours} 小时）。`,
        },
        { status: 429 }
      );
    }
  }

  const uuid = crypto.randomUUID().replace(/-/g, "");
  const rawId = `once_${uuid}`;
  const mask = `once_${uuid.slice(0, 4)}...${uuid.slice(-4)}`;

  const res = NextResponse.json({
    ok: true,
    mask,
    serverNowIso: new Date(now).toISOString(),
  });

  res.cookies.set(ANON_COOKIE_NAME, rawId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  res.cookies.set(ANON_MASK_COOKIE, mask, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  res.cookies.set(LAST_RESET_COOKIE, String(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return res;
}
