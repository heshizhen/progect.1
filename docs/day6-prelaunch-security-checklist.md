# PROJECT ONCE（一晤）— Day 6 上线前安全与合规总检查清单（Pre-Launch Audit）

> 适用架构：甲骨文云永久免费服务器（Oracle Cloud Always Free）+ Cloudflare（DNS / 免费 HTTPS / CDN 防护）+ Next.js 全栈服务 + 本机/容器内 MySQL 8.0 + 服务端私有语音存储（`.private_storage/voice`）

## 1. 核心安全机制逐项核验表

| 检查域 | 检查项 | 落地实现文件 | 验收标准与状态 |
| :--- | :--- | :--- | :--- |
| **匿名身份与凭证保护** | 真实身份凭证防脚本窃取与防客户端伪造 | `src/middleware.ts`<br>`src/lib/db/store.ts` | `once_anon_token` 强制开启 `HttpOnly; SameSite=Lax`（生产环境开启 `Secure`）；服务端使用 `ONCE_IDENTITY_HMAC_SECRET` 计算 HMAC-SHA256 后入库，数据库不存明文 Cookie。 **[已通过 ✓]** |
| **防重诚实边界披露** | 明确声明匿名凭证无法跨设备识别同一自然人 | `src/app/page.tsx`<br>`src/app/safety/page.tsx`<br>`README.md` | 首页底部与设置/安全页置顶显著告知：“系统保证同一匿名身份之间永久不会再次匹配；但无注册机制无法跨设备、跨浏览器、无痕窗口或清除数据后识别同一自然人”。 **[已通过 ✓]** |
| **服务端原子匹配与永久排重** | 杜绝客户端枚举队列与重复匹配 | `src/lib/db/store.ts`<br>`mysql/0001_init_once_mysql.sql` | 匹配在服务端 MySQL 事务（`FOR UPDATE`）中执行；配对成功同事务按字典序写入 `pair_exclusions(user_low_id, user_high_id)`，即便 1 秒后断线也永久排除再次匹配。 **[已通过 ✓]** |
| **防重置绕过屏蔽** | 匿名凭证重置冷却限制 | `src/app/api/identity/reset/route.ts` | 服务端强制校验 `once_last_reset_ts`，每 24 小时仅允许重置 1 次匿名身份，超限返回 `429 Too Many Requests`。 **[已通过 ✓]** |
| **权威倒计时防篡改** | 禁止客户端改本地系统时间延长聊天 | `src/app/api/rooms/[roomId]/sync/route.ts` | 房间 `expires_at` 由服务端创建时写入；每次消息发送、语音读取与状态同步均以服务端当前时间裁决，到期立即拒绝写入并清空消息。 **[已通过 ✓]** |
| **文字安全与防刷屏** | 防 XSS、防钓鱼外链、防高频洪泛 | `src/lib/db/store.ts` | 单条文字限 500 字；自动将 `http://` 与 `https://` 链接替换为 `[外链已屏蔽]`；服务端强制执行同一发送者 1.2 秒最小发送间隔。 **[已通过 ✓]** |
| **私有语音访问控制** | 杜绝公开桶枚举与 CDN 缓存泄露 | `src/lib/storage/voiceStorage.ts`<br>`src/app/api/rooms/[roomId]/voice/[messageId]/route.ts` | 语音存入非公开目录 `.private_storage/voice/`；读取时三重校验（HMAC 签名有效 + 请求者属房间参与者 + 房间仍为 `active`）；响应头下发 `Cache-Control: no-store, private`。 **[已通过 ✓]** |
| **双轨数据销毁与证据保留** | 正常结束即时物理删除 vs. 举报冻结保留 14 天 | `src/lib/db/store.ts`<br>`src/app/api/cron/purge/route.ts` | 正常到期/离开立即 `DELETE FROM messages` 并 `fs.rm` 删除磁盘语音；触发举报则置为 `under_review`（双方不可读，保留最长 14 天后由清理任务物理销毁）。 **[已通过 ✓]** |

## 2. 甲骨文云 + Cloudflare 上线前配置核对清单

1. **环境变量安全（`.env.local` 或 `docker-compose.yml`）**
   - [ ] 已将 `ONCE_IDENTITY_HMAC_SECRET` 替换为至少 32 位的高强度随机字符串（可通过 `openssl rand -hex 32` 生成）。
   - [ ] 已修改 MySQL 默认密码，且确认甲骨文云安全列表（Security List）与系统防火墙**未向公网开放 3306 端口**。
2. **Cloudflare 侧安全配置**
   - [ ] 域名 DNS `A` 记录已开启 **Proxy（橙色小黄云）**，隐藏甲骨文云服务器真实源站 IP。
   - [ ] **SSL/TLS -> Edge Certificates** 已开启 **Always Use HTTPS**（确保用户在公网访问时浏览器允许调用 `MediaRecorder` 麦克风权限）。
   - [ ] （推荐）在 Cloudflare **Security -> WAF -> Rate limiting rules** 添加一条免费规则：当单 IP 访问 `/api/*` 超过每分钟 120 次时触发阻断，进一步防御恶意脚本刷接口。
3. **后台自动清理保障**
   - [ ] 系统已内置“请求捎带节流清理（每 30 秒自动扫描一次过期房间与满 14 天举报记录）”。
   - [ ] （可选加固）在甲骨文云服务器添加一条系统 `crontab` 定时调用 `POST /api/cron/purge`，确保凌晨零访问时段也能准时物理销毁到期数据：
     ```bash
     */5 * * * * curl -s -X POST http://127.0.0.1:3000/api/cron/purge -H "Authorization: Bearer 你的ONCE_IDENTITY_HMAC_SECRET" >/dev/null 2>&1
     ```

## 3. 自动化验收脚本执行方法

在本地或甲骨文云服务器上启动服务（`npm run dev` 或 `npm run start`）后，打开另一个终端窗口运行：

```bash
npm run verify:security
```

该脚本会自动模拟三名独立匿名用户（User A、User B、User C），端到端验证：
1. `HttpOnly` 匿名凭证自动签发；
2. User A 与 User B 在 10 分钟池原子配对成功；
3. 文字消息收发与钓鱼外链自动屏蔽（`[外链已屏蔽]`）；
4. 真实二进制语音上传、HMAC 签名链接读取、篡改签名拦截（`403`）与非房间成员越权拦截（`410`）；
5. 离开房间后文字与磁盘语音立即物理销毁（原签名链接立即失效返回 `410`）；
6. User A 与 User B 再次进入 10 分钟池时被 `pair_exclusions` 永久排除（保持 `waiting`），而新用户 User C 入队后可立即与 User A 配对成功；
7. 匿名身份重置接口 24 小时冷却限制（连续第二次调用返回 `429`）。
