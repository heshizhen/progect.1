# PROJECT ONCE — Day 1 交付：产品命名、品牌规范与五核心页面交互规格书

## 1. 产品命名与品牌定义

### 1.1 候选命名与推荐方案

| 方案名称 | 中文译名 | 核心意象 | 视觉符号建议 | 适用定位 |
| :--- | :--- | :--- | :--- | :--- |
| **ONCE（推荐）** | **一晤** | 一期一会，仅此一次的交汇 | 单向消逝的日食环（Eclipse Ring） | 克制、冷静、强调“永不再遇”的边界感 |
| **EPHEMERA** | **瞬息** | 朝生暮死、即刻湮灭的对话 | 渐隐微光粒子 | 偏感性、深夜倾诉氛围 |
| **PASSERBY** | **擦肩** | 城市中偶然同路片刻的陌生人 | 两条相交后发散的轨迹线 | 轻松、无压力日常闲聊 |

- **默认执行基准**：以 **ONCE（一晤）** 作为 MVP 阶段的品牌名称（代号 `PROJECT ONCE`）。
- **品牌核心主张（Slogan）**：`One conversation. Zero history. Never again.`（仅此一次的对话，倒计时结束即刻湮灭，永不重逢。）
- **反成瘾与克制设计原则（Anti-Addiction Rules）**：
  - 严禁设计好友申请、关注列表、个人主页、历史聊天记录、打赏或礼物系统。
  - 严禁展示“当前在线人数”、“附近的人”或未读红点诱导。
  - 严禁在倒计时结束后提供“付费延时”或“申请再聊一次”按钮。

### 1.2 匿名身份与防重复匹配诚实边界声明（合规必选文案）

在首页底部与“设置/安全”页置顶位置，必须原样或等价展示以下技术边界声明，避免虚假承诺：

> **关于“永不重逢”的技术边界说明**：
> ONCE 无需注册，系统会为你的当前浏览器生成加密的匿名身份凭证，并在服务端永久记录已配对过的匿名身份组合，确保**同一匿名身份之间绝不会再次匹配**。但受限于无账号匿名机制，系统**无法跨设备、跨浏览器、无痕模式或在清除浏览器数据后识别同一自然人**，因此我们不承诺跨设备/重置凭证后的绝对自然人排重。

## 2. 视觉系统与 Design Tokens（Figma Variables & Tailwind 对齐）

### 2.1 色彩规范（Nocturnal Calm 暗色优先主题）

| Token 名称 | 十六进制值 | Tailwind 映射 | 适用场景与 WCAG 对比度要求 |
| :--- | :--- | :--- | :--- |
| `bg-canvas` | `#0B0D13` | `slate-950` 定制 | 全局主背景，营造安静无压迫的深夜对话场 |
| `bg-surface` | `#121621` | `slate-900` 定制 | 卡片、聊天顶部栏、输入栏容器背景 |
| `bg-elevated` | `#1A2030` | `slate-800` 定制 | 模态框、下拉选项、我方消息气泡背景 |
| `border-subtle` | `#232B3E` | `slate-800/80` | 容器分割线、默认态按钮描边 |
| `text-primary` | `#F3F4F6` | `gray-100` | 正文、核心标题（对比度 > 15:1，符合 AAA） |
| `text-secondary` | `#9CA3AF` | `gray-400` | 辅助说明、系统提示（对比度 ≥ 6.2:1，符合 AA） |
| `text-muted` | `#6B7280` | `gray-500` | 占位符、次要元数据（对比度 ≥ 4.5:1） |
| `accent-once` | `#818CF8` | `indigo-400` | 主按钮、选中态时长标签、我方语音波形高亮 |
| `timer-calm` | `#34D399` | `emerald-400` | 剩余时间 > 60 秒时的倒计时指示 |
| `timer-warn` | `#FBBF24` | `amber-400` | 剩余时间 ≤ 60 秒时的温和提醒态 |
| `timer-critical` | `#F87171` | `rose-400` | 剩余时间 ≤ 15 秒临别态、销毁提示、举报操作 |

