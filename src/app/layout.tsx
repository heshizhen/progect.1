import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "ONCE (一晤) — 仅此一次的匿名陌生人对话",
  description:
    "无需注册、随机一对一匹配、文字+语音消息、倒计时结束即销毁、同一匿名身份永久排除再次匹配。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-once-canvas text-once-primary flex flex-col items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md min-h-screen sm:min-h-[680px] bg-once-surface sm:border border-once-border sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <Navbar />
          <main className="flex-1 flex flex-col">{children}</main>
        </div>
      </body>
    </html>
  );
}
