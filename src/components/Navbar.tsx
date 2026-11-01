"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function readMaskCookie(): string {
  if (typeof document === "undefined") return "once_init...";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("once_anon_mask="));
  return match ? decodeURIComponent(match.split("=")[1]) : "once_8f3a...c91e";
}

export default function Navbar() {
  const [mask, setMask] = useState<string>("once_...");

  useEffect(() => {
    setMask(readMaskCookie());
  }, []);

  return (
    <header className="px-5 py-3.5 border-b border-once-border flex items-center justify-between bg-once-surface/90">
      <Link href="/" className="flex items-center gap-2 group">
        <span className="w-4 h-4 rounded-full border-2 border-once-accent inline-block relative">
          <span className="w-1.5 h-1.5 rounded-full bg-once-accent absolute top-0.5 right-0.5" />
        </span>
        <span className="font-semibold tracking-wider text-sm text-once-primary group-hover:text-once-accent transition-colors">
          ONCE
        </span>
        <span className="text-[11px] text-once-muted font-mono">一晤</span>
      </Link>

      <div className="flex items-center gap-2">
        <span
          className="text-[11px] font-mono text-once-secondary bg-once-elevated px-2 py-0.5 rounded border border-once-border"
          title="当前浏览器匿名身份掩码（真实凭证受 HttpOnly 保护）"
        >
          {mask}
        </span>
        <Link
          href="/safety"
          className="text-xs text-once-secondary hover:text-once-primary px-2 py-1 rounded-lg hover:bg-once-elevated transition-colors"
        >
          安全/设置
        </Link>
      </div>
    </header>
  );
}
