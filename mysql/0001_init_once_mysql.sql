-- ============================================================================
-- PROJECT ONCE (一晤) — 本地 MySQL 数据库建表脚本 (适配 MySQL 5.7 / 8.0+)
-- 文件路径：mysql/0001_init_once_mysql.sql
--
-- 使用方法（在终端或 Navicat / DBeaver / MySQL Workbench 中执行）：
--   mysql -u root -p < mysql/0001_init_once_mysql.sql
--
-- 【重要安全与诚实边界说明】
-- 1. identities 表仅保存服务端 HttpOnly 匿名凭证的 HMAC-SHA256 哈希（64 位十六进制）。
-- 2. pair_exclusions 表确保同一对匿名身份（Identity ID）之间 100% 永久排除再次匹配；
--    但无注册匿名架构无法跨设备、跨浏览器、无痕窗口或清除本地凭证后识别同一自然人。
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `project_once`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `project_once`;

-- ----------------------------------------------------------------------------
-- 1. 匿名身份表 (identities)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `identities` (
  `id` VARCHAR(36) NOT NULL COMMENT '匿名身份 UUID',
  `token_hash` CHAR(64) NOT NULL COMMENT 'HttpOnly 匿名凭证的 HMAC-SHA256 哈希',
  `masked_id` VARCHAR(32) NOT NULL COMMENT '前端展示用不可逆掩码，如 once_8f3a...c91e',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_active_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_banned_until` DATETIME(3) NULL DEFAULT NULL COMMENT '违规封禁截止时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_identities_token_hash` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='匿名身份表：基于单浏览器加密凭证，无法跨设备识别同一自然人';

-- ----------------------------------------------------------------------------
-- 2. 双向永久排除表 (pair_exclusions)
-- 约定写入时始终按字典序保证 user_low_id < user_high_id，实现双向永久排除再次匹配
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pair_exclusions` (
  `user_low_id` VARCHAR(36) NOT NULL COMMENT '字典序较小的 identity_id',
  `user_high_id` VARCHAR(36) NOT NULL COMMENT '字典序较大的 identity_id',
  `reason` VARCHAR(16) NOT NULL DEFAULT 'matched' COMMENT 'matched | blocked | reported',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_low_id`, `user_high_id`),
  KEY `idx_pair_exclusions_high` (`user_high_id`),
  CONSTRAINT `fk_pe_low` FOREIGN KEY (`user_low_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pe_high` FOREIGN KEY (`user_high_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='同一匿名身份对永久排除表：配对成功瞬间即写入，永不再次匹配';

-- ----------------------------------------------------------------------------
-- 3. 一次性聊天房间表 (rooms)
-- started_at 与 expires_at 由服务端生成，客户端修改系统时钟无法延长倒计时
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` VARCHAR(36) NOT NULL COMMENT '房间 UUID',
  `user_a_id` VARCHAR(36) NOT NULL,
  `user_b_id` VARCHAR(36) NOT NULL,
  `duration_minutes` SMALLINT NOT NULL DEFAULT 10 COMMENT '5 | 10 | 20 | 30',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active | expired | left | under_review',
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL COMMENT '服务端权威到期时间',
  `ended_at` DATETIME(3) NULL DEFAULT NULL,
  `ended_reason` VARCHAR(16) NULL DEFAULT NULL COMMENT 'timeout | self_left | partner_left | reported',
  `evidence_retain_until` DATETIME(3) NULL DEFAULT NULL COMMENT '举报取证保留截止时间（最长 14 天）',
  PRIMARY KEY (`id`),
  KEY `idx_rooms_status_expires` (`status`, `expires_at`),
  KEY `idx_rooms_user_a` (`user_a_id`),
  KEY `idx_rooms_user_b` (`user_b_id`),
  CONSTRAINT `fk_rooms_user_a` FOREIGN KEY (`user_a_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rooms_user_b` FOREIGN KEY (`user_b_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='一次性聊天房间表';

-- ----------------------------------------------------------------------------
-- 4. 服务端随机匹配等待池 (match_queue)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `match_queue` (
  `identity_id` VARCHAR(36) NOT NULL,
  `duration_minutes` SMALLINT NOT NULL DEFAULT 10,
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `matched_room_id` VARCHAR(36) NULL DEFAULT NULL,
  PRIMARY KEY (`identity_id`),
  KEY `idx_match_queue_pool` (`duration_minutes`, `joined_at`),
  CONSTRAINT `fk_mq_identity` FOREIGN KEY (`identity_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='服务端匹配等待队列';

-- ----------------------------------------------------------------------------
-- 5. 房间临时消息表 (messages)
-- 正常结束立即物理 DELETE；触发举报时随房间冻结为 under_review 供安全核查
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(36) NOT NULL,
  `room_id` VARCHAR(36) NOT NULL,
  `sender_id` VARCHAR(36) NOT NULL,
  `msg_type` VARCHAR(10) NOT NULL DEFAULT 'text' COMMENT 'text | voice',
  `content` VARCHAR(500) NULL DEFAULT NULL COMMENT '纯文本消息内容（上限 500 字）',
  `voice_storage_path` VARCHAR(255) NULL DEFAULT NULL COMMENT '私有语音文件存储路径',
  `voice_duration_sec` SMALLINT NULL DEFAULT NULL COMMENT '语音秒数（1-60 秒）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_messages_room_created` (`room_id`, `created_at`),
  CONSTRAINT `fk_msg_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `identities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='临时聊天消息表：正常结束即刻物理删除';

-- ----------------------------------------------------------------------------
-- 6. 违规举报与取证保留表 (reports)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id` VARCHAR(36) NOT NULL,
  `room_id` VARCHAR(36) NOT NULL,
  `reporter_id` VARCHAR(36) NOT NULL,
  `reported_id` VARCHAR(36) NOT NULL,
  `category` VARCHAR(32) NOT NULL COMMENT 'harassment | illegal_or_nsfw | spam_or_scam | other',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `retain_until` DATETIME(3) NOT NULL COMMENT '证据保留截止时间（默认 +14 天）',
  PRIMARY KEY (`id`),
  KEY `idx_reports_retain_until` (`retain_until`),
  CONSTRAINT `fk_reports_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='举报记录与证据保留表';