### 2.2 字体与排版层级

- **界面与中文主字体（Sans）**：`Inter`, `Noto Sans SC`, `system-ui`, `-apple-system`, `sans-serif`
- **倒计时与匿名凭证字体（Mono）**：`JetBrains Mono`, `ui-monospace`, `monospace`（强制设置 `font-variant-numeric: tabular-nums` 防止秒数跳动引起布局抖动）
- **字号阶梯**：
  - 页面主标题（Hero / 告别标题）：`28px` (`1.75rem`), 行高 `1.3`, 字重 `600`
  - 倒计时数字显示（Timer Display）：`20px` (`1.25rem`), 行高 `1.2`, 字重 `600`, `tabular-nums`
  - 聊天消息正文（Chat Body）：`15px` (`0.9375rem`), 行高 `1.6`, 字重 `400`
  - 辅助说明与安全提示（Caption / Legal）：`13px` (`0.8125rem`), 行高 `1.5`, 字重 `400`

### 2.3 间距与圆角规范

- **画布网格**：Figma 桌面端采用 `1440 × 900`（内容主容器最大宽度 `480px` 居中，保持单栏沉浸式体验，避免宽屏视线分散）；移动端采用 `390 × 844`（iPhone 14/15 基准）。
- **圆角（Border Radius）**：按钮与输入框 `12px` (`rounded-xl`)；卡片与模态框 `16px` (`rounded-2xl`)；消息气泡 `16px`（发送方右下角/接收方左下角收窄为 `4px`）。

## 3. 五个核心页面交互规格与安全边界

### 页面 1：首页（`/` — Landing & Duration Selection）

1. **布局结构**：
   - **顶部导航**：左侧品牌标识 `ONCE ◯`；右侧“设置与安全说明”图标按钮。
   - **核心主视觉区**：日食微光环图形 + 主标题“一期一会，说完即散” + 副标题“匿名一对一随机匹配 · 无历史记录 · 结束即销毁”。
   - **时长选择器（Duration Segmented Control）**：四个互斥胶囊按钮：`5 分钟`、`10 分钟（默认选中）`、`20 分钟`、`30 分钟`。
   - **主行动按钮（Primary CTA）**：“进入匹配（10 分钟）”——文案随所选时长动态更新。
   - **底部诚实边界提示**：单行简明披露“同一匿名身份永不重复匹配 · 无法跨设备识别同一自然人”，点击可展开详情。
2. **交互状态与安全规则**：
   - 首次访问时，客户端通过 Supabase Anonymous Auth（或服务端签发 `HttpOnly, Secure, SameSite=Lax` 匿名会话 Cookie）静默初始化 `identity_id`，**禁止由前端生成明文 UUID 直接作为可信身份传参**。
   - 若当前身份处于被封禁状态（短期触发多次有效举报），主按钮置灰并显示冷却剩余时间。

### 页面 2：匹配页（`/match` — Server-Side Queue & Pairing）

1. **布局结构**：
   - **中心呼吸环动画**：柔和脉冲圆环，中央显示已等待秒数（如 `00:08`）。
   - **当前匹配参数胶囊**：显示 `时长：10 分钟 · 文字 + 语音`。
   - **轮播式安全微提示**：
     - “服务端正在核对历史排除列表，确保你不会遇到聊过的人…”
     - “匹配完全随机，不存在个人资料或画像推荐…”
   - **底部操作**：“取消匹配并返回”次级按钮。
