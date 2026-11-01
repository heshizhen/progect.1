# PROJECT ONCE（一晤）

> 仓库地址：[https://github.com/heshizhen/progect.1](https://github.com/heshizhen/progect.1)  
> 一次性陌生人社交 Web MVP：匿名、无需注册、随机一对一匹配、文字 + 语音消息、默认 10 分钟（可选 5/10/20/30 分钟）、聊天结束即销毁、同一匿名身份之间永久排除再次匹配。  
> **生产架构**：甲骨文云永久免费服务器（Oracle Cloud Always Free）+ Cloudflare（DNS / 免费 HTTPS）+ MySQL + 服务端私有语音存储。

## 1. 核心安全与诚实边界

- **非跨设备自然人排重声明**：系统通过服务端 `HttpOnly` 签名匿名凭证（及 HMAC-SHA256 哈希）确保**同一匿名身份（Identity ID）之间永久不会再次匹配**；但受限于无注册机制，系统无法在更换设备、切换浏览器、无痕模式或清除本地凭证后识别同一自然人，不承诺跨设备的绝对排重。
- **服务端权威控制**：匹配事务、倒计时截止时间（`expires_at`）、双向永久排重（`pair_exclusions`）与权限校验全部在服务端强制执行，客户端篡改系统时钟无效。
- **私有语音受控访问与物理销毁**：语音文件保存在服务端非公开目录 `.private_storage/voice/`，仅可通过带有效期（`exp ≤ expires_at`）的 HMAC 签名链接且验证房间参与者身份后流式读取（附带 `Cache-Control: no-store` 防缓存）；正常结束时立即从数据库与磁盘物理删除。

## 2. 快速运行与自动化安全验收

```bash
# 1. （可选）导入本机 MySQL 表结构；若未配置 MySQL 密码则自动启用服务端内存引擎
mysql -u root -p < mysql/0001_init_once_mysql.sql

# 2. 安装依赖并启动开发服务器
npm install
cp .env.example .env.local
npm run dev

# 3. 在另一个终端运行端到端安全与业务闭环自动化验收脚本
npm run verify:security
```

## 3. 研发里程碑进度（MVP 全部 6 个阶段已交付完成 ✓）

- [x] **Milestone 1 (Day 1)**：产品命名与品牌规范、五个核心页面（首页、匹配、聊天、告别、设置/安全）交互规格与高保真原型（`docs/day1-brand-and-ui-spec.md`、`prototype/index.html`）
- [x] **Milestone 2 (Day 2)**：Next.js + TypeScript + Tailwind CSS 可运行项目脚手架、五页面路由组件与服务端 `HttpOnly` 匿名凭证中间件（`src/middleware.ts`）
- [x] **Milestone 3 (Day 3)**：数据库 Schema SQL（`mysql/0001_init_once_mysql.sql`）、`pair_exclusions` 双向永久排除表与原子匹配事务
- [x] **Milestone 4 (Day 4)**：本地 MySQL 驱动接入（`src/lib/db/store.ts`）、服务端权威倒计时同步 API 与双人实时聊天/防刷屏/外链屏蔽联调
- [x] **Milestone 5 (Day 5)**：语音消息真实二进制上传、服务端私有目录存储（`.private_storage/voice`）、HMAC 短期签名流式读取、房间关闭物理删除语音文件 + 甲骨文云 & Cloudflare 零成本部署配置（`docs/oracle-cloudflare-deploy.md`）
- [x] **Milestone 6 (Day 6)**：后台到期自动清理任务（`POST /api/cron/purge` + 30 秒自动捎带清理）、端到端自动化安全验收脚本（`scripts/verify_mvp_security.mjs`）与上线前安全合规总检查清单（`docs/day6-prelaunch-security-checklist.md`）
