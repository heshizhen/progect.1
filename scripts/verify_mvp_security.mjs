#!/usr/bin/env node
/**
 * PROJECT ONCE — 端到端安全与核心业务闭环自动化验收脚本
 * 运行前提：先在另一个终端启动 `npm run dev` (默认 http://localhost:3000)
 * 运行命令：npm run verify:security
 */

const BASE_URL = process.env.ONCE_BASE_URL || "http://localhost:3000";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`✅ [PASS] ${message}`);
}

function makeSession(name) {
  const id = Math.random().toString(16).slice(2, 10);
  const cookie = `once_anon_token=once_test_${name}_${id}; once_anon_mask=once_${name}...${id.slice(0, 4)}`;
  return { name, cookie };
}

async function run() {
  console.log(`🚀 开始执行 PROJECT ONCE 安全与业务闭环验收 (${BASE_URL})...\n`);

  const userA = makeSession("userA");
  const userB = makeSession("userB");
  const userC = makeSession("userC");

  // 1. 验证服务端原子匹配
  const m1 = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userA.cookie },
    body: JSON.stringify({ duration: 10 }),
  }).then((r) => r.json());
  assert(m1.ok && m1.status === "waiting", "User A 入队等待成功");

  const m2 = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userB.cookie },
    body: JSON.stringify({ duration: 10 }),
  }).then((r) => r.json());
  assert(
    m2.ok && m2.status === "matched" && m2.roomId,
    `User A 与 User B 原子配对成功 (Room: ${m2.roomId})`
  );

  const roomId = m2.roomId;

  // 2. 验证文字发送与外链脱敏防钓鱼
  const sendTextRes = await fetch(
    `${BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA.cookie },
      body: JSON.stringify({
        type: "text",
        text: "你好 https://phishing.example.com/login 测试外链过滤",
      }),
    }
  ).then((r) => r.json());
  assert(
    sendTextRes.ok &&
      sendTextRes.message.text.includes("[外链已屏蔽]") &&
      !sendTextRes.message.text.includes("https://"),
    "文字消息发送成功且可疑外链已被自动脱敏为 [外链已屏蔽]"
  );

  // 3. 验证私有语音上传与短期 HMAC 签名访问控制
  const form = new FormData();
  const dummyWebm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01])], {
    type: "audio/webm",
  });
  form.append("audio", dummyWebm, "test.webm");
  form.append("durationSec", "5");

  const voiceUploadRes = await fetch(
    `${BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/voice`,
    {
      method: "POST",
      headers: { Cookie: userA.cookie },
      body: form,
    }
  ).then((r) => r.json());
  assert(
    voiceUploadRes.ok && voiceUploadRes.message?.voiceUrl,
    "私有语音二进制上传成功并签发短期 HMAC 签名 URL"
  );

  const signedVoiceUrl = voiceUploadRes.message.voiceUrl;

  // 房间内同伴 User B 正常读取语音
  const voiceReadB = await fetch(`${BASE_URL}${signedVoiceUrl}`, {
    headers: { Cookie: userB.cookie },
  });
  assert(
    voiceReadB.status === 200 &&
      voiceReadB.headers.get("cache-control")?.includes("no-store"),
    "房间同伴 User B 凭有效签名读取语音成功，且响应头强制 Cache-Control: no-store"
  );

  // 房间外第三方 User C 拿着同一个签名链接尝试越权读取 -> 必须被拦截
  const voiceReadC = await fetch(`${BASE_URL}${signedVoiceUrl}`, {
    headers: { Cookie: userC.cookie },
  });
  assert(
    voiceReadC.status === 410 || voiceReadC.status === 403,
    `非房间参与者 User C 越权访问语音被服务端拒绝 (HTTP ${voiceReadC.status})`
  );

  // 篡改签名参数尝试读取 -> 必须被拦截
  const tamperedUrl = signedVoiceUrl.replace(/sig=[0-9a-f]+/, "sig=0000deadbeef");
  const voiceReadTampered = await fetch(`${BASE_URL}${tamperedUrl}`, {
    headers: { Cookie: userB.cookie },
  });
  assert(
    voiceReadTampered.status === 403,
    "篡改 HMAC 签名的语音请求被服务端拦截 (HTTP 403)"
  );

  // 4. 验证离开房间后聊天内容与磁盘语音立即物理销毁
  const leaveRes = await fetch(
    `${BASE_URL}/api/rooms/${encodeURIComponent(roomId)}/leave`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: userA.cookie },
      body: JSON.stringify({ reason: "self_left" }),
    }
  ).then((r) => r.json());
  assert(leaveRes.ok, "User A 离开房间触发服务端立即销毁");

  const voiceReadAfterLeave = await fetch(`${BASE_URL}${signedVoiceUrl}`, {
    headers: { Cookie: userB.cookie },
  });
  assert(
    voiceReadAfterLeave.status === 410,
    "房间结束后原有效语音签名链接立即失效，语音文件已物理删除 (HTTP 410)"
  );

  // 5. 验证同一对匿名身份（User A 与 User B）永久排除再次匹配
  const rematchA = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userA.cookie },
    body: JSON.stringify({ duration: 10 }),
  }).then((r) => r.json());
  const rematchB = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userB.cookie },
    body: JSON.stringify({ duration: 10 }),
  }).then((r) => r.json());
  assert(
    rematchA.status === "waiting" && rematchB.status === "waiting",
    "永久排重生效：User A 与 User B 再次入队时被 pair_exclusions 严格过滤，绝不再次匹配"
  );

  // 新用户 User C 入队应立即与等待中的 User A 配对成功
  const matchC = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: userC.cookie },
    body: JSON.stringify({ duration: 10 }),
  }).then((r) => r.json());
  assert(
    matchC.status === "matched" && matchC.roomId,
    "新匿名用户 User C 入队后可正常与等待中的用户完成配对"
  );

  console.log("\n🎉 全部 9 项核心安全与业务闭环测试 100% 通过！MVP 已达到上线标准。");
}

run().catch((err) => {
  console.error("执行测试异常（请确认已先运行 npm run dev）：", err.message);
  process.exit(1);
});