2. **交互状态与安全规则**：
   - **纯服务端匹配**：客户端仅调用服务端受保护 RPC（如 `join_match_queue(preferred_duration)`）并订阅自身队列状态或房间分配通知，**严禁客户端直接查询匹配队列列表**（通过 RLS 封锁 `match_queue` 表的客户端 `SELECT` 权限，防止枚举在线用户）。
   - **双向排重与回退策略**：服务端事务在匹配池中查找相同 `duration_minutes`、且双方组合不在 `pair_exclusions` 表及 `blocks` 表中的等待者；若等待超过 20 秒无同档位候选，前端弹窗温和询问是否愿意切换至默认 `10 分钟` 池（不自动强制降级）。
   - **匹配成功瞬时动作**：一旦配对成功，服务端在同一个数据库事务内创建 `rooms` 记录（写入服务端权威时间戳 `started_at = now()` 与 `expires_at = now() + interval`），并**立即写入 `pair_exclusions` 表**（保证即使任一方在聊天第 1 秒断线，双方匿名身份也永久不再匹配）。

### 页面 3：聊天页（`/chat/[roomId]` — Ephemeral 1-on-1 Room）

1. **布局结构**：
   - **顶部固定栏（Sticky Header）**：
     - 左侧：对方临时随机代号（如 `Stranger #7C2`，仅当前房间有效，无点击交互）。
     - 中央：**权威倒计时器**（如 `09:42`）+ 进度细条。
     - 右侧：`举报/屏蔽` 图标按钮、`提前离开` 按钮。
   - **消息流主视口（Message Stream）**：
     - 顶部固定系统安全横幅：“本房间将在倒计时归零时物理销毁全部文字与语音。请勿透露真实联系方式。”
     - 支持**纯文字气泡**（单条上限 500 字符，纯文本转义防 XSS，自动识别外链为普通文本不渲染可点击超链接以防钓鱼）。
     - 支持**语音消息气泡**（显示播放/暂停按钮、动态波形条、时长如 `0:14`、播放速率 `1x`；单条上限 60 秒）。
   - **底部输入栏（Composer）**：
     - 左侧：语音/键盘切换按钮。
     - 中间：文字输入框（或语音模式下的“点击开始录音 / 录音中 0:08 / 发送前试听与取消”控制条）。
     - 右侧：发送按钮（带每 2 秒最多 1 条的客户端节流与服务端速率限制）。
2. **倒计时与异常状态处理**：
   - **不可由客户端篡改的倒计时**：客户端加载房间时获取服务端返回的 `server_now` 与 `expires_at`，计算本地时钟偏移量 `clock_offset = server_now - Date.now()`；本地每秒渲染仅作视觉平滑，真正的读写权限由数据库 RLS 策略 `now() < rooms.expires_at AND rooms.status = 'active'` 强制裁决，并在到期时由服务端广播关闭事件。
   - **最后 60 秒临别预警**：倒计时变成琥珀色（`#FBBF24`），顶部弹出非阻断横幅：“还剩最后 60 秒，倒计时结束后房间将立即关闭”。
   - **最后 15 秒锁定长录音**：倒计时变成珊瑚红（`#F87171`），若正在录音且剩余时间不足 5 秒，提示尽快发送。
   - **举报与屏蔽模态框（Report & Block Modal）**：
     - 选项：`骚扰或辱骂`、`色情或违法内容`、`垃圾广告/诈骗诱导`、`其他不适内容`。
     - **证据保留策略透明告知**：提交举报将立即终止当前对话、永久拉黑对方，并将当前房间的文本与语音文件标记为 `under_review` 移入安全隔离区（最多保留 14 天供安全核查，普通用户不可见，核查完毕后物理销毁）。

### 页面 4：告别页（`/farewell` — Dissolution & Closure）

1. **布局结构**：
   - **状态视觉**：日食环完全闭合消散的静态/微动效图标。
   - **主标题（依结束原因动态区分）**：
     - 自然到期：`10 分钟已尽，这段对话已随风消散`
     - 对方离开：`对方已先行离开，房间已关闭`
     - 主动离开：`你已结束本次对话`
     - 举报终止：`已提交举报并安全终止对话`
   - **销毁与排重确认清单（3 项绿色核验标记）**：
     - `[✓] 房间内全部文字与语音消息已从活动库清除`（若为举报终止，则显示：`[✓] 会话已冻结归档至安全审核隔离区，对双方不可见`）
     - `[✓] 语音缓存与临时签名访问链接已失效`
     - `[✓] 你们的匿名身份组合已写入永久排除列表，未来不会再次匹配`
   - **底部操作**：主按钮“开启新的相遇”（返回首页重新选择时长）；次级链接“查看安全与隐私说明”。

