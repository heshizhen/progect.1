"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SafetyPage() {
  const [mask, setMask] = useState<string>("once_...");
  const [excludedCount, setExcludedCount] = useState<number>(0);
  const [storageEngine, setStorageEngine] = useState<string>("checking");
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/identity/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setMask(data.maskedId);
          setExcludedCount(data.excludedCount || 0);
          setStorageEngine(data.storageEngine || "memory");
        }
      })
      .catch(() => {});
  }, []);

  const handleConfirmReset = async () => {
    setResetMessage(null);
    try {
      const res = await fetch("/api/identity/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setResetMessage(data.error || "重置受限，请稍后再试。");
      } else {
        setMask(data.mask);
        setExcludedCount(0);
        setResetMessage("已签发全新 HttpOnly 匿名身份凭证，历史排除记录已解绑。");
      }
    } catch {
      setResetMessage("请求失败，请检查网络连接。");
    } finally {
      setConfirmingReset(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-5 overflow-y-auto space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-once-primary">
            设置与安全边界说明
          </h1>
          <Link href="/" className="text-xs text-once-accent hover:underline">
            返回首页
          </Link>
        </div>

        {/* 1. 诚实边界置顶说明卡片 */}
        <div className="p-3.5 rounded-xl bg-once-warn/10 border border-once-warn/30 space-y-1.5">
          <div className="text-xs font-semibold text-once-warn flex items-center gap-1.5">
            <span>⚠️</span>
            <span>重要声明：匿名身份 ≠ 自然人跨设备识别</span>
          </div>
          <p className="text-xs text-once-secondary leading-relaxed">
            为了保护隐私，ONCE 不收集手机号、邮箱、实名信息或侵入式硬件指纹。服务端永久排重基于
            <strong className="text-once-primary">
              当前浏览器/设备的加密匿名凭证（Identity ID）
            </strong>
            。若你或对方更换设备、切换浏览器、使用无痕窗口或重置凭证，系统无法识别为同一自然人，因此不承诺跨设备的绝对排重。
          </p>
        </div>

        {/* 2. 当前匿名身份凭证管理 */}
        <div className="p-3.5 rounded-xl bg-once-canvas border border-once-border space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-once-primary">
              当前匿名身份凭证
            </span>
            <span className="text-[11px] font-mono text-once-calm bg-once-calm/10 px-2 py-0.5 rounded">
              HttpOnly · {storageEngine === "mysql" ? "MySQL 已连接" : "服务端内存模式"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-once-surface border border-once-border">
              <div className="text-[10px] text-once-muted">匿名凭证掩码摘要</div>
              <div className="font-mono text-once-primary mt-0.5">{mask}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-once-surface border border-once-border">
              <div className="text-[10px] text-once-muted">已永久排除对象</div>
              <div className="font-mono text-once-accent mt-0.5">
                {excludedCount} 人
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] text-once-muted">
              重置后既有不重复排除记录将失效（24h 限 1 次）
            </span>
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="px-2.5 py-1.5 rounded-lg border border-once-critical/40 text-once-critical hover:bg-once-critical/15 text-xs font-medium transition-colors shrink-0"
            >
              重置凭证
            </button>
          </div>

          {confirmingReset && (
            <div className="p-2.5 rounded-lg bg-once-critical/15 border border-once-critical/40 text-xs space-y-2">
              <p className="text-once-primary">
                确定重置匿名凭证吗？重置后你将可能再次遇到此前已排除的 {excludedCount} 位陌生人。
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  className="px-2.5 py-1 rounded bg-once-critical text-slate-950 font-semibold"
                >
                  确认重置
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="px-2.5 py-1 rounded bg-once-elevated text-once-secondary"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {resetMessage && (
            <p className="text-xs text-once-warn font-mono">{resetMessage}</p>
          )}
        </div>

        {/* 3. 数据销毁与举报证据保留双轨策略 */}
        <div className="p-3.5 rounded-xl bg-once-canvas border border-once-border space-y-2">
          <div className="text-xs font-medium text-once-primary">
            聊天销毁与举报取证保留策略
          </div>
          <ul className="text-xs text-once-secondary space-y-1.5 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-once-primary">正常结束：</strong>
              倒计时归零或任一方离开时，服务端立即从 MySQL 物理删除消息记录与语音文件，仅保留双方的匿名 ID 排除组合。
            </li>
            <li>
              <strong className="text-once-primary">触发举报例外：</strong>
              若任一方发起违规举报，当前会话最近上下文与涉事语音将转为{" "}
              <code className="font-mono text-once-warn">under_review</code>{" "}
              加密冻结状态，双方立即不可见，仅限安全审核读取，最长保留 14 天后物理销毁。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
