"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ALLOWED_DURATIONS, DurationMinutes } from "@/types/once";

export default function LandingPage() {
  const router = useRouter();
  const [duration, setDuration] = useState<DurationMinutes>(10);

  const handleStartMatch = () => {
    router.push(`/match?duration=${duration}`);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="my-auto flex flex-col items-center text-center">
        <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
          <div className="animate-pulse-slow absolute inset-0 rounded-full border border-once-accent/40 shadow-[0_0_40px_rgba(129,140,248,0.2)]" />
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-once-canvas via-once-surface to-once-accent/30 border border-once-accent/60 flex items-center justify-center">
            <span className="font-mono text-xs tracking-widest text-once-accent">
              ONCE
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-once-primary mb-2">
          一期一会，说完即散
        </h1>
        <p className="text-sm text-once-secondary max-w-xs leading-relaxed mb-6">
          无需注册的随机一对一匿名对话。没有个人主页、没有好友与关注，倒计时归零即刻销毁全部文字与语音。
        </p>

        <div className="w-full mb-6">
          <div className="flex items-center justify-between text-xs text-once-secondary mb-2 px-1">
            <span>选择本次对话时长</span>
            <span className="font-mono text-once-accent">
              {duration === 10 ? "默认 10 分钟" : `已选 ${duration} 分钟`}
            </span>
          </div>
          <div
            className="grid grid-cols-4 gap-2"
            role="radiogroup"
            aria-label="选择对话时长"
          >
            {ALLOWED_DURATIONS.map((item) => {
              const active = item === duration;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDuration(item)}
                  className={
                    active
                      ? "py-2.5 px-2 rounded-xl text-xs font-mono border border-once-accent bg-once-accent/15 text-once-primary font-semibold shadow-sm transition-all"
                      : "py-2.5 px-2 rounded-xl text-xs font-mono border border-once-border bg-once-elevated/60 text-once-secondary hover:text-once-primary transition-all"
                  }
                >
                  {item} 分钟
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartMatch}
          className="w-full py-3.5 px-5 rounded-xl bg-once-accent hover:bg-once-accentHover text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-once-accent/15"
        >
          开始随机匹配（{duration} 分钟）
        </button>
      </div>

      <div className="pt-4 border-t border-once-border/70 text-left">
        <div className="flex items-start gap-2 text-xs text-once-secondary leading-relaxed">
          <span className="text-once-calm font-mono mt-0.5">●</span>
          <p>
            <strong className="text-once-primary font-medium">
              同一匿名身份永久排除再次匹配：
            </strong>
            系统通过服务端加密凭证确保同一匿名身份绝不重逢；但无注册机制
            <span className="text-once-warn">
              无法跨设备、跨浏览器或清除数据后识别同一自然人
            </span>
            。
            <Link
              href="/safety"
              className="underline text-once-accent hover:text-once-primary ml-1"
            >
              了解安全边界
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