### 页面 5：设置与安全说明页（`/safety` — Settings, Privacy & Boundaries）

1. **布局结构**：
   - **模块 A：当前匿名身份凭证卡片**
     - 展示匿名身份掩码摘要（如 `ID: once_9f2a...4b1c`）、本地凭证生成时间、已累计永久排除的陌生人数量（仅显示数字，如 `已永久排除 12 位历史匹配对象`，不显示任何对方信息）。
     - 操作按钮：“重置匿名身份凭证”（点击弹出二次确认警告：“重置后你将获得全新匿名身份，但此前累计的**不重复匹配排除记录将随之失效**，可能会再次遇到曾经聊过的人。为防滥用，每 24 小时仅可重置一次。确认重置吗？”）。
   - **模块 B：为什么不能保证 100% 跨设备不遇到同一个人？（诚实声明卡片）**
     - 用通俗语言解释“匿名不收集手机号/身份证/设备指纹”与“跨设备排重”之间的天然矛盾，明确告知系统排重粒度为“匿名身份凭证（Identity ID）”。
   - **模块 C：数据销毁与举报证据保留政策**
     - 清晰列出正常会话（结束后立即删除消息行与 Storage 语音对象，仅保留不可逆的 `pair_exclusions(user_low_id, user_high_id)` 哈希/UUID 对）与被举报会话（冻结保留最长 14 天后销毁）的差异。
   - **模块 D：本地偏好设置**
     - 收到语音消息时自动播放开关（默认关闭，需手动点击播放以防公共场合社死）。
     - 倒计时最后 60 秒声音微提示开关（默认开启柔和提示音）。
     - 减弱界面呼吸与过渡动画（适配 `prefers-reduced-motion`）。

## 4. 可直接用于 Next.js 项目的样式与主题配置文件

将以下两个文件保存至未来的 Next.js 项目对应路径，即可直接复用本次定义的全部品牌 Token：

### 4.1 `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        once: {
          canvas: "#0B0D13",
          surface: "#121621",
          elevated: "#1A2030",
          border: "#232B3E",
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
          accent: "#818CF8",
          accentHover: "#6366F1",
          calm: "#34D399",
          warn: "#FBBF24",
          critical: "#F87171",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
```

### 4.2 `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  background-color: #0B0D13;
  color: #F3F4F6;
  font-family: "Inter", "Noto Sans SC", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* 倒计时与时间数字强制等宽，防止秒数跳动造成视觉抖动 */
.tabular-timer {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## 5. 本次交付验收清单（Day 1 Acceptance Criteria）

- [x] **品牌与克制规范完备**：明确以 `ONCE（一晤）` 为默认命名，提供完整暗色主题色板、字体层级、圆角规范及无关系链/无历史记录的反成瘾设计准则。
- [x] **五个核心页面规格闭环**：覆盖首页（时长选择 5/10/20/30 分钟）、匹配页（服务端队列与双向排重提示）、聊天页（权威倒计时、文字+语音消息、举报弹窗）、告别页（多状态销毁确认）、设置/安全页（凭证管理、证据保留策略）。
- [x] **安全与诚实边界前置**：在界面与交互层落实服务端时间校准、私有语音签名读取、举报取证例外保留，以及“匿名身份无法保证跨设备识别同一自然人”的显式披露。
- [x] **可交互原型可直接在浏览器验证**：配套产出单文件高保真交互原型 `project_once_prototype.html`，支持五页面全流程点击流转、倒计时状态切换、模拟语音录制/播放及举报流程验证。
