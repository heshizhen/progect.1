# PROJECT ONCE — 甲骨文云免费实例（Oracle Cloud Always Free）+ Cloudflare + MySQL 零成本部署指南

针对你现有的 **甲骨文云免费服务器 + Cloudflare 托管域名 + MySQL**，本方案实现 **$0 零月费**、**MySQL 零公网暴露**、**私有语音磁盘存储秒级销毁**以及 **Cloudflare 自动 HTTPS（保障浏览器麦克风录音权限）**。

## 1. 架构拓扑与安全优势

```
用户浏览器 (HTTPS + 麦克风权限)
      │
      ▼
Cloudflare (开启小黄云 Proxy + 免费 SSL/HTTPS + 防 DDoS)
      │
      ▼
甲骨文云免费服务器 (Oracle Cloud Always Free VPS)
  ├─ Next.js 服务 (once-web)
  ├─ 私有语音存储目录 (.private_storage/voice/，非公开，仅 HMAC 短期签名可读，结束即 rm)
  └─ 本机/容器内 MySQL 8.0 (仅内部网络可达，严禁向公网开放 3306 端口)
```

## 2. Cloudflare 配置要点（3 步）

1. **DNS 解析**：在 Cloudflare 添加一条 `A` 记录（如 `@` 或 `once`），指向你甲骨文云服务器的公网 IP，并开启 **Proxy status（已代理 / 橙色小黄云）**。
2. **开启 HTTPS（麦克风录音必选）**：现代浏览器规定 `navigator.mediaDevices.getUserMedia`（语音录制）在非 `localhost` 环境下**必须走 HTTPS**。在 Cloudflare **SSL/TLS -> Overview** 中选择 `Flexible`（若甲骨文云直接跑 80 端口转发 3000）或使用 Cloudflare Origin Certificate 配置 `Full (Strict)`。
3. **禁止缓存动态 API**：语音流接口（`/api/rooms/*/voice/*`）与同步接口（`/api/rooms/*/sync`）已自动下发 `Cache-Control: no-store, private` 响应头，Cloudflare 默认不会缓存任何私人聊天或语音数据。

## 3. 甲骨文云服务器一键启动步骤

### 方式 A：使用服务器自带的本机 MySQL 直接运行

```bash
# 1. 拉取你的 GitHub 仓库
git clone https://github.com/heshizhen/progect.1.git
cd progect.1

# 2. 导入 MySQL 表结构
mysql -u root -p < mysql/0001_init_once_mysql.sql

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入本机 MYSQL_URL 与随机生成的 32 位 ONCE_IDENTITY_HMAC_SECRET

# 4. 构建并启动生产服务
npm install
npm run build
npm run start
```

### 方式 B：使用 Docker Compose 一键启动（自动初始化 MySQL 8.0 + Next.js）

```bash
git clone https://github.com/heshizhen/progect.1.git
cd progect.1
ONCE_IDENTITY_HMAC_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```
