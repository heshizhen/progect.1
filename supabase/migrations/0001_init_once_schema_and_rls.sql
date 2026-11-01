-- ============================================================================
-- PROJECT ONCE (一晤) — Day 3 数据库 Schema、RLS 安全策略与原子匹配/销毁 RPC
-- 文件路径：supabase/migrations/0001_init_once_schema_and_rls.sql
-- 适用环境：Supabase PostgreSQL 15+
--
-- 【重要合规与技术边界声明】
-- 1. 本系统的 `identities` 表仅记录当前浏览器/设备的加密匿名凭证哈希（token_hash）。
-- 2. `pair_exclusions` 表保证同一对匿名身份（Identity ID）之间 100% 永久排除再次匹配；
--    但无注册匿名架构无法跨设备、跨浏览器、无痕窗口或清除本地凭证后识别同一自然人。
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. 匿名身份表 (public.identities)
-- 仅存储服务端 HttpOnly 匿名凭证的 SHA-256 哈希，不存储明文 Token 或任何个人隐私信息
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  masked_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  is_banned_until timestamptz
);

COMMENT ON TABLE public.identities IS
  '匿名身份凭证表：基于单设备/单浏览器加密凭证哈希，无法跨设备或重置凭证后识别同一自然人。';

-- ----------------------------------------------------------------------------
-- 2. 双向永久排除表 (public.pair_exclusions)
-- 强制约定 user_low_id < user_high_id，单行记录即可实现双向对称永久排除再次匹配
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pair_exclusions (
  user_low_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'matched' CHECK (reason IN ('matched', 'blocked', 'reported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low_id, user_high_id),
  CONSTRAINT chk_canonical_pair_order CHECK (user_low_id < user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_pair_exclusions_low ON public.pair_exclusions(user_low_id);
CREATE INDEX IF NOT EXISTS idx_pair_exclusions_high ON public.pair_exclusions(user_high_id);

COMMENT ON TABLE public.pair_exclusions IS
  '同一匿名身份对永久排除表：配对成功瞬间即写入，确保同一对匿名身份永不再次匹配。';

-- ----------------------------------------------------------------------------
-- 3. 一次性聊天房间表 (public.rooms)
-- started_at 与 expires_at 完全由服务端事务生成，客户端无法篡改倒计时
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  duration_minutes smallint NOT NULL DEFAULT 10 CHECK (duration_minutes IN (5, 10, 20, 30)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'left', 'under_review')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_reason text CHECK (ended_reason IS NULL OR ended_reason IN ('timeout', 'self_left', 'partner_left', 'reported')),
  evidence_retain_until timestamptz,
  CONSTRAINT chk_distinct_room_users CHECK (user_a_id <> user_b_id),
  CONSTRAINT chk_valid_room_expiry CHECK (expires_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_rooms_active_expiry ON public.rooms(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_rooms_user_a ON public.rooms(user_a_id);
CREATE INDEX IF NOT EXISTS idx_rooms_user_b ON public.rooms(user_b_id);

-- ----------------------------------------------------------------------------
-- 4. 服务端随机匹配等待池 (public.match_queue)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.match_queue (
  identity_id uuid PRIMARY KEY REFERENCES public.identities(id) ON DELETE CASCADE,
  duration_minutes smallint NOT NULL DEFAULT 10 CHECK (duration_minutes IN (5, 10, 20, 30)),
  joined_at timestamptz NOT NULL DEFAULT now(),
  matched_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_match_queue_pool
  ON public.match_queue(duration_minutes, joined_at)
  WHERE matched_room_id IS NULL;

-- ----------------------------------------------------------------------------
-- 5. 房间临时消息表 (public.messages)
-- 正常结束立即物理删除；触发举报时随房间冻结为 under_review 供安全核查
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  msg_type text NOT NULL CHECK (msg_type IN ('text', 'voice')),
  content text CHECK (content IS NULL OR (char_length(content) >= 1 AND char_length(content) <= 500)),
  voice_storage_path text,
  voice_duration_sec smallint CHECK (voice_duration_sec IS NULL OR (voice_duration_sec >= 1 AND voice_duration_sec <= 60)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_msg_payload CHECK (
    (msg_type = 'text' AND content IS NOT NULL AND voice_storage_path IS NULL) OR
    (msg_type = 'voice' AND voice_storage_path IS NOT NULL AND voice_duration_sec IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON public.messages(room_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 6. 违规举报与取证保留表 (public.reports)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.identities(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('harassment', 'illegal_or_nsfw', 'spam_or_scam', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  retain_until timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS idx_reports_retain_until ON public.reports(retain_until);

-- ============================================================================
-- 7. 严格行级安全策略 (Row Level Security - RLS)
-- 默认拒绝客户端直接读写敏感表，所有核心状态流转均通过服务端受控函数执行
-- ============================================================================

ALTER TABLE public.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.pair_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pair_exclusions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;

ALTER TABLE public.match_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_queue FORCE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports FORCE ROW LEVEL SECURITY;

-- 辅助函数：从当前数据库会话上下文读取已验证的 identity_id
CREATE OR REPLACE FUNCTION public.current_once_identity_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_identity_id', true), '')::uuid;
$$;

-- rooms 表策略：仅房间参与者本人、且房间处于 active 且未超过服务端 expires_at 时可读
DROP POLICY IF EXISTS policy_rooms_select_participant ON public.rooms;
CREATE POLICY policy_rooms_select_participant
  ON public.rooms
  FOR SELECT
  USING (
    (user_a_id = public.current_once_identity_id() OR user_b_id = public.current_once_identity_id())
    AND status = 'active'
    AND now() < expires_at
  );

-- messages 表策略：仅房间参与者、且所属房间仍处于有效倒计时内可读写消息（到期或被举报冻结后立即不可读）
DROP POLICY IF EXISTS policy_messages_select_active_room ON public.messages;
CREATE POLICY policy_messages_select_active_room
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = messages.room_id
        AND (r.user_a_id = public.current_once_identity_id() OR r.user_b_id = public.current_once_identity_id())
        AND r.status = 'active'
        AND now() < r.expires_at
    )
  );

DROP POLICY IF EXISTS policy_messages_insert_active_room ON public.messages;
CREATE POLICY policy_messages_insert_active_room
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = public.current_once_identity_id()
    AND EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = messages.room_id
        AND (r.user_a_id = public.current_once_identity_id() OR r.user_b_id = public.current_once_identity_id())
        AND r.status = 'active'
        AND now() < r.expires_at
    )
  );

-- ============================================================================
-- 8. 服务端核心原子函数 (RPCs)
-- ============================================================================

-- 8.1 原子入队与随机匹配函数 (FOR UPDATE SKIP LOCKED + 永久排除校验)
CREATE OR REPLACE FUNCTION public.rpc_match_or_enqueue(
  p_token_hash text,
  p_masked_id text,
  p_duration smallint DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me_id uuid;
  v_banned_until timestamptz;
  v_existing_room_id uuid;
  v_partner_id uuid;
  v_room_id uuid;
  v_started_at timestamptz := now();
  v_expires_at timestamptz;
BEGIN
  IF p_duration NOT IN (5, 10, 20, 30) THEN
    RAISE EXCEPTION 'INVALID_DURATION: duration must be 5, 10, 20, or 30';
  END IF;

  -- 1. 获取或注册当前匿名身份
  INSERT INTO public.identities (token_hash, masked_id, last_active_at)
  VALUES (p_token_hash, p_masked_id, now())
  ON CONFLICT (token_hash)
  DO UPDATE SET last_active_at = now()
  RETURNING id, is_banned_until INTO v_me_id, v_banned_until;

  IF v_banned_until IS NOT NULL AND v_banned_until > now() THEN
    RETURN jsonb_build_object(
      'status', 'banned',
      'banned_until', v_banned_until,
      'server_now', now()
    );
  END IF;

  -- 2. 检查是否已被其他并发请求配对成功
  SELECT mq.matched_room_id INTO v_existing_room_id
  FROM public.match_queue mq
  WHERE mq.identity_id = v_me_id
    AND mq.matched_room_id IS NOT NULL;

  IF v_existing_room_id IS NOT NULL THEN
    DELETE FROM public.match_queue WHERE identity_id = v_me_id;
    SELECT r.started_at, r.expires_at, r.duration_minutes
      INTO v_started_at, v_expires_at, p_duration
      FROM public.rooms r WHERE r.id = v_existing_room_id;

    RETURN jsonb_build_object(
      'status', 'matched',
      'room_id', v_existing_room_id,
      'started_at', v_started_at,
      'expires_at', v_expires_at,
      'server_now', now(),
      'duration_minutes', p_duration
    );
  END IF;

  -- 3. 清理超过 45 秒未活动且未配对的陈旧队列记录
  DELETE FROM public.match_queue
  WHERE matched_room_id IS NULL
    AND joined_at < (now() - interval '45 seconds')
    AND identity_id <> v_me_id;

  -- 4. 使用 FOR UPDATE SKIP LOCKED 寻找同档位且不在 pair_exclusions 中的等待者
  SELECT mq.identity_id INTO v_partner_id
  FROM public.match_queue mq
  WHERE mq.duration_minutes = p_duration
    AND mq.identity_id <> v_me_id
    AND mq.matched_room_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.pair_exclusions pe
      WHERE pe.user_low_id = LEAST(v_me_id, mq.identity_id)
        AND pe.user_high_id = GREATEST(v_me_id, mq.identity_id)
    )
  ORDER BY mq.joined_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- 5. 若找到合格候选人：原子创建房间 + 立即写入永久排除表
  IF v_partner_id IS NOT NULL THEN
    v_expires_at := v_started_at + make_interval(mins => p_duration);

    INSERT INTO public.rooms (
      user_a_id,
      user_b_id,
      duration_minutes,
      status,
      started_at,
      expires_at
    ) VALUES (
      v_partner_id,
      v_me_id,
      p_duration,
      'active',
      v_started_at,
      v_expires_at
    )
    RETURNING id INTO v_room_id;

    -- 立即写入双向永久排除表（即使 1 秒后断线也永不再遇）
    INSERT INTO public.pair_exclusions (user_low_id, user_high_id, reason)
    VALUES (LEAST(v_me_id, v_partner_id), GREATEST(v_me_id, v_partner_id), 'matched')
    ON CONFLICT (user_low_id, user_high_id) DO NOTHING;

    -- 通知对方已匹配到该房间，并移除当前请求者的排队行
    UPDATE public.match_queue
    SET matched_room_id = v_room_id
    WHERE identity_id = v_partner_id;

    DELETE FROM public.match_queue WHERE identity_id = v_me_id;

    RETURN jsonb_build_object(
      'status', 'matched',
      'room_id', v_room_id,
      'started_at', v_started_at,
      'expires_at', v_expires_at,
      'server_now', now(),
      'duration_minutes', p_duration
    );
  END IF;

  -- 6. 若暂无候选人：将自己加入或刷新到等待池
  INSERT INTO public.match_queue (identity_id, duration_minutes, joined_at, matched_room_id)
  VALUES (v_me_id, p_duration, now(), NULL)
  ON CONFLICT (identity_id)
  DO UPDATE SET
    duration_minutes = EXCLUDED.duration_minutes,
    joined_at = now(),
    matched_room_id = NULL;

  RETURN jsonb_build_object(
    'status', 'waiting',
    'server_now', now(),
    'duration_minutes', p_duration
  );
END;
$$;

-- 8.2 正常结束/离开房间并立即物理销毁消息函数
CREATE OR REPLACE FUNCTION public.rpc_end_or_cleanup_room(
  p_room_id uuid,
  p_token_hash text,
  p_reason text DEFAULT 'self_left'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me_id uuid;
  v_room record;
  v_voice_paths text[];
BEGIN
  SELECT id INTO v_me_id FROM public.identities WHERE token_hash = p_token_hash;
  IF v_me_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_IDENTITY';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  IF v_room.user_a_id <> v_me_id AND v_room.user_b_id <> v_me_id THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_PARTICIPANT';
  END IF;

  -- 若房间已被举报冻结，禁止普通离开操作抹除证据
  IF v_room.status = 'under_review' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'under_review',
      'voice_paths_to_delete', ARRAY[]::text[]
    );
  END IF;

  -- 收集需从私有 Storage 桶物理删除的语音文件路径
  SELECT COALESCE(array_agg(voice_storage_path), ARRAY[]::text[])
  INTO v_voice_paths
  FROM public.messages
  WHERE room_id = p_room_id AND voice_storage_path IS NOT NULL;

  -- 立即物理删除房间内全部文字与语音消息行
  DELETE FROM public.messages WHERE room_id = p_room_id;

  UPDATE public.rooms
  SET
    status = CASE WHEN p_reason = 'timeout' THEN 'expired' ELSE 'left' END,
    ended_at = COALESCE(ended_at, now()),
    ended_reason = COALESCE(ended_reason, p_reason)
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'dissolved',
    'voice_paths_to_delete', v_voice_paths,
    'server_now', now()
  );
END;
$$;

-- 8.3 举报违规并加密冻结房间证据函数（保留最长 14 天供安全核查）
CREATE OR REPLACE FUNCTION public.rpc_report_and_freeze_room(
  p_room_id uuid,
  p_token_hash text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me_id uuid;
  v_partner_id uuid;
  v_room record;
  v_retain_until timestamptz := now() + interval '14 days';
BEGIN
  IF p_category NOT IN ('harassment', 'illegal_or_nsfw', 'spam_or_scam', 'other') THEN
    RAISE EXCEPTION 'INVALID_REPORT_CATEGORY';
  END IF;

  SELECT id INTO v_me_id FROM public.identities WHERE token_hash = p_token_hash;
  IF v_me_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_IDENTITY';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF v_room.user_a_id = v_me_id THEN
    v_partner_id := v_room.user_b_id;
  ELSIF v_room.user_b_id = v_me_id THEN
    v_partner_id := v_room.user_a_id;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN_NOT_PARTICIPANT';
  END IF;

  -- 1. 写入举报记录
  INSERT INTO public.reports (room_id, reporter_id, reported_id, category, retain_until)
  VALUES (p_room_id, v_me_id, v_partner_id, p_category, v_retain_until);

  -- 2. 将房间状态标记为 under_review（RLS 立即阻断双方继续读写，同时保留消息备查）
  UPDATE public.rooms
  SET
    status = 'under_review',
    ended_at = COALESCE(ended_at, now()),
    ended_reason = 'reported',
    evidence_retain_until = v_retain_until
  WHERE id = p_room_id;

  -- 3. 升级永久排除原因为 reported
  INSERT INTO public.pair_exclusions (user_low_id, user_high_id, reason)
  VALUES (LEAST(v_me_id, v_partner_id), GREATEST(v_me_id, v_partner_id), 'reported')
  ON CONFLICT (user_low_id, user_high_id)
  DO UPDATE SET reason = 'reported';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'under_review',
    'retain_until', v_retain_until,
    'server_now', now()
  );
END;
$$;

-- 8.4 定时清理到期房间与期满举报证据函数（供 pg_cron 或服务端定时任务调用）
CREATE OR REPLACE FUNCTION public.rpc_purge_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_rooms_count integer;
  v_purged_reports_count integer;
BEGIN
  -- 1. 将所有已过期的 active 房间标记为 expired 并清空其消息
  DELETE FROM public.messages m
  USING public.rooms r
  WHERE m.room_id = r.id
    AND r.status <> 'under_review'
    AND now() >= r.expires_at;

  WITH updated AS (
    UPDATE public.rooms
    SET status = 'expired', ended_at = COALESCE(ended_at, now()), ended_reason = COALESCE(ended_reason, 'timeout')
    WHERE status = 'active' AND now() >= expires_at
    RETURNING 1
  )
  SELECT count(*) INTO v_expired_rooms_count FROM updated;

  -- 2. 清理已满 14 天取证保留期的 under_review 房间消息与举报记录
  DELETE FROM public.messages m
  USING public.rooms r
  WHERE m.room_id = r.id
    AND r.status = 'under_review'
    AND r.evidence_retain_until IS NOT NULL
    AND now() >= r.evidence_retain_until;

  WITH del_reports AS (
    DELETE FROM public.reports
    WHERE now() >= retain_until
    RETURNING 1
  )
  SELECT count(*) INTO v_purged_reports_count FROM del_reports;

  RETURN jsonb_build_object(
    'expired_rooms_closed', v_expired_rooms_count,
    'expired_reports_purged', v_purged_reports_count,
    'executed_at', now()
  );
END;
$$;

COMMIT;
