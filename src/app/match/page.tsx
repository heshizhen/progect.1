"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ALLOWED_DURATIONS, DurationMinutes } from "@/types/once";

function MatchQueueContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawDuration = Number(searchParams.get("duration") || 10);
  const initialDuration: DurationMinutes = ALLOWED_DURATIONS.includes(
    rawDuration as DurationMinutes
  )
    ? (rawDuration as DurationMinutes)
    : 10;

  const [poolDuration, setPoolDuration] =
    useState<DurationMinutes>(initialDuration);
  const [waitSec, setWaitSec] = useState<number>(1);
  const [showFallbackPrompt, setShowFallbackPrompt] = useState<boolean>(false);
  const [storageEngine, setStorageEngine] = useState<string>("checking");

  // 每 1.5 秒向服务端请求原子匹配（支持本地双开窗口真实配对 + pair_exclusions 排重）
  useEffect(() => {
    let active = true;

    const pollMatch = async () => {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration: poolDuration }),
        });
        const data = await res.json();
        if (!active || !data.ok) return;
        if (data.storageEngine) setStorageEngine(data.storageEngine);
        if (data.status === "matched" && data.roomId) {
          router.replace(
            `/chat/${data.roomId}?duration=${data.durationMinutes || poolDuration}`
          );
        }
      } catch {
        // 忽略单次网络抖动
      }
    };

    pollMatch();
    const pollInterval = setInterval(pollMatch, 1500);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [poolDuration, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setWaitSec((prev) => {
        const next = prev + 1;
        if (next === 20 && poolDuration !== 10) {
          setShowFallbackPrompt(true);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [poolDuration]);

  const formatSec = (s: number) => {
    const mins = String(Math.floor(s / 60)).padStart(2, "0");
    const secs = String(s % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleCancelMatch = async () => {
    await fetch("/api/match", { method: "DELETE" }).catch(() => {});
    router.push("/");
  };

  const handleSimulatePaired = () => {
    const mockRoomId = "room_" + Math.random().toString(36).slice(2, 8);
    router.push(`/chat/${mockRoomId}?duration=${poolDuration}`);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="my-auto flex flex-col items-center text-center">
        <div className="relative w-36 h-36 mb-6 flex items-center justify-center">
          <div className="animate-pulse-slow absolute inset-0 rounded-full border border-once-accent/30" />
          <div className="w-20 h-20 rounded-full bg-once-elevated border border-once-border flex flex-col items-center justify-center">
            <span className="text-[10px] text-once-muted uppercase tracking-wider">
              Wait
            </span>
            <span className="tabular-timer text-lg font-semibold text-once-accent">
              {formatSec(waitSec)}
            </span>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-once-elevated border border-once-border text-xs font-mono text-once-secondary mb-3">
          <span className="w-2 h-2 rounded-full bg-once-calm animate-pulse" />
          <span>
            {poolDuration} 分钟对话池 · 引擎:{" "}
            {storageEngine === "mysql" ? "MySQL 事务" : "服务端内存"}
          </span>
        </div>

        <h2 className="text-lg font-semibold text-once-primary mb-2">
          正在寻找此刻同频的陌生人…
        </h2>
        <p className="text-xs text-once-secondary max-w-xs leading-relaxed mb-6">
          你可以再打开一个<strong className="text-once-primary">无痕浏览器窗口</strong>访问{" "}
          <code className="font-mono text-once-accent">localhost:3000</code>{" "}
          并点击相同分钟数，两个窗口将立即完成真实配对（且配对后写入{" "}
          <code className="font-mono text-once-accent">pair_exclusions</code>{" "}
          永久不再重逢）。
        </p>

        {showFallbackPrompt && (
          <div className="w-full p-3.5 rounded-xl bg-once-warn/10 border border-once-warn/30 text-left mb-4">
            <p className="text-xs text-once-primary font-medium mb-1">
              当前 {poolDuration} 分钟池等待较久
            </p>
            <p className="text-xs text-once-secondary mb-2.5">
              是否愿意切换至人数最多的默认 10 分钟对话池？
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPoolDuration(10);
                  setShowFallbackPrompt(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-once-warn text-slate-950 font-semibold text-xs"
              >
                切换至 10 分钟池
              </button>
              <button
                type="button"
                onClick={() => setShowFallbackPrompt(false)}
                className="px-3 py-1.5 rounded-lg bg-once-elevated text-once-secondary text-xs"
              >
                继续等待
              </button>
            </div>
          </div>
        )}

        <div className="w-full p-3 rounded-xl bg-once-canvas/80 border border-once-border mb-4 text-left">
          <div className="text-[11px] font-mono text-once-muted mb-2">
            单窗口快速预览入口（无需开第二个窗口）：
          </div>
          <button
            type="button"
            onClick={handleSimulatePaired}
            className="w-full py-2 px-3 rounded-lg bg-once-calm/15 border border-once-calm/40 text-once-calm text-xs font-medium hover:bg-once-calm/25 transition-colors"
          >
            直接进入单人演示聊天室
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCancelMatch}
        className="w-full py-3 rounded-xl border border-once-border bg-once-elevated/60 hover:bg-once-elevated text-once-secondary hover:text-once-primary text-xs font-medium transition-colors"
      >
        取消匹配并返回首页
      </button>
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-once-secondary">
          正在加入匹配队列…
        </div>
      }
    >
      <MatchQueueContent />
    </Suspense>
  );
}
