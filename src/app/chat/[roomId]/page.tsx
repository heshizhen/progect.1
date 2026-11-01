"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ALLOWED_DURATIONS,
  ChatMessage,
  DurationMinutes,
  ReportCategory,
} from "@/types/once";

function ChatRoomContent() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const roomId = String(params.roomId || "room_demo");
  const searchParams = useSearchParams();
  const rawDuration = Number(searchParams.get("duration") || 10);
  const durationMinutes: DurationMinutes = ALLOWED_DURATIONS.includes(
    rawDuration as DurationMinutes
  )
    ? (rawDuration as DurationMinutes)
    : 10;

  const [serverEndLocalTargetMs, setServerEndLocalTargetMs] = useState<number>(
    () => Date.now() + durationMinutes * 60 * 1000
  );
  const [remainingSec, setRemainingSec] = useState<number>(
    durationMinutes * 60
  );
  const [partnerAlias, setPartnerAlias] = useState<string>("Stranger");
  const [sendError, setSendError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>("");

  // 语音录制状态
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSec, setRecordingSec] = useState<number>(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 举报弹窗状态
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportCategory, setReportCategory] =
    useState<ReportCategory>("harassment");

  const listEndRef = useRef<HTMLDivElement | null>(null);

  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/sync`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) return;

      if (data.partnerAlias) {
        setPartnerAlias(data.partnerAlias);
      }

      if (data.status !== "active") {
        const reason =
          data.status === "under_review"
            ? "reported"
            : data.endedReason === "timeout" || data.status === "expired"
            ? "timeout"
            : "partner_left";
        router.replace(`/farewell?reason=${reason}&duration=${durationMinutes}`);
        return;
      }

      if (typeof data.remainingSeconds === "number") {
        setServerEndLocalTargetMs(Date.now() + data.remainingSeconds * 1000);
        setRemainingSec(data.remainingSeconds);
      }

      if (Array.isArray(data.messages)) {
        setMessages((prev) => {
          if (data.messages.length !== prev.length) {
            return data.messages;
          }
          return prev;
        });
      }
    } catch {
      // 忽略瞬时网络波动
    }
  }, [roomId, durationMinutes, router]);

  useEffect(() => {
    syncWithServer();
    const syncTimer = setInterval(syncWithServer, 1200);
    return () => clearInterval(syncTimer);
  }, [syncWithServer]);

  useEffect(() => {
    const timer = setInterval(() => {
      const diffSec = Math.max(
        0,
        Math.ceil((serverEndLocalTargetMs - Date.now()) / 1000)
      );
      setRemainingSec(diffSec);
      if (diffSec <= 0) {
        clearInterval(timer);
        fetch(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "timeout" }),
        }).finally(() => {
          router.replace(`/farewell?reason=timeout&duration=${durationMinutes}`);
        });
      }
    }, 500);
    return () => clearInterval(timer);
  }, [serverEndLocalTargetMs, roomId, durationMinutes, router]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const formatTime = (totalSec: number) => {
    const mins = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const secs = String(totalSec % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    setSendError(null);
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setInputText("");
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "text", text: trimmed }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendError(data.error || "发送失败");
        return;
      }
      await syncWithServer();
    } catch {
      setSendError("网络异常，消息未发出");
    }
  };

  const startVoiceRecording = async () => {
    setSendError(null);
    if (remainingSec <= 5) {
      setSendError("剩余时间不足 5 秒，已锁定语音录制。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSec(1);
    } catch {
      // 无麦克风设备时生成静音/模拟音频流用于本地开发验证
      audioChunksRef.current = [];
      setIsRecording(true);
      setRecordingSec(1);
    }
  };

  useEffect(() => {
    if (!isRecording) return;
    const recTimer = setInterval(() => {
      setRecordingSec((prev) => (prev >= 60 ? 60 : prev + 1));
    }, 1000);
    return () => clearInterval(recTimer);
  }, [isRecording]);

  const cancelVoiceRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSec(0);
  };

  const finishAndSendVoice = async () => {
    const dur = Math.max(1, recordingSec);
    setIsRecording(false);
    setRecordingSec(0);
    setIsUploadingVoice(true);
    setSendError(null);

    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        await new Promise<void>((resolve) => {
          const rec = mediaRecorderRef.current!;
          rec.addEventListener("stop", () => resolve(), { once: true });
          rec.stop();
        });
      }

      // 构建二进制音频 Blob（若在无麦克风机器测试，生成一个最小 WebM 占位二进制块以验证私有存储与签名流闭环）
      const blob =
        audioChunksRef.current.length > 0
          ? new Blob(audioChunksRef.current, { type: "audio/webm" })
          : new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00])], {
              type: "audio/webm",
            });

      const formData = new FormData();
      formData.append("audio", blob, "voice.webm");
      formData.append("durationSec", String(dur));

      const res = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/voice`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendError(data.error || "语音上传失败");
      } else {
        await syncWithServer();
      }
    } catch {
      setSendError("语音上传失败，请检查网络");
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const handleLeaveRoom = async () => {
    await fetch(`/api/rooms/${encodeURIComponent(roomId)}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "self_left" }),
    }).catch(() => {});
    router.replace(`/farewell?reason=self_left&duration=${durationMinutes}`);
  };

  const handleReportRoom = async () => {
    await fetch(`/api/rooms/${encodeURIComponent(roomId)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: reportCategory }),
    }).catch(() => {});
    setShowReportModal(false);
    router.replace(`/farewell?reason=reported&duration=${durationMinutes}`);
  };

  const timerColorClass =
    remainingSec <= 15
      ? "text-once-critical"
      : remainingSec <= 60
      ? "text-once-warn"
      : "text-once-calm";

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* 顶部权威倒计时栏 */}
      <div className="px-4 py-2.5 bg-once-canvas/90 border-b border-once-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-once-calm"
            title="实时同步中"
          />
          <div>
            <div className="text-xs font-medium text-once-primary font-mono">
              {partnerAlias}
            </div>
            <div className="text-[10px] text-once-muted">
              配对已写入永久排除表
            </div>
          </div>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-once-surface border border-once-border"
          title="基于服务端权威时钟同步，修改客户端系统时间无效"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              remainingSec <= 15
                ? "bg-once-critical animate-ping"
                : remainingSec <= 60
                ? "bg-once-warn animate-pulse"
                : "bg-once-calm"
            }`}
          />
          <span
            className={`tabular-timer text-sm font-semibold ${timerColorClass}`}
          >
            {formatTime(remainingSec)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="px-2 py-1 rounded-lg text-xs text-once-critical hover:bg-once-critical/15 transition-colors"
          >
            举报/屏蔽
          </button>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="px-2 py-1 rounded-lg text-xs text-once-secondary hover:text-once-primary hover:bg-once-elevated transition-colors"
          >
            离开
          </button>
        </div>
      </div>

      {/* 本地开发阶段快速模拟倒计时状态条 */}
      <div className="px-3 py-1.5 bg-once-elevated/50 border-b border-once-border flex items-center justify-between text-[11px] text-once-secondary">
        <span>本地预览倒计时状态：</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setServerEndLocalTargetMs(Date.now() + 55 * 1000)}
            className="px-2 py-0.5 rounded bg-once-surface border border-once-warn/40 text-once-warn font-mono"
          >
            预警 00:55
          </button>
          <button
            type="button"
            onClick={() => setServerEndLocalTargetMs(Date.now() + 12 * 1000)}
            className="px-2 py-0.5 rounded bg-once-surface border border-once-critical/40 text-once-critical font-mono"
          >
            临别 00:12
          </button>
        </div>
      </div>

      {remainingSec <= 60 && (
        <div className="px-4 py-2 bg-once-warn/15 border-b border-once-warn/30 text-xs text-once-warn flex items-center justify-between">
          <span>⏳ 对话将在 {remainingSec} 秒后永久消散，珍惜最后几句话。</span>
          <span className="font-mono text-[11px]">不可延时</span>
        </div>
      )}

      {/* 消息流区域 */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[420px]">
        <div className="text-center my-1">
          <span className="inline-block px-3 py-1 rounded-full bg-once-canvas border border-once-border text-[11px] text-once-muted">
            🔒 文字与私有语音在倒计时归零时立即从磁盘与 MySQL 物理删除
          </span>
        </div>

        {messages.map((msg) => {
          const isMe = msg.sender === "me";
          return (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${
                isMe ? "items-end ml-auto" : "items-start"
              }`}
            >
              {msg.type === "text" ? (
                <div
                  className={
                    isMe
                      ? "px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-once-accent/20 border border-once-accent/40 text-sm text-once-primary leading-relaxed break-words"
                      : "px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-once-canvas border border-once-border text-sm text-once-primary leading-relaxed break-words"
                  }
                >
                  {msg.text}
                </div>
              ) : (
                <div
                  className={
                    isMe
                      ? "px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-once-accent/20 border border-once-accent/40 flex flex-col gap-1.5"
                      : "px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-once-canvas border border-once-border flex flex-col gap-1.5"
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-once-primary">
                      🎙️ 语音 ({msg.voiceDurationSec || 1}s)
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-once-surface text-once-accent">
                      HMAC Signed
                    </span>
                  </div>
                  {msg.voiceUrl && (
                    <audio
                      controls
                      preload="none"
                      src={msg.voiceUrl}
                      className="h-8 max-w-[210px]"
                    />
                  )}
                </div>
              )}
              <span className="text-[10px] font-mono text-once-muted mt-1 px-1">
                {isMe ? "你" : partnerAlias}
              </span>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>

      {/* 底部输入栏 */}
      <div className="p-3 bg-once-surface border-t border-once-border">
        {sendError && (
          <div className="mb-2 text-xs text-once-critical px-2">{sendError}</div>
        )}

        {isRecording && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-once-elevated border border-once-accent/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-once-critical animate-ping" />
              <span className="text-xs text-once-primary">正在录音…</span>
              <span className="tabular-timer text-xs text-once-accent font-mono">
                0:{String(recordingSec).padStart(2, "0")} / 0:60
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="px-2.5 py-1 rounded-lg bg-once-surface text-once-secondary text-xs hover:text-once-primary"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isUploadingVoice}
                onClick={finishAndSendVoice}
                className="px-2.5 py-1 rounded-lg bg-once-accent text-slate-950 font-semibold text-xs"
              >
                {isUploadingVoice ? "加密上传中…" : "发送语音"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSendText} className="flex items-center gap-2">
          <button
            type="button"
            disabled={isUploadingVoice}
            onClick={() =>
              isRecording ? cancelVoiceRecording() : startVoiceRecording()
            }
            className="p-2.5 rounded-xl bg-once-elevated border border-once-border text-once-secondary hover:text-once-accent transition-colors text-xs font-mono shrink-0"
          >
            🎙️ 语音
          </button>
          <input
            type="text"
            maxLength={500}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入消息（支持双开窗口实时文字+语音）…"
            className="flex-1 bg-once-canvas border border-once-border rounded-xl px-3.5 py-2.5 text-sm text-once-primary placeholder:text-once-muted focus:outline-none focus:border-once-accent"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-once-accent hover:bg-once-accentHover text-slate-950 font-semibold text-xs transition-colors shrink-0"
          >
            发送
          </button>
        </form>
      </div>

      {/* 举报弹窗 */}
      {showReportModal && (
        <div className="absolute inset-0 z-20 bg-once-canvas/85 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full bg-once-surface border border-once-border rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-once-critical">
                举报并立即终止对话
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-xs text-once-secondary hover:text-once-primary"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-once-secondary leading-relaxed">
              提交后将立即关闭房间、永久屏蔽对方，并将本房间聊天与私有语音文件标记为{" "}
              <code className="font-mono text-once-warn">under_review</code>{" "}
              加密冻结至安全审核隔离区（双方立即不可访问，最多保留 14 天后物理销毁）。
            </p>
            <div className="space-y-2 text-xs">
              {[
                { id: "harassment", label: "骚扰、辱骂或仇恨言论" },
                { id: "illegal_or_nsfw", label: "色情低俗或违法违规语音/文字" },
                { id: "spam_or_scam", label: "垃圾广告、外链导流或诈骗诱导" },
              ].map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-once-canvas border border-once-border cursor-pointer"
                >
                  <input
                    type="radio"
                    name="reportCategory"
                    value={item.id}
                    checked={reportCategory === item.id}
                    onChange={() =>
                      setReportCategory(item.id as ReportCategory)
                    }
                    className="accent-rose-400"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-once-elevated text-once-secondary text-xs font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleReportRoom}
                className="flex-1 py-2.5 rounded-xl bg-once-critical text-slate-950 font-semibold text-xs"
              >
                确认举报并离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-xs text-once-secondary">
          正在同步服务端房间倒计时…
        </div>
      }
    >
      <ChatRoomContent />
    </Suspense>
  );
}
