import { NextRequest, NextResponse } from "next/server";

const ANON_COOKIE_NAME = "once_anon_token";
const ANON_MASK_COOKIE = "once_anon_mask";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 365 days

function generateAnonToken(): { rawId: string; mask: string } {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  const mask = `once_${uuid.slice(0, 4)}...${uuid.slice(-4)}`;
  return { rawId: `once_${uuid}`, mask };
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const existingToken = req.cookies.get(ANON_COOKIE_NAME)?.value;
  const existingMask = req.cookies.get(ANON_MASK_COOKIE)?.value;

  if (!existingToken || !existingMask) {
    const { rawId, mask } = generateAnonToken();

    // 真实身份凭证写入 HttpOnly Cookie，禁止客户端 JS 读取或篡改
    res.cookies.set(ANON_COOKIE_NAME, rawId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });

    // 仅向前端暴露不可逆掩码摘要用于页面展示
    res.cookies.set(ANON_MASK_COOKIE, mask, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
