"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FarewellReason } from "@/types/once";

function FarewellContent() {
  const searchParams = useSearchParams();
  const reason = (searchParams.get("reason") || "timeout") as FarewellReason;
  const duration = searchParams.get("duration") || "10";

  const copyMap: Record<
    FarewellReason,
    { badge: string; title: string; subtitle: string; receipt1: string }
  > = {
    timeout: {
      badge: "TIME EXPIRED · DISSOLVED",
      title: `${duration} 分钟已尽，这段对话已随风消散`,
      subtitle:
        "感谢这一刻的坦诚交汇。按照 ONCE 的规则，你们不留联系方式，也不会再次相遇。",
      receipt1: "房间内全部文字记录与语音文件已从活动库清除",
    },
    partner_left: {
      badge: "PARTNER LEFT · DISSOLVED",
      title: "对方已先行离开，房间已关闭",
      subtitle: "全部聊天内容与语音已即时清理，你们不会再次匹配。",
      receipt1: "房间内全部文字记录与语音文件已从活动库清除",
    },
    self_left: {
      badge: "ENDED BY YOU",
      title: "你已提前结束本次对话",
      subtitle: "房间已立即关闭，全部文字与语音已清除，你们未来不会再次匹配。",
      receipt1: "房间内全部文字记录与语音文件已从活动库清除",
    },
    reported: {
      badge: "REPORT SUBMITTED & BLOCKED",
      title: "已提交举报并安全终止对话",
      subtitle:
        "我们已永久屏蔽该匿名对象。为配合安全核查，本房间证据已加密冻结，审核后将物理销毁。",
      receipt1:
        "当前会话上下文与涉事语音已加密冻结至安全隔离区（最长保留 14 天后物理销毁）",
    },
  };

  const current = copyMap[reason] || copyMap.timeout;

  return (
    <div className="flex-1 flex flex-col justify-between p-6">
      <div className="my-auto flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-once-elevated border border-once-border flex items-center justify-center mb-5">
          <span className="text-2xl text-once-secondary font-mono">◌</span>
        </div>

        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-once-elevated border border-once-border text-once-secondary mb-2">
          {current.badge}
        </span>
        <h1 className="text-xl font-semibold text-once-primary mb-2">
          {current.title}
        </h1>
        <p className="text-xs text-once-secondary max-w-xs leading-relaxed mb-6">
          {current.subtitle}
        </p>

        <div className="w-full p-4 rounded-2xl bg-once-canvas border border-once-border text-left space-y-2.5 mb-6">
          <div className="text-xs font-medium text-once-primary mb-1">
            服务端清理与安全执行回执：
          </div>
          <div className="flex items-start gap-2 text-xs text-once-secondary">
            <span className="text-once-calm font-mono">✓</span>
            <span>{current.receipt1}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-once-secondary">
            <span className="text-once-calm font-mono">✓</span>
            <span>私有 Storage 语音短期签名链接（Signed URL）已立即失效</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-once-secondary">
            <span className="text-once-calm font-mono">✓</span>
            <span>
              双方匿名身份已写入{" "}
              <code className="text-once-accent font-mono">
                pair_exclusions
              </code>
              ，永久排除再次匹配
            </span>
          </div>
        </div>

        <Link
          href="/"
          className="w-full py-3.5 px-5 rounded-xl bg-once-accent hover:bg-once-accentHover text-slate-950 font-semibold text-sm transition-all text-center"
        >
          开启新的相遇（返回首页）
        </Link>
      </div>

      <div className="pt-4 border-t border-once-border/70 text-center">
        <Link
          href="/safety"
          className="text-xs text-once-secondary hover:text-once-primary underline"
        >
          查看匿名身份排重边界与举报证据保留政策
        </Link>
      </div>
    </div>
  );
}

export default function FarewellPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-once-secondary">
          正在清理房间数据…
        </div>
      }
    >
      <FarewellContent />
    </Suspense>
  );
}
